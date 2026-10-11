"""Pydantic v2 schemas for NetSentinel entities."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Device Schemas
# ---------------------------------------------------------------------------

class DeviceAddresses(BaseModel):
    ip: str | None = None
    mac: str | None = None
    hostname: str | None = None


class InterfaceBase(BaseModel):
    id: str
    name: str
    type: str = "ethernet"
    expected_speed: str | None = None
    mac_address: str | None = None
    notes: str | None = None


class DeviceBase(BaseModel):
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


class DeviceUpdate(BaseModel):
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
    interfaces: list[InterfaceBase] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Link Schemas
# ---------------------------------------------------------------------------

class LinkBase(BaseModel):
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

class DependencyBase(BaseModel):
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

class CheckFailurePolicy(BaseModel):
    consecutive_failures: int = 3
    window_seconds: int = 60


class CheckRecoveryPolicy(BaseModel):
    consecutive_successes: int = 2


class CheckBase(BaseModel):
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


class CheckUpdate(BaseModel):
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


# ---------------------------------------------------------------------------
# Observation & Event Schemas
# ---------------------------------------------------------------------------

class ObservationRead(BaseModel):
    id: int
    ts: datetime
    device_id: str
    check_id: str
    status: str
    value: float | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class EventRead(BaseModel):
    id: int
    ts: datetime
    device_id: str | None = None
    check_id: str | None = None
    event_type: str
    severity: str
    title: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Incident Schemas
# ---------------------------------------------------------------------------

class IncidentEvidence(BaseModel):
    check_id: str | None = None
    device_id: str | None = None
    status: str
    ts: datetime
    message: str
    positive: bool = True  # True = evidence supporting diagnosis, False = negative evidence


class IncidentTimelineItem(BaseModel):
    ts: datetime
    event_type: str
    message: str
    device_id: str | None = None


class IncidentHypothesis(BaseModel):
    category: str
    description: str
    confidence: float
    missing_evidence: list[str] = Field(default_factory=list)
    suggested_checks: list[str] = Field(default_factory=list)


class IncidentRead(BaseModel):
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


class IncidentAcknowledge(BaseModel):
    acknowledged_by: str = "user"


# ---------------------------------------------------------------------------
# Canvas Layout Schemas
# ---------------------------------------------------------------------------

class CanvasLayoutSave(BaseModel):
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)
    groups: list[dict[str, Any]] = Field(default_factory=list)


class CanvasLayoutRead(BaseModel):
    id: str
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    groups: list[dict[str, Any]]
    updated_at: datetime
