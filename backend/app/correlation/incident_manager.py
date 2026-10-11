"""Incident lifecycle manager ensuring single incident per root cause without alert storms."""

import json
import logging
from typing import Any

from app.db.models import Event, Incident, utcnow
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("netsentinel.incident_manager")


class IncidentManager:
    """Manages creation, aggregation, update and resolution of correlated incidents."""

    async def get_active_incident_for_device(
        self,
        session: AsyncSession,
        root_cause_device_id: str | None,
    ) -> Incident | None:
        """Find any existing open incident matching the root cause device or overlapping symptoms."""
        stmt = (
            select(Incident)
            .where(Incident.status.in_(["open", "monitoring"]))
            .order_by(desc(Incident.started_at))
        )
        res = await session.execute(stmt)
        active_incidents = res.scalars().all()

        for inc in active_incidents:
            if inc.root_cause_device_id == root_cause_device_id:
                return inc
            # Also check if candidate device is listed in impacted list
            impacted = json.loads(inc.impacted_json) if inc.impacted_json else []
            if root_cause_device_id in impacted:
                return inc

        return None

    async def create_or_update_incident(
        self,
        session: AsyncSession,
        root_cause_device_id: str | None,
        root_cause_category: str,
        confidence: float,
        summary: str,
        evidence: list[dict[str, Any]],
        impacted: list[str],
        recommendations: list[str],
        alternative_hypotheses: list[dict[str, Any]],
    ) -> Incident:
        """Create new incident or update existing active one, avoiding duplicate incidents."""
        incident = await self.get_active_incident_for_device(session, root_cause_device_id)

        now = utcnow()
        if not incident:
            # Check if there is ANY open incident with overlapping impacted devices
            stmt = select(Incident).where(Incident.status.in_(["open", "monitoring"]))
            res = await session.execute(stmt)
            open_incs = res.scalars().all()
            for o_inc in open_incs:
                o_impacted = set(json.loads(o_inc.impacted_json) if o_inc.impacted_json else [])
                if o_impacted.intersection(set(impacted)):
                    incident = o_inc
                    break

        if not incident:
            # Create fresh Incident
            inc_id = f"inc-{int(now.timestamp())}-{root_cause_device_id or 'net'}"
            initial_timeline = [
                {
                    "ts": now.isoformat(),
                    "event_type": "incident_opened",
                    "message": f"Incidente aperto: {summary}",
                    "device_id": root_cause_device_id,
                }
            ]

            incident = Incident(
                id=inc_id,
                status="open",
                started_at=now,
                root_cause_device_id=root_cause_device_id,
                root_cause_category=root_cause_category,
                confidence=confidence,
                summary=summary,
                evidence_json=json.dumps(evidence),
                impacted_json=json.dumps(impacted),
                timeline_json=json.dumps(initial_timeline),
                recommendations_json=json.dumps(recommendations),
                alternative_hypotheses_json=json.dumps(alternative_hypotheses),
            )
            session.add(incident)
            ev_inc = Event(
                ts=now,
                device_id=root_cause_device_id,
                event_type="incident_opened",
                severity="crit",
                title=f"Incidente Aperto: {root_cause_device_id or 'Rete'}",
                message=summary,
                details_json=json.dumps({
                    "incident_id": inc_id,
                    "confidence": confidence,
                    "category": root_cause_category,
                    "impacted": impacted,
                }),
            )
            session.add(ev_inc)
            logger.info("Creato nuovo incidente: %s (Causa radice: %s)", inc_id, root_cause_device_id)
        else:
            # Update existing incident
            timeline = json.loads(incident.timeline_json) if incident.timeline_json else []
            # If root cause changed, log shift
            if incident.root_cause_device_id != root_cause_device_id:
                timeline.append({
                    "ts": now.isoformat(),
                    "event_type": "root_cause_shift",
                    "message": f"Causa radice aggiornata da '{incident.root_cause_device_id}' a '{root_cause_device_id}'.",
                    "device_id": root_cause_device_id,
                })
                ev_shift = Event(
                    ts=now,
                    device_id=root_cause_device_id,
                    event_type="root_cause_shift",
                    severity="warn",
                    title="Causa Radice Aggiornata",
                    message=f"La causa radice dell'incidente è passata a '{root_cause_device_id}'.",
                    details_json=json.dumps({
                        "incident_id": incident.id,
                        "old_root_cause": incident.root_cause_device_id,
                        "new_root_cause": root_cause_device_id,
                    }),
                )
                session.add(ev_shift)
                incident.root_cause_device_id = root_cause_device_id
                incident.root_cause_category = root_cause_category

            incident.confidence = confidence
            incident.summary = summary
            incident.evidence_json = json.dumps(evidence)
            incident.impacted_json = json.dumps(list(set(impacted)))
            incident.recommendations_json = json.dumps(recommendations)
            incident.alternative_hypotheses_json = json.dumps(alternative_hypotheses)
            incident.timeline_json = json.dumps(timeline)

        await session.commit()
        await session.refresh(incident)

        # Dispatch notification
        try:
            from app.notification.manager import notification_manager
            is_new = (not incident or incident.timeline_json and "incident_opened" in incident.timeline_json and len(json.loads(incident.timeline_json)) == 1)
            is_shift = (incident.timeline_json and "root_cause_shift" in incident.timeline_json and json.loads(incident.timeline_json)[-1]["event_type"] == "root_cause_shift")
            if is_new or is_shift:
                await notification_manager.notify_incident(incident, is_resolved=False, is_shift=is_shift)
        except Exception as exc:
            logger.warning("Errore trigger notifiche incidente: %s", exc)

        return incident

    async def resolve_incident(self, session: AsyncSession, incident_id: str) -> Incident | None:
        """Mark incident as resolved when all devices recover."""
        incident = await session.get(Incident, incident_id)
        if not incident or incident.status == "resolved":
            return incident

        now = utcnow()
        incident.status = "resolved"
        incident.resolved_at = now

        timeline = json.loads(incident.timeline_json) if incident.timeline_json else []
        duration_s = int((now - incident.started_at).total_seconds())
        timeline.append({
            "ts": now.isoformat(),
            "event_type": "incident_resolved",
            "message": f"Tutti gli apparati e servizi sono rientrati. Durata totale incidente: {duration_s} secondi.",
        })
        incident.timeline_json = json.dumps(timeline)

        ev_res = Event(
            ts=now,
            device_id=incident.root_cause_device_id,
            event_type="incident_resolved",
            severity="info",
            title="Incidente Risolto",
            message=f"Tutti gli apparati e servizi sono rientrati. Durata totale incidente: {duration_s} secondi.",
            details_json=json.dumps({
                "incident_id": incident.id,
                "duration_seconds": duration_s,
            }),
        )
        session.add(ev_res)

        await session.commit()
        await session.refresh(incident)
        logger.info("Incidente risolto: %s (Durata: %ds)", incident.id, duration_s)

        # Dispatch resolution notification
        try:
            from app.notification.manager import notification_manager
            await notification_manager.notify_incident(incident, is_resolved=True, is_shift=False)
        except Exception as exc:
            logger.warning("Errore trigger notifica risoluzione incidente: %s", exc)

        return incident


incident_manager = IncidentManager()
