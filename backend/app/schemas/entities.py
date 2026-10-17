"""Pydantic v2 schemas for NetSentinel entities."""

from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field, field_serializer


class NetSentinelBaseModel(BaseModel):
    """Base model ensuring all naive UTC datetimes are serialized with the 'Z' timezone specifier."""

    @field_serializer(
        "status_since",
        "last_seen",
        "updated_at",
        "last_run_at",
        "next_run_at",
        "ts",
        "started_at",
        "resolved_at",
        "acknowledged_at",
        mode="plain",
        check_fields=False,
    )
    def serialize_utc_datetime(self, dt: datetime | None) -> str | None:
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt.isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# Device Schemas
# ---------------------------------------------------------------------------

class DeviceAddresses(NetSentinelBaseModel):
    ip: str | None = None
    mac: str | None = None
    hostname: str | None = None


class InterfaceBase(NetSentinelBaseModel):
    id: str
    name: str
    type: str = "ethernet"
    expected_speed: str | None = None
    mac_address: str | None = None
    notes: str | None = None


class DeviceBase(NetSentinelBaseModel):
    id: str
    name: str
    kind: str
    location: str | None = None
    criticality: int = Field(default=3, ge=1, le=5)
    addresses: DeviceAddresses = Field(default_factory=DeviceAddresses)
    tags: list[str] = Field(default_factory=list)
    roles: list[str] = Field(default_factory=list)
    notes: str | None = None


class DeviceCreate(DeviceBase):
    pass


class DeviceUpdate(NetSentinelBaseModel):
    name: str | None = None
    kind: str | None = None
    location: str | None = None
    criticality: int | None = Field(default=None, ge=1, le=5)
    addresses: DeviceAddresses | None = None
    tags: list[str] | None = None
    roles: list[str] | None = None
    notes: str | None = None


class DeviceRead(DeviceBase):
    status: str
    status_since: datetime
    last_seen: datetime | None = None
    rtt_ms: float | None = None
    interfaces: list[InterfaceBase] = Field(default_factory=list)


class DeviceBatchDeleteRequest(NetSentinelBaseModel):
    device_ids: list[str] = Field(..., description="Elenco degli ID apparati da eliminare")


# ---------------------------------------------------------------------------
# Link Schemas
# ---------------------------------------------------------------------------

class LinkBase(NetSentinelBaseModel):
    id: str
    from_device_id: str
    from_port: str | None = None
    to_device_id: str
    to_port: str | None = None
    medium: str = "ethernet"
    poe: bool = False
    cable_notes: str | None = None


class LinkCreate(LinkBase):
    pass


class LinkRead(LinkBase):
    status: str = "unmonitored"
    status_source: str | None = None
    throughput_bps: float | None = None
    updated_at: datetime


# ---------------------------------------------------------------------------
# Dependency Schemas
# ---------------------------------------------------------------------------

class DependencyBase(NetSentinelBaseModel):
    id: str
    dependent_id: str
    provider_id: str
    kind: str  # power, l2_path, l3_gateway, wan, dhcp, dns, service, time, custom
    strength: str = "hard"  # hard, soft
    source: str = "inferred"  # inferred, manual
    reason: str | None = None


class DependencyCreate(DependencyBase):
    pass


class DependencyRead(DependencyBase):
    pass


# ---------------------------------------------------------------------------
# Check Schemas
# ---------------------------------------------------------------------------

class CheckFailurePolicy(NetSentinelBaseModel):
    consecutive_failures: int = 3
    window_seconds: int = 60


class CheckRecoveryPolicy(NetSentinelBaseModel):
    consecutive_successes: int = 2


class CheckBase(NetSentinelBaseModel):
    id: str
    device_id: str
    type: str
    name: str
    params: dict[str, Any] = Field(default_factory=dict)
    interval_seconds: int = 30
    timeout_seconds: float = 5.0
    thresholds: dict[str, Any] = Field(default_factory=dict)
    failure_policy: CheckFailurePolicy = Field(default_factory=CheckFailurePolicy)
    recovery_policy: CheckRecoveryPolicy = Field(default_factory=CheckRecoveryPolicy)
    enabled: bool = True


class CheckCreate(CheckBase):
    pass


class CheckUpdate(NetSentinelBaseModel):
    name: str | None = None
    params: dict[str, Any] | None = None
    interval_seconds: int | None = None
    timeout_seconds: float | None = None
    thresholds: dict[str, Any] | None = None
    failure_policy: CheckFailurePolicy | None = None
    recovery_policy: CheckRecoveryPolicy | None = None
    enabled: bool | None = None


class CheckRead(CheckBase):
    current_status: str
    status_since: datetime
    last_run_at: datetime | None = None
    next_run_at: datetime | None = None


class CheckTestPayload(NetSentinelBaseModel):
    type: str
    target_address: str | None = None
    params: dict[str, Any] = Field(default_factory=dict)
    timeout_seconds: float = 6.0


# ---------------------------------------------------------------------------
# Observation & Event Schemas
# ---------------------------------------------------------------------------

class ObservationRead(NetSentinelBaseModel):
    id: int
    ts: datetime
    device_id: str
    check_id: str
    status: str
    value: float | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class EventRead(NetSentinelBaseModel):
    id: int
    ts: datetime
    device_id: str | None = None
    device_name: str | None = None
    device_ip: str | None = None
    device_kind: str | None = None
    check_id: str | None = None
    event_type: str
    severity: str
    title: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Incident Schemas
# ---------------------------------------------------------------------------

class IncidentEvidence(NetSentinelBaseModel):
    check_id: str | None = None
    device_id: str | None = None
    status: str
    ts: datetime
    message: str
    positive: bool = True  # True = evidence supporting diagnosis, False = negative evidence


class IncidentTimelineItem(NetSentinelBaseModel):
    ts: datetime
    event_type: str
    message: str
    device_id: str | None = None


class IncidentHypothesis(NetSentinelBaseModel):
    category: str
    description: str
    confidence: float
    missing_evidence: list[str] = Field(default_factory=list)
    suggested_checks: list[str] = Field(default_factory=list)


class IncidentRead(NetSentinelBaseModel):
    id: str
    status: str
    started_at: datetime
    resolved_at: datetime | None = None
    root_cause_device_id: str | None = None
    root_cause_category: str
    confidence: float
    summary: str
    evidence: list[IncidentEvidence] = Field(default_factory=list)
    impacted: list[str] = Field(default_factory=list)
    timeline: list[IncidentTimelineItem] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    alternative_hypotheses: list[IncidentHypothesis] = Field(default_factory=list)
    acknowledged_by: str | None = None
    acknowledged_at: datetime | None = None


class IncidentAcknowledge(NetSentinelBaseModel):
    acknowledged_by: str = "user"


# ---------------------------------------------------------------------------
# Canvas Layout Schemas
# ---------------------------------------------------------------------------

class CanvasLayoutSave(NetSentinelBaseModel):
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)
    groups: list[dict[str, Any]] = Field(default_factory=list)


class CanvasLayoutRead(NetSentinelBaseModel):
    id: str
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    groups: list[dict[str, Any]]
    updated_at: datetime
