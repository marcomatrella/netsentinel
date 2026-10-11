"""Time Machine historical playback and state snapshot API."""

import json
import logging
from datetime import UTC, datetime
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

        # 3. Fetch closest observations around target_time
        historical_devices = []
        for d in devices:
            # Check last observation for this device up to target_time
            obs_res = await db.execute(
                select(Observation)
                .where(Observation.device_id == d.id)
                .where(Observation.ts <= t_clean)
                .order_by(desc(Observation.ts))
                .limit(1)
            )
            last_obs = obs_res.scalar_one_or_none()

            # Determine exact device status at target_time by checking the last device_state_change event
            ev_status_res = await db.execute(
                select(Event)
                .where(Event.device_id == d.id)
                .where(Event.event_type == "device_state_change")
                .where(Event.ts <= t_clean)
                .order_by(desc(Event.ts))
                .limit(1)
            )
            last_ev = ev_status_res.scalar_one_or_none()

            if last_ev and last_ev.details_json:
                try:
                    ev_details = json.loads(last_ev.details_json)
                    status = ev_details.get("new_status") or "ok"
                except Exception:
                    status = last_obs.status if last_obs else d.status
            elif last_obs:
                # Fallback: if last observation was crit, mark as down
                status = "down" if last_obs.status in ["crit", "down"] else ("degraded" if last_obs.status == "warn" else "ok")
            else:
                status = d.status

            # If an incident was active and this device is root cause:
            if active_incident and active_incident.root_cause_device_id == d.id:
                status = "down"

            # Normalize raw observation status
            if status == "crit":
                status = "down"

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

        # 4. Fetch discrete events around target_time
        events_stmt = (
            select(Event, Device)
            .outerjoin(Device, Event.device_id == Device.id)
            .where(Event.ts <= t_clean)
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

