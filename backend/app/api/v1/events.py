"""Events REST API endpoints."""

import json

from app.db.models import Device, Event
from app.db.session import get_db
from app.schemas.entities import EventRead
from fastapi import APIRouter, Depends
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/events", tags=["Events"])


@router.get("", response_model=list[EventRead], summary="Cronologia eventi di sistema")
async def list_events(
    device_id: str | None = None,
    event_type: str | None = None,
    severity: str | None = None,
    search: str | None = None,
    limit: int = 150,
    db: AsyncSession = Depends(get_db),
) -> list[EventRead]:
    """Retrieve discrete events (reboots, flapping, state changes) ordered chronologically descending."""
    stmt = (
        select(Event, Device)
        .outerjoin(Device, Event.device_id == Device.id)
        .order_by(desc(Event.ts))
        .limit(min(limit, 500))
    )
    if device_id:
        stmt = stmt.where(Event.device_id == device_id)
    if event_type:
        stmt = stmt.where(Event.event_type == event_type)
    if severity:
        stmt = stmt.where(Event.severity == severity)
    if search:
        search_filter = f"%{search}%"
        stmt = stmt.where(
            or_(
                Event.title.ilike(search_filter),
                Event.message.ilike(search_filter),
                Event.event_type.ilike(search_filter),
                Device.name.ilike(search_filter),
            )
        )

    res = await db.execute(stmt)
    rows = res.all()

    items = []
    for ev, dev in rows:
        dev_ip = None
        if dev and dev.addresses_json:
            try:
                addrs = json.loads(dev.addresses_json)
                dev_ip = addrs.get("ip")
            except Exception:
                pass

        items.append(
            EventRead(
                id=ev.id,
                ts=ev.ts,
                device_id=ev.device_id,
                device_name=dev.name if dev else None,
                device_ip=dev_ip,
                device_kind=dev.kind if dev else None,
                check_id=ev.check_id,
                event_type=ev.event_type,
                severity=ev.severity,
                title=ev.title,
                message=ev.message,
                details=json.loads(ev.details_json) if ev.details_json else {},
            )
        )

    return items
