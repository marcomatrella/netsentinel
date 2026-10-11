"""YAML configuration schema, export, import, and JSON Schema generation."""

from typing import Any

import yaml
from app.crypto import mask_secret
from app.schemas.entities import (
    CanvasLayoutSave,
    CheckFailurePolicy,
    CheckRecoveryPolicy,
    DeviceAddresses,
)
from pydantic import BaseModel, ConfigDict, Field, model_validator


class DeviceYaml(BaseModel):
    id: str
    name: str
    kind: str
    location: str | None = None
    criticality: int = Field(default=3, ge=1, le=5)
    addresses: DeviceAddresses = Field(default_factory=DeviceAddresses)
    tags: list[str] = Field(default_factory=list)
    roles: list[str] = Field(default_factory=list)
    notes: str | None = None


class LinkYaml(BaseModel):
    id: str
    from_device: str = Field(..., alias="from")
    from_port: str | None = None
    to_device: str = Field(..., alias="to")
    to_port: str | None = None
    medium: str = "ethernet"
    poe: bool = False
    cable_notes: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class DependencyYaml(BaseModel):
    id: str
    dependent: str
    provider: str
    kind: str  # power, l2_path, l3_gateway, wan, dhcp, dns, service, time, custom
    strength: str = "hard"
    source: str = "inferred"
    reason: str | None = None


class CheckYaml(BaseModel):
    id: str
    device: str
    type: str
    name: str
    params: dict[str, Any] = Field(default_factory=dict)
    interval_seconds: int = 30
    timeout_seconds: float = 5.0
    thresholds: dict[str, Any] = Field(default_factory=dict)
    failure_policy: CheckFailurePolicy = Field(default_factory=CheckFailurePolicy)
    recovery_policy: CheckRecoveryPolicy = Field(default_factory=CheckRecoveryPolicy)
    enabled: bool = True


class NotificationChannelYaml(BaseModel):
    id: str
    name: str
    type: str  # smtp, webhook, ntfy, home_assistant
    config: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    min_severity: str = "warn"
    quiet_hours: dict[str, Any] = Field(default_factory=dict)


class NetSentinelConfigYaml(BaseModel):
    """Complete versioned configuration document for NetSentinel."""

    version: str = "1.0"
    vantage_point: str
    timezone: str = "Europe/Rome"
    heartbeat_url: str | None = None
    heartbeat_interval_seconds: int = 60

    devices: list[DeviceYaml] = Field(default_factory=list)
    links: list[LinkYaml] = Field(default_factory=list)
    dependencies: list[DependencyYaml] = Field(default_factory=list)
    checks: list[CheckYaml] = Field(default_factory=list)
    notification_channels: list[NotificationChannelYaml] = Field(default_factory=list)
    canvas_layout: CanvasLayoutSave | None = None

    @model_validator(mode="after")
    def validate_vantage_point_exists(self) -> "NetSentinelConfigYaml":
        if self.devices:
            dev_ids = {d.id for d in self.devices}
            if self.vantage_point not in dev_ids:
                raise ValueError(
                    f"Il vantage_point '{self.vantage_point}' non è presente nell'elenco degli apparati."
                )
        return self

    def to_yaml(self, redact_secrets: bool = True) -> str:
        """Export configuration to clean formatted YAML string."""
        data = self.model_dump(by_alias=True, exclude_none=True)
        if redact_secrets:
            # Mask sensitive params in checks and channels
            for chk in data.get("checks", []):
                params = chk.get("params", {})
                for k in ["password", "token", "api_key", "secret", "auth_token"]:
                    if k in params and isinstance(params[k], str):
                        params[k] = mask_secret(params[k])
            for ch in data.get("notification_channels", []):
                cfg = ch.get("config", {})
                for k in ["password", "token", "api_key", "secret"]:
                    if k in cfg and isinstance(cfg[k], str):
                        cfg[k] = mask_secret(cfg[k])

        return yaml.dump(
            data,
            sort_keys=False,
            allow_unicode=True,
            default_flow_style=False,
        )

    @classmethod
    def from_yaml(cls, yaml_content: str) -> "NetSentinelConfigYaml":
        """Parse and validate YAML configuration content."""
        raw = yaml.safe_load(yaml_content)
        if not isinstance(raw, dict):
            raise ValueError("Il file di configurazione deve essere un dizionario YAML valido.")
        return cls.model_validate(raw)

    @classmethod
    def get_json_schema(cls) -> dict[str, Any]:
        """Return JSON Schema for validation and editor autocompletion."""
        return cls.model_json_schema()
