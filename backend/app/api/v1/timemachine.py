"""Time Machine historical playback and state snapshot API."""

import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from app.db.models import Device, Event, Incident, Observation, to_utc_iso
from app.db.session import get_db
from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("netsentinel.timemachine")
router = APIRouter(prefix="/timemachine", tags=["Time Machine"])


@router.get("/snapshot")
async def get_historical_snapshot(
    target_time: datetime = Query(..., description="Timestamp storico nel passato (ISO 8601)"),
    device_id: str | None = Query(None, description="ID apparato specifico target (es. da log evento)"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Retrieve historical state of the entire network as it was at target_time."""
    try:
        # Normalize to UTC naive timestamp
        if target_time.tzinfo is not None:
            t_clean = target_time.astimezone(UTC).replace(tzinfo=None)
        else:
            t_clean = target_time

        # 1. Fetch devices current list
        dev_res = await db.execute(select(Device))
        devices = dev_res.scalars().all()
        if not devices:
            return {
                "target_time": to_utc_iso(t_clean),
                "active_incident": None,
                "devices": [],
            }


        # 2. Check which incident was open at target_time
        inc_res = await db.execute(
            select(Incident)
            .where(Incident.started_at <= t_clean)
            .where((Incident.resolved_at.is_(None)) | (Incident.resolved_at >= t_clean))
            .order_by(desc(Incident.started_at))
        )
        active_incident = inc_res.scalar_one_or_none()

        # 3. Fetch closest observations and state events around target_time
        historical_devices = []
        for d in devices:
            # A) Check the last observation for this device up to target_time
            obs_res = await db.execute(
                select(Observation)
                .where(Observation.device_id == d.id)
                .where(Observation.ts <= t_clean)
                .order_by(desc(Observation.ts))
                .limit(1)
            )
            last_obs = obs_res.scalar_one_or_none()

            # B) Check the last discrete state event for this device up to target_time
            # Match either by device_id OR by device name in title/message (to catch controller & flap events)
            last_ev_res = await db.execute(
                select(Event)
                .where(
                    (Event.device_id == d.id)
                    | (Event.title.ilike(f"%{d.name}%"))
                    | (Event.message.ilike(f"%{d.name}%"))
                )
                .where(Event.ts <= t_clean)
                .order_by(desc(Event.ts))
                .limit(1)
            )
            last_ev = last_ev_res.scalar_one_or_none()

            status = None

            if last_ev:
                title_upper = (last_ev.title or "").upper()
                msg_upper = (last_ev.message or "").upper()
                if last_ev.event_type == "device_state_change" and last_ev.details_json:
                    try:
                        ev_details = json.loads(last_ev.details_json)
                        status = ev_details.get("new_status")
                    except Exception:
                        pass
                elif last_ev.event_type == "check_state_change":
                    if last_ev.severity == "crit":
                        status = "down"
                    elif last_ev.severity == "warn":
                        status = "degraded"
                    elif "OK" in title_upper or "RIPRISTINATO" in title_upper:
                        status = "ok"

                # Check title/message heuristics if status not clearly set or to handle FLAPPING/DOWN
                if not status or status in ["unknown", "flapping"]:
                    text_to_check = f"{title_upper} {msg_upper}"
                    if "-> DOWN" in text_to_check or "OFFLINE" in text_to_check or "FALLITO" in text_to_check:
                        status = "down"
                    elif "-> OK" in text_to_check or "ONLINE" in text_to_check or "RIPRISTINATO" in text_to_check:
                        status = "ok"
                    elif "-> DEGRADED" in text_to_check or "-> WARN" in text_to_check:
                        status = "degraded"
                    elif last_ev.severity == "crit":
                        status = "down"
                    elif last_ev.severity == "warn":
                        status = "degraded"

            # Check Observation if no event status found, OR if last_obs is strictly newer than last_ev
            if last_obs:
                obs_status_norm = "down" if last_obs.status in ["crit", "down"] else ("degraded" if last_obs.status == "warn" else "ok")
                if not status:
                    status = obs_status_norm
                elif last_ev and last_obs.ts >= last_ev.ts:
                    status = obs_status_norm

            # Fallback to current device status if no historical records exist
            if not status:
                status = d.status

            # If an incident was active at target_time and this device was the root cause:
            if active_incident and active_incident.root_cause_device_id == d.id:
                status = "down"

            # Normalize raw status: flapping, crit, down, unreachable all map to "down" (red node with offline glow)
            if status in ["crit", "down", "unreachable", "flapping"]:
                status = "down"
            elif status in ["warn", "degraded"]:
                status = "degraded"

            historical_devices.append({
                "id": d.id,
                "name": d.name,
                "kind": d.kind,
                "status": status,
                "last_metric": last_obs.value if last_obs else None,
                "observation_ts": to_utc_iso(last_obs.ts) if last_obs else None,
            })

        inc_data = None
        if active_incident:
            impacted_list = json.loads(active_incident.impacted_json) if active_incident.impacted_json else []
            evidence_list = json.loads(active_incident.evidence_json) if active_incident.evidence_json else []
            recommendations_list = json.loads(active_incident.recommendations_json) if active_incident.recommendations_json else []
            timeline_list = json.loads(active_incident.timeline_json) if active_incident.timeline_json else []

            # If device is impacted and wasn't marked down, mark status as affected
            for hd in historical_devices:
                if hd["id"] in impacted_list and hd["status"] == "ok":
                    hd["status"] = "affected"

            inc_data = {
                "id": active_incident.id,
                "status": active_incident.status,
                "root_cause_device_id": active_incident.root_cause_device_id,
                "root_cause_category": active_incident.root_cause_category,
                "confidence": active_incident.confidence,
                "summary": active_incident.summary,
                "impacted": impacted_list,
                "evidence": evidence_list,
                "recommendations": recommendations_list,
                "timeline": timeline_list,
                "started_at": to_utc_iso(active_incident.started_at),
                "resolved_at": to_utc_iso(active_incident.resolved_at),
            }

        # 4. Fetch discrete events around target_time (+/- 15 minutes window)
        events_stmt = (
            select(Event, Device)
            .outerjoin(Device, Event.device_id == Device.id)
            .where(Event.ts >= t_clean - timedelta(minutes=15))
            .where(Event.ts <= t_clean + timedelta(minutes=5))
            .order_by(desc(Event.ts))
            .limit(10)
        )
        ev_res = await db.execute(events_stmt)
        events_rows = ev_res.all()
        events_around = []
        for ev, dev in events_rows:
            dev_ip = None
            if dev and dev.addresses_json:
                try:
                    dev_ip = json.loads(dev.addresses_json).get("ip")
                except Exception:
                    pass
            events_around.append({
                "id": ev.id,
                "ts": to_utc_iso(ev.ts),
                "device_id": ev.device_id,
                "device_name": dev.name if dev else None,
                "device_ip": dev_ip,
                "device_kind": dev.kind if dev else None,
                "event_type": ev.event_type,
                "severity": ev.severity,
                "title": ev.title,
                "message": ev.message,
                "details": json.loads(ev.details_json) if ev.details_json else {},
            })

        return {
            "target_time": to_utc_iso(t_clean),
            "active_incident": inc_data,
            "devices": historical_devices,
            "events_around": events_around,
        }
    except Exception as e:
        logger.warning("Errore durante il recupero dello snapshot storico: %s", e)
        return {
            "target_time": to_utc_iso(target_time) if hasattr(target_time, "isoformat") else str(target_time),
            "active_incident": None,
            "devices": [],
        }

