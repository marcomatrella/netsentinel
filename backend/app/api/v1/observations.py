"""Observations REST API endpoints."""

import json
from datetime import datetime

from app.db.models import Observation
from app.db.session import get_db
from app.schemas.entities import ObservationRead
from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/observations", tags=["Observations"])


@router.get("", response_model=list[ObservationRead], summary="Elenco osservazioni e metriche")
async def list_observations(
    device_id: str | None = None,
    check_id: str | None = None,
    since: datetime | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
) -> list[ObservationRead]:
    """Retrieve raw observations filtered by device, check, or time window."""
    stmt = select(Observation).order_by(desc(Observation.ts)).limit(min(limit, 1000))
    if device_id:
        stmt = stmt.where(Observation.device_id == device_id)
    if check_id:
        stmt = stmt.where(Observation.check_id == check_id)
    if since:
        stmt = stmt.where(Observation.ts >= since)

    res = await db.execute(stmt)
    records = res.scalars().all()

    return [
        ObservationRead(
            id=r.id,
            ts=r.ts,
            device_id=r.device_id,
            check_id=r.check_id,
            status=r.status,
            value=r.value,
            details=json.loads(r.details_json) if r.details_json else {},
        )
        for r in records
    ]
