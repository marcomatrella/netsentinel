"""Health check and Prometheus metrics endpoints."""

import time
from typing import Any

from app.config import settings
from app.db.session import engine
from fastapi import APIRouter, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, generate_latest
from sqlalchemy import text

router = APIRouter(tags=["Health & Metrics"])

START_TIME = time.time()

# Prometheus metrics definitions
NETSENTINEL_UP = Gauge("netsentinel_up", "NetSentinel service status (1 = running)")
NETSENTINEL_UP.set(1)

CHECKS_TOTAL = Counter("netsentinel_checks_total", "Total checks executed", ["type", "status"])
ACTIVE_INCIDENTS = Gauge("netsentinel_active_incidents", "Number of currently active incidents", ["severity"])
DEVICES_TOTAL = Gauge("netsentinel_devices_total", "Total registered devices", ["status"])


@router.get("/healthz", summary="Health check endpoint")
async def health_check() -> dict[str, Any]:
    """Return health status of NetSentinel and its database."""
    db_ok = False
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            db_ok = True
    except Exception:
        db_ok = False

    uptime_seconds = int(time.time() - START_TIME)
    is_healthy = db_ok

    payload = {
        "status": "healthy" if is_healthy else "degraded",
        "app": settings.app_name,
        "version": settings.app_version,
        "uptime_seconds": uptime_seconds,
        "database": "connected" if db_ok else "error",
        "vantage_point": settings.vantage_point_id or "not_configured",
    }
    return payload


@router.get("/metrics", summary="Prometheus metrics")
async def metrics() -> Response:
    """Return Prometheus formatted metrics."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
