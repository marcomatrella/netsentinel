"""Flap detection for checks and devices over sliding time windows."""

from collections import deque
from datetime import UTC, datetime, timedelta


class FlapDetector:
    """Tracks state transitions in a sliding time window to identify flapping."""

    def __init__(self, window_seconds: int = 600, max_transitions: int = 4) -> None:
        self.window_seconds = window_seconds
        self.max_transitions = max_transitions
        # Maps entity_id -> deque of transition timestamps
        self._history: dict[str, deque[datetime]] = {}
        # Tracks current flapping state
        self._is_flapping: dict[str, bool] = {}

    def record_transition(self, entity_id: str, ts: datetime | None = None) -> bool:
        """Record a state change and return True if entity entered or is in flapping state."""
        now = ts or datetime.now(UTC).replace(tzinfo=None)
        cutoff = now - timedelta(seconds=self.window_seconds)

        if entity_id not in self._history:
            self._history[entity_id] = deque()

        deq = self._history[entity_id]
        deq.append(now)

        # Evict timestamps older than sliding window
        while deq and deq[0] < cutoff:
            deq.popleft()

        is_flapping = len(deq) >= self.max_transitions
        self._is_flapping[entity_id] = is_flapping

        # Return True if currently in flapping condition
        return is_flapping

    def is_flapping(self, entity_id: str, now: datetime | None = None) -> bool:
        """Check if an entity is currently flapping."""
        if entity_id not in self._history:
            return False

        current_time = now or datetime.now(UTC).replace(tzinfo=None)
        cutoff = current_time - timedelta(seconds=self.window_seconds)

        deq = self._history[entity_id]
        while deq and deq[0] < cutoff:
            deq.popleft()

        is_now = len(deq) >= self.max_transitions
        self._is_flapping[entity_id] = is_now
        return is_now

    def reset(self, entity_id: str) -> None:
        """Reset flap history for an entity."""
        if entity_id in self._history:
            self._history[entity_id].clear()
        self._is_flapping[entity_id] = False
