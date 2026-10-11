"""Dead-man's switch heartbeat REST API endpoints."""

from typing import Any

from app.config import settings
from app.heartbeat.client import heartbeat_client
from app.heartbeat.watchdog import watchdog
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/heartbeat", tags=["Heartbeat"])


class HeartbeatPingRequest(BaseModel):
    url: str | None = None


@router.get("/status")
async def get_heartbeat_status() -> dict[str, Any]:
    """Retrieve current watchdog health check and external heartbeat configuration."""
    healthy, details = await watchdog.evaluate_health()
    return {
        "healthy": healthy,
        "watchdog_details": details,
        "configured_url": settings.heartbeat_url,
        "interval_seconds": settings.heartbeat_interval_seconds,
        "last_ping_status": heartbeat_client.last_ping_status,
        "last_ping_time": heartbeat_client.last_ping_time,
    }


@router.post("/ping-now")
async def ping_now(payload: HeartbeatPingRequest | None = None) -> dict[str, Any]:
    """Trigger an immediate heartbeat ping test."""
    url = payload.url if payload else None
    success, msg = await heartbeat_client.send_ping(force_url=url)
    return {"success": success, "message": msg}
