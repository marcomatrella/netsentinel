"""Maintenance mode state tracker for NetSentinel."""

from datetime import UTC, datetime, timedelta
from typing import Any

from app.db.models import ScheduledMaintenanceWindow, to_utc_iso
from sqlalchemy import select


class MaintenanceTracker:
    """Tracks manual and scheduled maintenance windows (global and per-device)."""

    def __init__(self) -> None:
        self.enabled: bool = False
        self.until: datetime | None = None
        self.notes: str = ""

    def is_active(self) -> bool:
        """Return True if manual global maintenance mode is currently active and not expired."""
        if not self.enabled:
            return False
        if self.until is not None:
            now = datetime.now(UTC).replace(tzinfo=None)
            if now > self.until:
                self.enabled = False
                self.until = None
                return False
        return True

    def set_maintenance(
        self,
        enabled: bool,
        duration_minutes: int | None = None,
        notes: str = "",
    ) -> dict[str, Any]:
        """Activate or deactivate manual global maintenance window."""
        self.enabled = enabled
        self.notes = notes
        if enabled and duration_minutes:
            self.until = datetime.now(UTC).replace(tzinfo=None) + timedelta(minutes=duration_minutes)
        else:
            self.until = None
        return self.get_info()

    async def is_device_in_maintenance(
        self,
        session: Any,
        device_id: str | None,
        at_time: datetime | None = None,
    ) -> tuple[bool, ScheduledMaintenanceWindow | None]:
        """Check if a device or the entire network is under an active maintenance window.

        Returns (is_under_maintenance, window_object_if_any).
        """
        # 1. Check quick manual global toggle first (valid only for now)
        check_time = at_time or datetime.now(UTC).replace(tzinfo=None)
        if at_time is None and self.is_active():
            return True, None

        if session is None:
            return False, None

        # 2. Query ScheduledMaintenanceWindow covering check_time
        # Either global (device_id IS NULL) OR targeting this specific device_id
        try:
            stmt = (
                select(ScheduledMaintenanceWindow)
                .where(
                    ScheduledMaintenanceWindow.enabled.is_(True),
                    ScheduledMaintenanceWindow.start_ts <= check_time,
                    ScheduledMaintenanceWindow.end_ts >= check_time,
                )
            )
            if device_id:
                stmt = stmt.where(
                    (ScheduledMaintenanceWindow.device_id.is_(None)) |
                    (ScheduledMaintenanceWindow.device_id == device_id)
                )
            else:
                stmt = stmt.where(ScheduledMaintenanceWindow.device_id.is_(None))

            res = await session.execute(stmt)
            active_window = res.scalars().first()
            if active_window:
                return True, active_window
        except Exception:
            pass

        return False, None

    def get_info(self) -> dict[str, Any]:
        """Return maintenance window details."""
        return {
            "is_active": self.is_active(),
            "enabled": self.enabled,
            "until": to_utc_iso(self.until),
            "notes": self.notes,
        }


maintenance_tracker = MaintenanceTracker()

