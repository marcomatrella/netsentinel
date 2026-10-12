"""Server-Sent Events (SSE) streaming endpoint for real-time graph updates."""

import asyncio
import json
import logging
from collections.abc import AsyncGenerator

from app.db.models import (
    Device,
    Incident,
    Link,
    Observation,
    ScheduledMaintenanceWindow,
    to_utc_iso,
    utcnow,
)
from app.db.session import AsyncSessionLocal
from app.state.maintenance import maintenance_tracker
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, select

logger = logging.getLogger("netsentinel.api.stream")
router = APIRouter(prefix="/stream", tags=["Streaming"])


async def event_generator() -> AsyncGenerator[str, None]:
    """Yield incremental graph state diffs and heartbeats via Server-Sent Events."""
    logger.debug("Nuovo client SSE connesso.")
    try:
        while True:
            try:
                async with AsyncSessionLocal() as session:
                    # Query current devices status
                    dev_res = await session.execute(select(Device.id, Device.status, Device.status_since))
                    db_devs = dev_res.all()

                    # Query latest observation RTT for each device
                    rtt_map: dict[str, float] = {}
                    for d_row in db_devs:
                        obs_res = await session.execute(
                            select(Observation.value)
                            .where(Observation.device_id == d_row[0], Observation.status == "ok", Observation.value.isnot(None))
                            .order_by(desc(Observation.ts))
                            .limit(1)
                        )
                        val = obs_res.scalar_one_or_none()
                        if val is not None:
                            rtt_map[d_row[0]] = round(val, 1)

                    devs = [
                        {
                            "id": r[0],
                            "status": r[1],
                            "status_since": to_utc_iso(r[2]),
                            "rtt_ms": rtt_map.get(r[0]),
                        }
                        for r in db_devs
                    ]

                    # Deduce live link statuses
                    dev_status_map = {r[0]: r[1] for r in db_devs}
                    lnk_res = await session.execute(select(Link.id, Link.from_device_id, Link.to_device_id))
                    links = []
                    for l_row in lnk_res.all():
                        s_status = dev_status_map.get(l_row[1], "unknown")
                        d_status = dev_status_map.get(l_row[2], "unknown")
                        if s_status == "down" or d_status == "down":
                            l_st = "down"
                        elif s_status == "unreachable" or d_status == "unreachable":
                            l_st = "unreachable"
                        elif s_status in ["degraded", "flapping"] or d_status in ["degraded", "flapping"]:
                            l_st = "degraded"
                        elif s_status == "ok" and d_status == "ok":
                            l_st = "ok"
                        else:
                            l_st = "unverified"
                        links.append({"id": l_row[0], "status": l_st})

                    # Query active incident
                    inc_res = await session.execute(
                        select(Incident).where(Incident.status.in_(["open", "monitoring"])).order_by(desc(Incident.started_at)).limit(1)
                    )
                    active_inc = inc_res.scalar_one_or_none()

                    inc_data = None
                    if active_inc:
                        inc_data = {
                            "id": active_inc.id,
                            "status": active_inc.status,
                            "root_cause_device_id": active_inc.root_cause_device_id,
                            "root_cause_category": active_inc.root_cause_category,
                            "confidence": active_inc.confidence,
                            "summary": active_inc.summary,
                            "started_at": to_utc_iso(active_inc.started_at),
                        }

                    # Query active maintenance windows
                    now_utc = utcnow()
                    maint_stmt = select(ScheduledMaintenanceWindow).where(
                        ScheduledMaintenanceWindow.enabled.is_(True),
                        ScheduledMaintenanceWindow.start_ts <= now_utc,
                        ScheduledMaintenanceWindow.end_ts >= now_utc,
                    )
                    maint_res = await session.execute(maint_stmt)
                    active_windows = maint_res.scalars().all()

                    global_maint = None
                    active_device_maint = []
                    for w in active_windows:
                        w_info = {
                            "id": w.id,
                            "title": w.title,
                            "device_id": w.device_id,
                            "start_ts": to_utc_iso(w.start_ts),
                            "end_ts": to_utc_iso(w.end_ts),
                            "notes": w.notes,
                        }
                        if w.device_id is None:
                            global_maint = w_info
                        else:
                            active_device_maint.append(w_info)

                    if maintenance_tracker.is_active() and not global_maint:
                        global_maint = {
                            "id": "manual-global",
                            "title": "Manutenzione Manuale Globale",
                            "device_id": None,
                            "start_ts": to_utc_iso(now_utc),
                            "end_ts": to_utc_iso(maintenance_tracker.until) if maintenance_tracker.until else None,
                            "notes": maintenance_tracker.notes,
                        }

                    payload = {
                        "ts": to_utc_iso(utcnow()),
                        "devices": devs,
                        "links": links,
                        "active_incident": inc_data,
                        "maintenance": {
                            "is_global_active": global_maint is not None,
                            "global_window": global_maint,
                            "active_device_windows": active_device_maint,
                        },
                    }

                    yield f"event: status_diff\ndata: {json.dumps(payload)}\n\n"

            except Exception as exc:
                logger.error("Errore generazione frame SSE: %s", exc)
                yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"

            # Sleep between updates (SSE push interval)
            await asyncio.sleep(2.0)

    except asyncio.CancelledError:
        logger.debug("Client SSE disconnesso.")


@router.get("", response_class=StreamingResponse)
async def stream_graph_updates():
    """Stream incremental graph status updates and incident events to the frontend."""
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
