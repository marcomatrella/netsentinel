"""Reboot detection based on uptime decreases and boot identifiers."""



class RebootDetector:
    """Detects whether a device rebooted even if downtime was unobserved."""

    def __init__(self) -> None:
        # Maps device_id -> last known uptime (seconds)
        self._last_uptime: dict[str, float] = {}
        # Maps device_id -> last known boot_id / sys_up_time
        self._last_boot_id: dict[str, str] = {}

    def check_for_reboot(
        self,
        device_id: str,
        current_uptime_seconds: float | None = None,
        boot_id: str | None = None,
    ) -> tuple[bool, str]:
        """Inspect uptime and boot_id. Returns (rebooted: bool, reason: str)."""
        reboot_detected = False
        reason = ""

        # Check 1: Explicit boot_id change
        if boot_id is not None:
            last_bid = self._last_boot_id.get(device_id)
            if last_bid is not None and last_bid != boot_id:
                reboot_detected = True
                reason = f"Cambiamento identificativo di avvio (da {last_bid} a {boot_id})"
            self._last_boot_id[device_id] = boot_id

        # Check 2: Uptime decreased
        if current_uptime_seconds is not None:
            last_up = self._last_uptime.get(device_id)
            # Allow 15s margin for slight clock variance / network latency
            if last_up is not None and current_uptime_seconds < (last_up - 15.0):
                reboot_detected = True
                reason = f"Uptime diminuito da {int(last_up)}s a {int(current_uptime_seconds)}s (riavvio rilevato)"
            self._last_uptime[device_id] = current_uptime_seconds

        return (reboot_detected, reason)

    def set_known_state(
        self,
        device_id: str,
        uptime_seconds: float | None = None,
        boot_id: str | None = None,
    ) -> None:
        """Seed initial state without triggering reboot detection."""
        if uptime_seconds is not None:
            self._last_uptime[device_id] = uptime_seconds
        if boot_id is not None:
            self._last_boot_id[device_id] = boot_id
