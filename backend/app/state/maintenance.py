"""Maintenance mode state tracker for NetSentinel."""

from datetime import UTC, datetime, timedelta
from typing import Any

from app.db.models import to_utc_iso


class MaintenanceTracker:
    """Tracks scheduled or active maintenance windows."""

    def __init__(self) -> None:
        self.enabled: bool = False
        self.until: datetime | None = None
        self.notes: str = ""

    def is_active(self) -> bool:
        """Return True if maintenance mode is currently active and not expired."""
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
        """Activate or deactivate maintenance window."""
        self.enabled = enabled
        self.notes = notes
        if enabled and duration_minutes:
            self.until = datetime.now(UTC).replace(tzinfo=None) + timedelta(minutes=duration_minutes)
        else:
            self.until = None
        return self.get_info()

    def get_info(self) -> dict[str, Any]:
        """Return maintenance window details."""
        return {
            "is_active": self.is_active(),
            "enabled": self.enabled,
            "until": to_utc_iso(self.until),
            "notes": self.notes,
        }


maintenance_tracker = MaintenanceTracker()

