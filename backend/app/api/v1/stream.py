"""Server-Sent Events (SSE) streaming endpoint for real-time graph updates."""

import asyncio
import json
import logging
from collections.abc import AsyncGenerator

from app.db.models import Device, Incident, Link, utcnow
from app.db.session import AsyncSessionLocal
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
                    devs = [
                        {"id": r[0], "status": r[1], "status_since": r[2].isoformat() if r[2] else None}
                        for r in dev_res.all()
                    ]

                    # Query links status
                    lnk_res = await session.execute(select(Link.id, Link.status))
                    links = [{"id": r[0], "status": r[1]} for r in lnk_res.all()]

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
                            "started_at": active_inc.started_at.isoformat() if active_inc.started_at else None,
                        }

                    payload = {
                        "ts": utcnow().isoformat(),
                        "devices": devs,
                        "links": links,
                        "active_incident": inc_data,
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
