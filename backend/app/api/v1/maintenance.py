"""Maintenance mode REST API endpoints."""

import uuid
from datetime import UTC, datetime
from typing import Any

from app.db.models import ScheduledMaintenanceWindow, to_utc_iso
from app.db.session import AsyncSessionLocal
from app.state.maintenance import maintenance_tracker
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, select

router = APIRouter(prefix="/maintenance", tags=["Maintenance"])


class MaintenanceToggleRequest(BaseModel):
    """Payload to enable/disable manual maintenance mode."""

    enabled: bool
    duration_minutes: int | None = None
    notes: str = ""


class ScheduledWindowCreateRequest(BaseModel):
    """Payload to schedule a maintenance window."""

    title: str
    device_id: str | None = None  # None indicates GLOBAL
    start_ts: str  # ISO 8601 string
    end_ts: str    # ISO 8601 string
    notes: str = ""


@router.get("", response_model=dict[str, Any])
async def get_maintenance_status():
    """Retrieve current manual maintenance mode status."""
    return maintenance_tracker.get_info()


@router.post("", response_model=dict[str, Any])
async def set_maintenance_status(payload: MaintenanceToggleRequest):
    """Enable or disable manual maintenance mode."""
    return maintenance_tracker.set_maintenance(
        enabled=payload.enabled,
        duration_minutes=payload.duration_minutes,
        notes=payload.notes,
    )


@router.get("/scheduled")
async def list_scheduled_windows(device_id: str | None = None):
    """List scheduled maintenance windows (optionally filtered by device_id)."""
    async with AsyncSessionLocal() as session:
        stmt = select(ScheduledMaintenanceWindow).order_by(desc(ScheduledMaintenanceWindow.start_ts))
        if device_id:
            stmt = stmt.where(
                (ScheduledMaintenanceWindow.device_id.is_(None)) |
                (ScheduledMaintenanceWindow.device_id == device_id)
            )
        res = await session.execute(stmt)
        windows = res.scalars().all()
        return [
            {
                "id": w.id,
                "title": w.title,
                "device_id": w.device_id,
                "start_ts": to_utc_iso(w.start_ts),
                "end_ts": to_utc_iso(w.end_ts),
                "enabled": w.enabled,
                "notes": w.notes,
                "created_at": to_utc_iso(w.created_at),
            }
            for w in windows
        ]


@router.get("/scheduled/active")
async def get_active_scheduled_maintenance(at_ts: str | None = None):
    """Retrieve all maintenance windows active at a given timestamp (default: now)."""
    if at_ts:
        try:
            check_time = datetime.fromisoformat(at_ts.replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            check_time = datetime.now(UTC).replace(tzinfo=None)
    else:
        check_time = datetime.now(UTC).replace(tzinfo=None)

    async with AsyncSessionLocal() as session:
        stmt = select(ScheduledMaintenanceWindow).where(
            ScheduledMaintenanceWindow.enabled.is_(True),
            ScheduledMaintenanceWindow.start_ts <= check_time,
            ScheduledMaintenanceWindow.end_ts >= check_time,
        )
        res = await session.execute(stmt)
        active_windows = res.scalars().all()

        global_win = None
        device_wins = []
        for w in active_windows:
            w_dict = {
                "id": w.id,
                "title": w.title,
                "device_id": w.device_id,
                "start_ts": to_utc_iso(w.start_ts),
                "end_ts": to_utc_iso(w.end_ts),
                "notes": w.notes,
            }
            if w.device_id is None:
                global_win = w_dict
            else:
                device_wins.append(w_dict)

        # Also account for manual global maintenance toggle
        manual_active = maintenance_tracker.is_active() and (at_ts is None)
        if manual_active and not global_win:
            global_win = {
                "id": "manual-global",
                "title": "Manutenzione Manuale Globale",
                "device_id": None,
                "start_ts": to_utc_iso(check_time),
                "end_ts": to_utc_iso(maintenance_tracker.until) if maintenance_tracker.until else None,
                "notes": maintenance_tracker.notes,
            }

        return {
            "is_global_active": global_win is not None,
            "global_window": global_win,
            "active_device_windows": device_wins,
        }


@router.post("/scheduled")
async def create_scheduled_window(payload: ScheduledWindowCreateRequest):
    """Create a new scheduled maintenance window with overlap prevention and duration check."""
    try:
        s_dt = datetime.fromisoformat(payload.start_ts.replace("Z", "+00:00")).replace(tzinfo=None)
        e_dt = datetime.fromisoformat(payload.end_ts.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {exc}")

    if e_dt <= s_dt:
        raise HTTPException(status_code=400, detail="End date must be after start date")

    async with AsyncSessionLocal() as session:
        # Check for overlapping active maintenance windows
        # Overlap condition: start < existing.end AND end > existing.start
        overlap_stmt = select(ScheduledMaintenanceWindow).where(
            ScheduledMaintenanceWindow.enabled.is_(True),
            ScheduledMaintenanceWindow.start_ts < e_dt,
            ScheduledMaintenanceWindow.end_ts > s_dt,
        )
        if payload.device_id:
            # Overlaps either with another window for the same device OR with a global window
            overlap_stmt = overlap_stmt.where(
                (ScheduledMaintenanceWindow.device_id.is_(None)) |
                (ScheduledMaintenanceWindow.device_id == payload.device_id)
            )
        else:
            # A global window conflicts with any existing global window or device window in the same timeframe
            overlap_stmt = overlap_stmt.where(ScheduledMaintenanceWindow.device_id.is_(None))

        overlap_res = await session.execute(overlap_stmt)
        conflict = overlap_res.scalars().first()
        if conflict:
            scope_desc = "globale" if not conflict.device_id else f"per apparato {conflict.device_id}"
            raise HTTPException(
                status_code=409,
                detail=f"Slot temporale in sovrapposizione con un intervento già programmato ({scope_desc}: '{conflict.title}').",
            )

        win_id = f"maint-{uuid.uuid4().hex[:8]}"
        new_window = ScheduledMaintenanceWindow(
            id=win_id,
            title=payload.title,
            device_id=payload.device_id,
            start_ts=s_dt,
            end_ts=e_dt,
            notes=payload.notes,
            enabled=True,
        )
        session.add(new_window)
        await session.commit()
        return {
            "id": new_window.id,
            "title": new_window.title,
            "device_id": new_window.device_id,
            "start_ts": to_utc_iso(new_window.start_ts),
            "end_ts": to_utc_iso(new_window.end_ts),
            "notes": new_window.notes,
        }


@router.delete("/scheduled/{window_id}")
async def delete_scheduled_window(window_id: str):
    """Delete a scheduled maintenance window."""
    async with AsyncSessionLocal() as session:
        stmt = select(ScheduledMaintenanceWindow).where(ScheduledMaintenanceWindow.id == window_id)
        res = await session.execute(stmt)
        win = res.scalar_one_or_none()
        if not win:
            raise HTTPException(status_code=404, detail="Maintenance window not found")
        await session.delete(win)
        await session.commit()
        return {"status": "deleted", "id": window_id}
