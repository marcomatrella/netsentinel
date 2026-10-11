"""Time Machine historical playback and state snapshot API."""

from datetime import datetime
from typing import Any

from app.db.models import Device, Incident, Observation
from app.db.session import get_db
from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/timemachine", tags=["Time Machine"])


@router.get("/snapshot")
async def get_historical_snapshot(
    target_time: datetime = Query(..., description="Timestamp storico nel passato (ISO 8601)"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Retrieve historical state of the entire network as it was at target_time."""
    # Ensure tz-naive UTC
    t_clean = target_time.replace(tzinfo=None)

    # 1. Fetch devices current list
    dev_res = await db.execute(select(Device))
    devices = dev_res.scalars().all()

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

        status = last_obs.status if last_obs else d.status
        # If an incident was active and this device is root cause:
        if active_incident and active_incident.root_cause_device_id == d.id:
            status = "down"

        historical_devices.append({
            "id": d.id,
            "name": d.name,
            "kind": d.kind,
            "status": status,
            "last_metric": last_obs.value if last_obs else None,
            "observation_ts": last_obs.ts.isoformat() if last_obs else None,
        })

    inc_data = None
    if active_incident:
        inc_data = {
            "id": active_incident.id,
            "status": active_incident.status,
            "root_cause_device_id": active_incident.root_cause_device_id,
            "root_cause_category": active_incident.root_cause_category,
            "confidence": active_incident.confidence,
            "summary": active_incident.summary,
            "started_at": active_incident.started_at.isoformat(),
            "resolved_at": active_incident.resolved_at.isoformat() if active_incident.resolved_at else None,
        }

    return {
        "target_time": t_clean.isoformat(),
        "active_incident": inc_data,
        "devices": historical_devices,
    }
