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
    start_ts: str  # ISO 8601 string or date
    end_ts: str    # ISO 8601 string or date
    recurrence_type: str = "none"  # "none" | "daily" | "weekly" | "monthly" | "yearly"
    start_time: str | None = None  # "HH:MM"
    end_time: str | None = None    # "HH:MM"
    days_of_week: str | None = None  # "0,1,2,3,4"
    day_of_month: int | None = None
    recurrence_end_date: str | None = None  # ISO 8601 or date
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
                "recurrence_type": w.recurrence_type or "none",
                "start_time": w.start_time,
                "end_time": w.end_time,
                "days_of_week": w.days_of_week,
                "day_of_month": w.day_of_month,
                "recurrence_end_date": to_utc_iso(w.recurrence_end_date) if w.recurrence_end_date else None,
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
        )
        res = await session.execute(stmt)
        all_windows = res.scalars().all()
        active_windows = [w for w in all_windows if maintenance_tracker.is_window_active_at(w, check_time)]

        global_win = None
        device_wins = []
        for w in active_windows:
            w_dict = {
                "id": w.id,
                "title": w.title,
                "device_id": w.device_id,
                "start_ts": to_utc_iso(w.start_ts),
                "end_ts": to_utc_iso(w.end_ts),
                "recurrence_type": w.recurrence_type or "none",
                "start_time": w.start_time,
                "end_time": w.end_time,
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
                "recurrence_type": "none",
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

    rec_type = payload.recurrence_type.lower() if payload.recurrence_type else "none"
    rec_end_dt = None
    if payload.recurrence_end_date:
        try:
            rec_end_dt = datetime.fromisoformat(payload.recurrence_end_date.replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            pass

    async with AsyncSessionLocal() as session:
        # Check for overlapping active maintenance windows (only for non-recurring windows)
        if rec_type in ("none", "", None):
            overlap_stmt = select(ScheduledMaintenanceWindow).where(
                ScheduledMaintenanceWindow.enabled.is_(True),
                ScheduledMaintenanceWindow.recurrence_type.in_(["none", "", None]),
                ScheduledMaintenanceWindow.start_ts < e_dt,
                ScheduledMaintenanceWindow.end_ts > s_dt,
            )
            if payload.device_id:
                overlap_stmt = overlap_stmt.where(
                    (ScheduledMaintenanceWindow.device_id.is_(None)) |
                    (ScheduledMaintenanceWindow.device_id == payload.device_id)
                )
            else:
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
            recurrence_type=rec_type,
            start_time=payload.start_time,
            end_time=payload.end_time,
            days_of_week=payload.days_of_week,
            day_of_month=payload.day_of_month,
            recurrence_end_date=rec_end_dt,
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
            "recurrence_type": new_window.recurrence_type,
            "start_time": new_window.start_time,
            "end_time": new_window.end_time,
            "days_of_week": new_window.days_of_week,
            "day_of_month": new_window.day_of_month,
            "recurrence_end_date": to_utc_iso(new_window.recurrence_end_date) if new_window.recurrence_end_date else None,
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
