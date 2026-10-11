"""Maintenance mode REST API endpoints."""

from typing import Any

from app.state.maintenance import maintenance_tracker
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/maintenance", tags=["Maintenance"])


class MaintenanceToggleRequest(BaseModel):
    """Payload to enable/disable maintenance mode."""

    enabled: bool
    duration_minutes: int | None = None
    notes: str = ""


@router.get("", response_model=dict[str, Any])
async def get_maintenance_status():
    """Retrieve current maintenance mode status."""
    return maintenance_tracker.get_info()


@router.post("", response_model=dict[str, Any])
async def set_maintenance_status(payload: MaintenanceToggleRequest):
    """Enable or disable maintenance mode."""
    return maintenance_tracker.set_maintenance(
        enabled=payload.enabled,
        duration_minutes=payload.duration_minutes,
        notes=payload.notes,
    )
