"""Maintenance mode state tracker for NetSentinel."""

from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from app.config import settings
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

    @staticmethod
    def is_window_active_at(window: ScheduledMaintenanceWindow, check_time: datetime) -> bool:
        """Check if a ScheduledMaintenanceWindow is active at a given datetime."""
        if not window.enabled:
            return False

        rec_type = (window.recurrence_type or "none").lower()

        # 1. Non-recurring: exact start_ts and end_ts window (both naive UTC)
        if rec_type in ("none", "", None):
            return window.start_ts <= check_time <= window.end_ts

        # 2. Recurring window: convert check_time to local timezone configured in settings
        try:
            tz = ZoneInfo(settings.timezone)
            if check_time.tzinfo is None:
                check_time_utc = check_time.replace(tzinfo=UTC)
            else:
                check_time_utc = check_time.astimezone(UTC)
            local_check = check_time_utc.astimezone(tz)
        except Exception:
            local_check = check_time

        # Start date of recurrence check in local time
        try:
            if window.start_ts.tzinfo is None:
                win_start_utc = window.start_ts.replace(tzinfo=UTC)
            else:
                win_start_utc = window.start_ts.astimezone(UTC)
            local_start_date = win_start_utc.astimezone(tz).date()
        except Exception:
            local_start_date = window.start_ts.date()

        if local_check.date() < local_start_date:
            return False

        if window.recurrence_end_date:
            try:
                if window.recurrence_end_date.tzinfo is None:
                    win_end_utc = window.recurrence_end_date.replace(tzinfo=UTC)
                else:
                    win_end_utc = window.recurrence_end_date.astimezone(UTC)
                local_end_date = win_end_utc.astimezone(tz).date()
            except Exception:
                local_end_date = window.recurrence_end_date.date()
            if local_check.date() > local_end_date:
                return False

        # Parse start_time and end_time ("HH:MM")
        if not window.start_time or not window.end_time:
            return window.start_ts <= check_time <= window.end_ts

        try:
            s_h, s_m = map(int, window.start_time.strip().split(":"))
            e_h, e_m = map(int, window.end_time.strip().split(":"))
        except Exception:
            return False

        check_minutes = local_check.hour * 60 + local_check.minute
        start_minutes = s_h * 60 + s_m
        end_minutes = e_h * 60 + e_m

        # Time of day match check
        in_time_window = False
        if start_minutes <= end_minutes:
            # Same day window, e.g. 03:59 to 04:15
            in_time_window = start_minutes <= check_minutes <= end_minutes
        else:
            # Overnight window across midnight, e.g. 23:30 to 01:30
            in_time_window = check_minutes >= start_minutes or check_minutes <= end_minutes

        if not in_time_window:
            return False

        # 3. Recurrence interval / calendar match
        if rec_type == "daily":
            return True

        elif rec_type == "weekly":
            # Monday is 0, Sunday is 6 (Python weekday())
            if window.days_of_week is not None and window.days_of_week != "":
                valid_days = [int(d.strip()) for d in window.days_of_week.split(",") if d.strip().isdigit()]
                return local_check.weekday() in valid_days
            return True

        elif rec_type == "monthly":
            # Day of month (1-31). If day_of_month not set, default to start_ts.day
            dom = window.day_of_month if window.day_of_month is not None else window.start_ts.day
            return local_check.day == dom

        elif rec_type == "yearly":
            # Same month and day as start_ts
            return local_check.month == window.start_ts.month and local_check.day == window.start_ts.day

        return False

    async def is_device_in_maintenance(
        self,
        session: Any,
        device_id: str | None,
        at_time: datetime | None = None,
    ) -> tuple[bool, ScheduledMaintenanceWindow | None]:
        """Check if a device or the entire network is under an active maintenance window.

        Also inspects upstream dependency topology (e.g. if the upstream router is in maintenance,
        all downstream devices inherit maintenance status).
        Returns (is_under_maintenance, window_object_if_any).
        """
        # 1. Check quick manual global toggle first (valid only for now)
        check_time = at_time or datetime.now(UTC).replace(tzinfo=None)
        if at_time is None and self.is_active():
            return True, None

        if session is None:
            return False, None

        # 2. Query ScheduledMaintenanceWindows
        # Check global windows + specific device windows
        try:
            device_ids_to_check: list[str | None] = [None]
            if device_id:
                device_ids_to_check.append(device_id)
                # Check upstream providers in topology (e.g. router reboot affects all downstream)
                try:
                    from app.topology.graph import topology_graph
                    upstream = topology_graph.get_upstream_providers(device_id)
                    for up_id in upstream:
                        if up_id not in device_ids_to_check:
                            device_ids_to_check.append(up_id)
                except Exception:
                    pass

            stmt = select(ScheduledMaintenanceWindow).where(
                ScheduledMaintenanceWindow.enabled.is_(True),
                (ScheduledMaintenanceWindow.device_id.is_(None)) |
                (ScheduledMaintenanceWindow.device_id.in_([d for d in device_ids_to_check if d is not None]))
            )

            res = await session.execute(stmt)
            windows = res.scalars().all()
            for win in windows:
                if self.is_window_active_at(win, check_time):
                    return True, win
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

