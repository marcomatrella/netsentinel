"""SQLAlchemy ORM models for NetSentinel."""

from datetime import UTC, datetime

from app.db.base import Base
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship


def utcnow() -> datetime:
    """Return timezone-naive UTC timestamp for SQLite storage."""
    return datetime.now(UTC).replace(tzinfo=None)


class Device(Base):
    """Monitored network device / appliance / service."""

    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    location: Mapped[str | None] = mapped_column(String(128), nullable=True)
    criticality: Mapped[int] = mapped_column(Integer, default=3)
    addresses_json: Mapped[str] = mapped_column(Text, default="{}")
    tags_json: Mapped[str] = mapped_column(Text, default="[]")
    roles_json: Mapped[str] = mapped_column(Text, default="[]")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String(32), default="unknown", index=True)
    status_since: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    # Relationships
    interfaces = relationship("Interface", back_populates="device", cascade="all, delete-orphan")
    checks = relationship("Check", back_populates="device", cascade="all, delete-orphan")


class Interface(Base):
    """Port or physical/logical interface of a device."""

    __tablename__ = "interfaces"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    device_id: Mapped[str] = mapped_column(String(64), ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    type: Mapped[str] = mapped_column(String(32), default="ethernet")
    expected_speed: Mapped[str | None] = mapped_column(String(32), nullable=True)
    mac_address: Mapped[str | None] = mapped_column(String(32), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    device = relationship("Device", back_populates="interfaces")


class Link(Base):
    """Physical or logical connection between two devices/ports."""

    __tablename__ = "links"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    from_device_id: Mapped[str] = mapped_column(String(64), ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    from_port: Mapped[str | None] = mapped_column(String(64), nullable=True)
    to_device_id: Mapped[str] = mapped_column(String(64), ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    to_port: Mapped[str | None] = mapped_column(String(64), nullable=True)
    medium: Mapped[str] = mapped_column(String(32), default="ethernet")
    poe: Mapped[bool] = mapped_column(Boolean, default=False)
    cable_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String(32), default="unmonitored")
    status_source: Mapped[str | None] = mapped_column(String(128), nullable=True)
    throughput_bps: Mapped[float | None] = mapped_column(Float, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Dependency(Base):
    """Dependency relationship ('dependent depends on provider for kind')."""

    __tablename__ = "dependencies"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    dependent_id: Mapped[str] = mapped_column(String(64), ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    provider_id: Mapped[str] = mapped_column(String(64), ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    strength: Mapped[str] = mapped_column(String(16), default="hard")
    source: Mapped[str] = mapped_column(String(16), default="inferred")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class Check(Base):
    """Active or passive check executed on a device."""

    __tablename__ = "checks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    device_id: Mapped[str] = mapped_column(String(64), ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    params_json: Mapped[str] = mapped_column(Text, default="{}")
    interval_seconds: Mapped[int] = mapped_column(Integer, default=30)
    timeout_seconds: Mapped[float] = mapped_column(Float, default=5.0)
    thresholds_json: Mapped[str] = mapped_column(Text, default="{}")
    failure_policy_json: Mapped[str] = mapped_column(Text, default='{"consecutive_failures": 3, "window_seconds": 60}')
    recovery_policy_json: Mapped[str] = mapped_column(Text, default='{"consecutive_successes": 2}')

    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)
    consecutive_successes: Mapped[int] = mapped_column(Integer, default=0)
    current_status: Mapped[str] = mapped_column(String(32), default="unknown")
    status_since: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    device = relationship("Device", back_populates="checks")


class Observation(Base):
    """Raw metric/status observation point from a check."""

    __tablename__ = "observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime, index=True, default=utcnow)
    device_id: Mapped[str] = mapped_column(String(64), ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    check_id: Mapped[str] = mapped_column(String(64), ForeignKey("checks.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    details_json: Mapped[str] = mapped_column(Text, default="{}")


class ObservationHourly(Base):
    """Aggregated observation data for compact long-term storage."""

    __tablename__ = "observations_hourly"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    hour_ts: Mapped[datetime] = mapped_column(DateTime, index=True)
    device_id: Mapped[str] = mapped_column(String(64), index=True)
    check_id: Mapped[str] = mapped_column(String(64), index=True)
    min_val: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_val: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_val: Mapped[float | None] = mapped_column(Float, nullable=True)
    p95_val: Mapped[float | None] = mapped_column(Float, nullable=True)
    count: Mapped[int] = mapped_column(Integer, default=0)
    last_status: Mapped[str] = mapped_column(String(32))


class Event(Base):
    """Discrete system event (reboot, flap, state change, etc.)."""

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime, index=True, default=utcnow)
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    check_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    severity: Mapped[str] = mapped_column(String(16), default="info")
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    details_json: Mapped[str] = mapped_column(Text, default="{}")


class Incident(Base):
    """Correlated root-cause incident."""

    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    status: Mapped[str] = mapped_column(String(32), default="open", index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, index=True, default=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    root_cause_device_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    root_cause_category: Mapped[str] = mapped_column(String(64), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_json: Mapped[str] = mapped_column(Text, default="[]")
    impacted_json: Mapped[str] = mapped_column(Text, default="[]")
    timeline_json: Mapped[str] = mapped_column(Text, default="[]")
    recommendations_json: Mapped[str] = mapped_column(Text, default="[]")
    alternative_hypotheses_json: Mapped[str] = mapped_column(Text, default="[]")
    acknowledged_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class NotificationChannel(Base):
    """Configured notification channel."""

    __tablename__ = "notification_channels"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    config_json: Mapped[str] = mapped_column(Text, default="{}")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    min_severity: Mapped[str] = mapped_column(String(16), default="warn")
    quiet_hours_json: Mapped[str] = mapped_column(Text, default="{}")


class NotificationLog(Base):
    """Persistent log and queue for notifications."""

    __tablename__ = "notification_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime, index=True, default=utcnow)
    incident_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    channel_id: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(32), default="queued", index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload_summary: Mapped[str | None] = mapped_column(Text, nullable=True)


class CanvasLayout(Base):
    """Layout and styling state of the draw.io-style network canvas."""

    __tablename__ = "canvas_layouts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default="default")
    nodes_json: Mapped[str] = mapped_column(Text, default="[]")
    edges_json: Mapped[str] = mapped_column(Text, default="[]")
    groups_json: Mapped[str] = mapped_column(Text, default="[]")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class ConfigVersion(Base):
    """Versioned configuration snapshots."""

    __tablename__ = "config_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    yaml_content: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[str] = mapped_column(String(64), default="system")


class UserSettings(Base):
    """Application key-value configuration overrides."""

    __tablename__ = "user_settings"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value_json: Mapped[str] = mapped_column(Text, default="{}")
