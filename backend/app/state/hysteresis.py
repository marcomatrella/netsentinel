"""Hysteresis engine for check and device state transitions."""

from datetime import UTC, datetime
from typing import Any


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class HysteresisResult:
    """Result of evaluating a check's hysteresis."""

    def __init__(
        self,
        new_status: str,
        state_changed: bool,
        consecutive_failures: int,
        consecutive_successes: int,
        event_severity: str | None = None,
    ) -> None:
        self.new_status = new_status
        self.state_changed = state_changed
        self.consecutive_failures = consecutive_failures
        self.consecutive_successes = consecutive_successes
        self.event_severity = event_severity


def evaluate_check_hysteresis(
    current_status: str,
    raw_status: str,
    consecutive_failures: int,
    consecutive_successes: int,
    failure_policy_dict: dict[str, Any] | None = None,
    recovery_policy_dict: dict[str, Any] | None = None,
) -> HysteresisResult:
    """Evaluate hysteresis to prevent rapid flapping between OK and CRIT."""
    f_policy = failure_policy_dict or {"consecutive_failures": 3}
    r_policy = recovery_policy_dict or {"consecutive_successes": 2}

    max_failures = int(f_policy.get("consecutive_failures", 3))
    max_successes = int(r_policy.get("consecutive_successes", 2))

    if raw_status in ["crit", "warn"]:
        consecutive_failures += 1
        consecutive_successes = 0

        # Check if failure threshold reached
        if consecutive_failures >= max_failures:
            target_status = raw_status
            state_changed = (target_status != current_status)
            severity = "crit" if raw_status == "crit" else "warn"
            return HysteresisResult(
                new_status=target_status,
                state_changed=state_changed,
                consecutive_failures=consecutive_failures,
                consecutive_successes=0,
                event_severity=severity if state_changed else None,
            )
        else:
            # Not yet reached failure threshold; retain current status
            return HysteresisResult(
                new_status=current_status,
                state_changed=False,
                consecutive_failures=consecutive_failures,
                consecutive_successes=0,
            )

    elif raw_status == "ok":
        consecutive_successes += 1
        consecutive_failures = 0

        # Check if recovery threshold reached
        if consecutive_successes >= max_successes or current_status == "unknown":
            state_changed = (current_status != "ok")
            return HysteresisResult(
                new_status="ok",
                state_changed=state_changed,
                consecutive_failures=0,
                consecutive_successes=consecutive_successes,
                event_severity="info" if state_changed else None,
            )
        else:
            # Retain current non-ok status until enough consecutive successes
            return HysteresisResult(
                new_status=current_status,
                state_changed=False,
                consecutive_failures=0,
                consecutive_successes=consecutive_successes,
            )

    else:  # unknown
        return HysteresisResult(
            new_status=current_status if current_status != "unknown" else "unknown",
            state_changed=False,
            consecutive_failures=consecutive_failures,
            consecutive_successes=consecutive_successes,
        )


def synthesize_device_status(
    current_device_status: str,
    check_statuses: list[dict[str, Any]],
    is_flapping: bool = False,
    is_unreachable: bool = False,
) -> tuple[str, bool]:
    """Synthesize overall device status from its active checks."""
    if is_unreachable:
        return ("unreachable", current_device_status != "unreachable")

    if is_flapping:
        return ("flapping", current_device_status != "flapping")

    if not check_statuses:
        return ("unknown", current_device_status != "unknown")

    # Inspect primary reachability checks (e.g. ping)
    ping_checks = [c for c in check_statuses if c.get("type") == "ping"]

    if ping_checks:
        ping_down = any(c.get("status") == "crit" for c in ping_checks)
        if ping_down:
            new_st = "down"
            return (new_st, current_device_status != new_st)

    # Check for service degradation
    has_crit = any(c.get("status") == "crit" for c in check_statuses)
    has_warn = any(c.get("status") == "warn" for c in check_statuses)
    all_ok = all(c.get("status") == "ok" for c in check_statuses)
    all_unknown = all(c.get("status") == "unknown" for c in check_statuses)

    if all_ok:
        new_st = "ok"
    elif has_crit or has_warn:
        new_st = "degraded"
    elif all_unknown:
        new_st = "unknown"
    else:
        new_st = "degraded"

    return (new_st, current_device_status != new_st)
