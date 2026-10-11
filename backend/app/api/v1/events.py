"""Events REST API endpoints."""

import json

from app.db.models import Event
from app.db.session import get_db
from app.schemas.entities import EventRead
from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/events", tags=["Events"])


@router.get("", response_model=list[EventRead], summary="Cronologia eventi di sistema")
async def list_events(
    device_id: str | None = None,
    event_type: str | None = None,
    severity: str | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
) -> list[EventRead]:
    """Retrieve discrete events (reboots, flapping, state changes) ordered chronologically descending."""
    stmt = select(Event).order_by(desc(Event.ts)).limit(min(limit, 500))
    if device_id:
        stmt = stmt.where(Event.device_id == device_id)
    if event_type:
        stmt = stmt.where(Event.event_type == event_type)
    if severity:
        stmt = stmt.where(Event.severity == severity)

    res = await db.execute(stmt)
    records = res.scalars().all()

    return [
        EventRead(
            id=r.id,
            ts=r.ts,
            device_id=r.device_id,
            check_id=r.check_id,
            event_type=r.event_type,
            severity=r.severity,
            title=r.title,
            message=r.message,
            details=json.loads(r.details_json) if r.details_json else {},
        )
        for r in records
    ]
