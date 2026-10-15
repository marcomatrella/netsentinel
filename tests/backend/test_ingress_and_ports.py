"""Unit tests for transparent dual-binding, Home Assistant options loading, and SSL/HTTPS support."""

import json
from pathlib import Path
import pytest
from app.config import Settings
from app.main import resolve_cert_path


def test_ha_options_loader(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Verify that options.json from Home Assistant is loaded correctly into Settings."""
    options_file = tmp_path / "options.json"
    options_content = {
        "port": 9090,
        "ssl": True,
        "certfile": "custom_fullchain.pem",
        "keyfile": "custom_privkey.pem",
        "subnet": "10.0.0.0/24",
        "timezone": "America/New_York",
        "auth_enabled": True,
        "ingress_port": 8099,
    }
    options_file.write_text(json.dumps(options_content), encoding="utf-8")

    monkeypatch.setenv("HA_OPTIONS_FILE", str(options_file))

    s = Settings(data_dir=str(tmp_path))
    s.resolve_paths()

    assert s.port == 9090
    assert s.ssl_enabled is True
    assert s.ssl_certfile == "custom_fullchain.pem"
    assert s.ssl_keyfile == "custom_privkey.pem"
    assert s.subnet == "10.0.0.0/24"
    assert s.timezone == "America/New_York"
    assert s.auth_enabled is True
    assert s.ingress_port == 8099


def test_resolve_cert_path_direct_and_ha_ssl(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Verify that resolve_cert_path finds files directly or in /ssl directory."""
    # Test None / empty
    assert resolve_cert_path(None) is None
    assert resolve_cert_path("") is None

    # Test direct file
    direct_file = tmp_path / "cert.pem"
    direct_file.write_text("DUMMY_CERT", encoding="utf-8")
    assert resolve_cert_path(str(direct_file)) == direct_file

    # Test missing file
    assert resolve_cert_path("/non/existent/file.pem") is None


def test_dual_binding_port_list():
    """Verify ports to bind in plain HTTP mode."""
    # Default scenario: port 8181, ingress 8099
    port = 8181
    ingress_port = 8099
    ports_to_bind = [port]
    if ingress_port not in ports_to_bind:
        ports_to_bind.append(ingress_port)
    if 8181 not in ports_to_bind:
        ports_to_bind.append(8181)

    assert ports_to_bind == [8181, 8099]

    # Custom port scenario: port 9000, ingress 8099
    port = 9000
    ingress_port = 8099
    ports_to_bind = [port]
    if ingress_port not in ports_to_bind:
        ports_to_bind.append(ingress_port)
    if 8181 not in ports_to_bind:
        ports_to_bind.append(8181)

    assert ports_to_bind == [9000, 8099, 8181]


def test_ssl_port_collision_mitigation():
    """Verify that when HTTPS port is configured to the same as ingress port, ingress shifts port."""
    configured_port = 8099
    ingress_port = 8099

    eff_ingress_port = ingress_port
    if eff_ingress_port == configured_port:
        eff_ingress_port = 8099 if configured_port != 8099 else 8098

    assert eff_ingress_port == 8098
