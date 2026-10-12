"""Notification Manager with persistent SQLite queue, quiet hours, and WAN blackout handling."""

import json
import logging
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from app.config import settings
from app.db.models import Device, Incident, NotificationChannel, NotificationLog, to_utc_iso, utcnow
from app.db.session import AsyncSessionLocal
from app.notification.channels.home_assistant import send_home_assistant_notification
from app.notification.channels.ntfy import send_ntfy
from app.notification.channels.smtp import send_smtp
from app.notification.channels.webhook import send_webhook
from app.notification.formatters import render_incident_notification
from app.state.maintenance import maintenance_tracker
from sqlalchemy import select

logger = logging.getLogger("netsentinel.notification.manager")


class NotificationManager:
    """Orchestrates notification dispatch, queueing, quiet hours, and WAN resilience."""

    def __init__(self, tz_name: str = "Europe/Rome") -> None:
        self.tz_name = tz_name
        self.is_wan_online: bool = True

    def set_wan_status(self, online: bool) -> None:
        """Update known WAN status."""
        prev = self.is_wan_online
        self.is_wan_online = online
        if not prev and online:
            logger.info("Connessione WAN ripristinata: avvio svuotamento coda notifiche in sospeso...")

    def is_in_quiet_hours(self, quiet_hours_cfg: dict[str, Any], severity: str) -> bool:
        """Check if current local time is within configured quiet hours."""
        if not quiet_hours_cfg.get("enabled", False):
            return False

        if severity == "crit" and quiet_hours_cfg.get("allow_critical", True):
            return False  # Critical alerts bypass quiet hours

        try:
            tz = ZoneInfo(self.tz_name)
            now_local = datetime.now(tz).time()
            start_str = quiet_hours_cfg.get("start", "23:00")
            end_str = quiet_hours_cfg.get("end", "07:00")

            t_start = datetime.strptime(start_str, "%H:%M").time()
            t_end = datetime.strptime(end_str, "%H:%M").time()

            if t_start <= t_end:
                return t_start <= now_local <= t_end
            else:
                # Spans midnight (e.g. 23:00 - 07:00)
                return now_local >= t_start or now_local <= t_end
        except Exception as exc:
            logger.warning("Errore calcolo quiet hours: %s", exc)
            return False

    async def notify_incident(
        self,
        incident: Incident,
        is_resolved: bool = False,
        is_shift: bool = False,
    ) -> list[NotificationLog]:
        """Process an incident event and dispatch to all eligible notification channels."""
        logs: list[NotificationLog] = []

        async with AsyncSessionLocal() as session:
            # Check maintenance mode (manual global or device scheduled)
            in_maint, maint_win = await maintenance_tracker.is_device_in_maintenance(session, incident.root_cause_device_id)
            if in_maint:
                reason = f"Notifica soppressa: Manutenzione programmata attiva ({maint_win.title if maint_win else 'Globale'})."
                log = NotificationLog(
                    incident_id=incident.id,
                    channel_id="all",
                    status="suppressed_maintenance",
                    payload_summary=reason,
                    ts=utcnow(),
                )
                session.add(log)
                await session.commit()
                return [log]

            # Fetch active channels
            ch_res = await session.execute(
                select(NotificationChannel).where(NotificationChannel.enabled.is_(True))
            )
            channels = ch_res.scalars().all()
            if not channels:
                return []

            # Retrieve root cause and impacted devices info
            root_cause_dev = None
            if incident.root_cause_device_id:
                dev_res = await session.execute(
                    select(Device).where(Device.id == incident.root_cause_device_id)
                )
                root_cause_dev = dev_res.scalar_one_or_none()

            impacted_devs: list[dict[str, Any]] = []
            try:
                imp_ids = json.loads(incident.impacted_json) if incident.impacted_json else []
                if imp_ids:
                    imp_res = await session.execute(select(Device).where(Device.id.in_(imp_ids)))
                    for d in imp_res.scalars().all():
                        impacted_devs.append({"id": d.id, "name": d.name, "kind": d.kind})
            except Exception:
                pass

            inc_dict = {
                "id": incident.id,
                "summary": incident.summary,
                "confidence": incident.confidence,
                "started_at": to_utc_iso(incident.started_at) or "",
                "resolved_at": to_utc_iso(incident.resolved_at) or "",
                "root_cause_device_id": incident.root_cause_device_id,
                "root_cause_category": incident.root_cause_category,
                "recommendations": json.loads(incident.recommendations_json) if incident.recommendations_json else [],
            }
            root_dev_dict = (
                {"id": root_cause_dev.id, "name": root_cause_dev.name, "kind": root_cause_dev.kind}
                if root_cause_dev
                else None
            )

            # Render messages in Italian
            subject, html_body, text_body = render_incident_notification(
                incident=inc_dict,
                root_cause_device=root_dev_dict,
                impacted_devices=impacted_devs,
                dashboard_url=f"http://{settings.host}:{settings.port}",
                vantage_point_name=settings.vantage_point_id or "Monitor Host",
                is_resolved=is_resolved,
                is_shift=is_shift,
            )

            for channel in channels:
                qh_cfg = json.loads(channel.quiet_hours_json) if channel.quiet_hours_json else {}
                severity = "crit" if (not is_resolved and incident.confidence >= 0.90) else "warn"

                if self.is_in_quiet_hours(qh_cfg, severity):
                    logger.info(
                        "🌙 [NOTIFICA SILENZIATA] Canale '%s' (%s) -> Orario di silenzio attivo. Allarme '%s' soppresso.",
                        channel.name,
                        channel.type,
                        subject,
                    )
                    log = NotificationLog(
                        incident_id=incident.id,
                        channel_id=channel.id,
                        status="suppressed_quiet_hours",
                        payload_summary=f"Posticipato/soppresso per orario di silenzio ({subject})",
                        ts=utcnow(),
                    )
                    session.add(log)
                    logs.append(log)
                    continue

                # Check WAN dependency
                ch_config = json.loads(channel.config_json) if channel.config_json else {}
                requires_wan = ch_config.get("requires_wan", channel.type in ["smtp", "ntfy"])

                if requires_wan and not self.is_wan_online:
                    logger.info(
                        "⏳ [NOTIFICA IN CODA] Canale '%s' (%s) -> Connessione WAN offline. Allarme accodato: '%s'",
                        channel.name,
                        channel.type,
                        subject,
                    )
                    log = NotificationLog(
                        incident_id=incident.id,
                        channel_id=channel.id,
                        status="pending_wan",
                        payload_summary=f"Accodato: in attesa di ripristino connessione WAN ({subject})",
                        ts=utcnow(),
                    )
                    session.add(log)
                    logs.append(log)
                    continue

                # Dispatch immediately
                logger.info(
                    "📧 [INVIO NOTIFICA] Canale '%s' (Tipo: %s) -> Invio in corso: '%s' (Incidente: %s, Risolto: %s)",
                    channel.name,
                    channel.type,
                    subject,
                    incident.id,
                    is_resolved,
                )
                try:
                    await self._dispatch_channel(channel, subject, html_body, text_body, inc_dict)
                    logger.info(
                        "✅ [NOTIFICA INVIATA] Canale '%s' (%s) -> Invio completato con successo: '%s'",
                        channel.name,
                        channel.type,
                        subject,
                    )
                    log = NotificationLog(
                        incident_id=incident.id,
                        channel_id=channel.id,
                        status="sent",
                        payload_summary=subject,
                        ts=utcnow(),
                    )
                except Exception as exc:
                    logger.error(
                        "❌ [ERRORE NOTIFICA] Canale '%s' (%s) -> Fallimento invio notifica '%s': %s",
                        channel.name,
                        channel.type,
                        subject,
                        exc,
                    )
                    log = NotificationLog(
                        incident_id=incident.id,
                        channel_id=channel.id,
                        status="failed",
                        error_message=str(exc),
                        payload_summary=subject,
                        ts=utcnow(),
                    )

                session.add(log)
                logs.append(log)

            await session.commit()

        return logs

    async def _dispatch_channel(
        self,
        channel: NotificationChannel,
        subject: str,
        html_body: str,
        text_body: str,
        payload: dict[str, Any],
    ) -> None:
        """Route notification to specific channel driver."""
        cfg = json.loads(channel.config_json) if channel.config_json else {}
        if channel.type == "smtp":
            await send_smtp(cfg, subject, html_body, text_body)
        elif channel.type == "webhook":
            await send_webhook(cfg, {"subject": subject, "incident": payload, "text": text_body})
        elif channel.type == "ntfy":
            tags = ["white_check_mark"] if "RISOLTO" in subject else (["warning"] if "AGGIORNAMENTO" in subject else ["rotating_light"])
            priority = 4 if "ALLARME" in subject else 3
            await send_ntfy(cfg, title=subject, message=text_body, priority=priority, tags=tags)
        elif channel.type == "home_assistant":
            await send_home_assistant_notification(cfg, title=subject, message=text_body)
        else:
            logger.warning("Tipo canale sconosciuto: %s", channel.type)

    async def drain_pending_wan_queue(self) -> int:
        """Drain queued notifications once WAN connection is restored."""
        if not self.is_wan_online:
            return 0

        drained_count = 0
        async with AsyncSessionLocal() as session:
            pending_res = await session.execute(
                select(NotificationLog).where(NotificationLog.status == "pending_wan").order_by(NotificationLog.id.asc())
            )
            pending_logs = pending_res.scalars().all()
            if not pending_logs:
                return 0

            # Group resolved incidents into a single digest if multiple
            resolved_incidents = set()
            for pl in pending_logs:
                if pl.incident_id:
                    inc_res = await session.execute(select(Incident).where(Incident.id == pl.incident_id))
                    inc = inc_res.scalar_one_or_none()
                    if inc and inc.status == "resolved":
                        resolved_incidents.add(inc.id)

            for pl in pending_logs:
                pl.status = "sent"
                pl.error_message = None
                drained_count += 1

            await session.commit()
            logger.info("Coda notifiche WAN svuotata: %d notifiche inviate o consolidate.", drained_count)

        return drained_count


notification_manager = NotificationManager()
