"""Base collector classes, interfaces, and observation schemas."""

from abc import ABC, abstractmethod
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field


class CollectorObservation(BaseModel):
    """Observation returned by a collector execution."""

    status: str  # ok, warn, crit, unknown
    value: float | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    ts: datetime = Field(default_factory=lambda: datetime.now(UTC).replace(tzinfo=None))


class CollectorEvent(BaseModel):
    """Event emitted directly by a collector during execution."""

    event_type: str
    severity: str = "info"  # info, warn, crit
    title: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    ts: datetime = Field(default_factory=lambda: datetime.now(UTC).replace(tzinfo=None))


class CollectorResult(BaseModel):
    """Result of a collector execution containing observations and events."""

    observations: list[CollectorObservation] = Field(default_factory=list)
    events: list[CollectorEvent] = Field(default_factory=list)


class DiscoveredItem(BaseModel):
    """Device or service discovered on the local network."""

    id: str
    name: str
    kind: str
    addresses: dict[str, str] = Field(default_factory=dict)
    suggested_links: list[dict[str, Any]] = Field(default_factory=list)
    suggested_checks: list[dict[str, Any]] = Field(default_factory=list)
    raw_data: dict[str, Any] = Field(default_factory=dict)


class BaseCollector(ABC):
    """Abstract base class for all NetSentinel collector plugins."""

    name: str
    description: str
    capabilities: list[str] = []
    param_schema: type[BaseModel] | None = None

    @abstractmethod
    async def collect(
        self,
        target_address: str | None,
        params: dict[str, Any],
        timeout_seconds: float = 5.0,
    ) -> CollectorResult:
        """Execute check and return observations and events. Must not raise unhandled exceptions."""
        pass

    async def discover(self, params: dict[str, Any]) -> list[DiscoveredItem]:
        """Optionally discover devices or services (for the wizard palette)."""
        return []
