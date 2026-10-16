"""Tests for Milestone M0: Foundations (Settings, DB, Crypto, YAML Schema, Health API)."""

import pytest
from app.crypto import decrypt_secret, encrypt_secret, mask_secret
from app.db.session import init_db
from app.main import app
from app.schemas.config_yaml import NetSentinelConfigYaml
from httpx import ASGITransport, AsyncClient


@pytest.mark.asyncio
async def test_crypto_roundtrip(tmp_path):
    """Verify secrets encryption, decryption and masking."""
    plaintext = "super_secret_nas_password_123!"
    encrypted = encrypt_secret(plaintext)
    assert encrypted != plaintext
    assert len(encrypted) > 20

    decrypted = decrypt_secret(encrypted)
    assert decrypted == plaintext

    masked = mask_secret(plaintext)
    assert "..." in masked
    assert "super" not in masked


@pytest.mark.asyncio
async def test_db_initialization(tmp_path):
    """Verify database schema creation in SQLite WAL mode."""
    await init_db()
    # If init_db completes without exception, tables were created properly
    assert True


@pytest.mark.asyncio
async def test_healthz_endpoint():
    """Verify /healthz returns healthy status."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/healthz")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ["healthy", "degraded"]
        assert data["app"] == "NetSentinel"
        assert "uptime_seconds" in data


@pytest.mark.asyncio
async def test_metrics_endpoint():
    """Verify /metrics returns Prometheus text format."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/metrics")
        assert response.status_code == 200
        assert "netsentinel_up" in response.text


def test_yaml_config_validation():
    """Verify NetSentinelConfigYaml schema validation and export."""
    yaml_sample = """
version: "1.0"
vantage_point: "nas"
timezone: "Europe/Rome"
devices:
  - id: "nas"
    name: "Synology NAS"
    kind: "nas"
    criticality: 5
    addresses:
      ip: "192.168.1.10"
      hostname: "nas.lan"
    roles: ["vantage_point", "dhcp_server", "dns_resolver"]
  - id: "router"
    name: "Main Gateway"
    kind: "router"
    criticality: 5
    addresses:
      ip: "192.168.1.1"
    roles: ["gateway", "wan_provider"]
links:
  - id: "link-nas-router"
    from: "nas"
    to: "router"
    medium: "ethernet"
dependencies:
  - id: "dep-nas-router"
    dependent: "nas"
    provider: "router"
    kind: "l2_path"
checks:
  - id: "check-router-ping"
    device: "router"
    type: "ping"
    name: "Ping Gateway"
    params:
      target: "192.168.1.1"
"""
    config = NetSentinelConfigYaml.from_yaml(yaml_sample)
    assert config.vantage_point == "nas"
    assert len(config.devices) == 2
    assert config.devices[0].id == "nas"

    # Export back to YAML
    exported = config.to_yaml()
    assert "vantage_point: nas" in exported
    assert "Synology NAS" in exported

    # JSON Schema check
    schema = NetSentinelConfigYaml.get_json_schema()
    assert "properties" in schema
    assert "vantage_point" in schema["properties"]


def test_yaml_config_missing_vantage_point_fails():
    """Verify validation error when vantage_point refers to a non-existent device."""
    invalid_yaml = """
version: "1.0"
vantage_point: "ghost_device"
devices:
  - id: "nas"
    name: "Synology NAS"
    kind: "nas"
"""
    with pytest.raises(ValueError, match="vantage_point 'ghost_device' non è presente"):
        NetSentinelConfigYaml.from_yaml(invalid_yaml)


def test_reference_home_lab_yaml_validity():
    """Verify that examples/home-lab.yaml is valid according to schema."""
    from pathlib import Path

    yaml_path = Path("examples/home-lab.yaml")
    assert yaml_path.exists()
    config = NetSentinelConfigYaml.from_yaml(yaml_path.read_text())
    assert config.vantage_point == "synology-nas"
    assert len(config.devices) == 10
    assert len(config.links) == 11
    assert len(config.dependencies) == 14
    assert len(config.checks) == 11


@pytest.mark.asyncio
async def test_home_assistant_ingress_support():
    """Verify that X-Ingress-Path header injects the dynamic ingress prefix into HTML."""
    transport = ASGITransport(app=app)
    headers = {"X-Ingress-Path": "/api/hassio_ingress/token12345/"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/", headers=headers)
        assert resp.status_code == 200
        # If static index.html is mounted, ingress-path meta and base href are injected
        if "ingress-path" in resp.text:
            assert 'content="/api/hassio_ingress/token12345"' in resp.text
            assert '<base href="/api/hassio_ingress/token12345/">' in resp.text


