"""Unit and acceptance tests for Milestone M4: Advanced Collectors and 4 AP Offline Scenarios."""

import pytest
from app.collector.plugins.generic_http_json import GenericHttpJsonCollector
from app.collector.plugins.nut import NutCollector
from app.collector.plugins.snmp import build_snmp_get_packet, parse_snmp_response
from app.collector.plugins.synology_dsm import SynologyDsmCollector
from app.collector.registry import registry
from app.correlation.rules.rule_evaluator import RuleEvaluator
from app.db.models import Device


@pytest.mark.asyncio
async def test_all_m4_collectors_registered():
    """Verify all 11 collectors are correctly registered in the global registry."""
    expected_plugins = [
        "ping",
        "tcp_port",
        "http",
        "dns",
        "unifi",
        "synology_dsm",
        "nut",
        "adguard_home",
        "snmp",
        "home_assistant",
        "generic_http_json",
    ]
    for name in expected_plugins:
        collector = registry.get(name)
        assert collector is not None, f"Plugin {name} non registrato!"
        assert collector.name == name


@pytest.mark.asyncio
async def test_generic_http_json_collector(monkeypatch):
    """Test Generic HTTP/JSON collector with JSONPath extraction and assertions."""
    collector = GenericHttpJsonCollector()

    class MockResponse:
        status_code = 200

        def json(self):
            return {
                "system": {"status": "HEALTHY", "metrics": {"load": 0.42}},
                "services": [{"name": "web", "active": True}],
            }

    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def request(self, *args, **kwargs):
            return MockResponse()

    monkeypatch.setattr("httpx.AsyncClient", lambda **kwargs: MockClient())

    # Success assertion
    res = await collector.collect(
        target_address="192.168.1.50",
        params={
            "url": "http://192.168.1.50/health",
            "json_path": "system.status",
            "expected_value": "HEALTHY",
        },
    )
    assert len(res.observations) == 1
    assert res.observations[0].status == "ok"
    assert res.observations[0].details["extracted_value"] == "HEALTHY"

    # Failing assertion
    res_fail = await collector.collect(
        target_address="192.168.1.50",
        params={
            "url": "http://192.168.1.50/health",
            "json_path": "system.status",
            "expected_value": "DEGRADED",
        },
    )
    assert res_fail.observations[0].status == "crit"
    assert "fail_reasons" in res_fail.observations[0].details


@pytest.mark.asyncio
async def test_snmp_packet_builder_and_parser():
    """Test SNMP v2c packet encoding and decoding."""
    packet = build_snmp_get_packet(community="public", oid_str="1.3.6.1.2.1.1.3.0", request_id=100)
    assert len(packet) > 10
    assert b"public" in packet

    # Fake SNMP TimeTicks response: Tag 0x43 with 123456 centiseconds
    raw_response = (
        bytes([0x30, 0x1E])  # SEQUENCE
        + bytes([0x02, 0x01, 0x01])  # version 1
        + bytes([0x04, 0x06]) + b"public"  # community
        + bytes([0xA2, 0x11])  # GetResponse-PDU
        + bytes([0x02, 0x01, 0x64])  # Request ID 100
        + bytes([0x02, 0x01, 0x00])  # error status 0
        + bytes([0x02, 0x01, 0x00])  # error index 0
        + bytes([0x30, 0x08])  # VarBindList
        + bytes([0x30, 0x06])  # VarBind
        + bytes([0x06, 0x01, 0x00])  # OID dummy
        + bytes([0x43, 0x03, 0x01, 0xE2, 0x40])  # TimeTicks: 123456
    )
    err, val = parse_snmp_response(raw_response)
    assert err == 0
    assert val == 123456


@pytest.mark.asyncio
async def test_nut_blackout_and_battery_detection(monkeypatch):
    """Test NUT collector detecting AC power loss (OB) and emitting event."""
    collector = NutCollector()

    class MockStream:
        def __init__(self, responses):
            self.responses = responses
            self.idx = 0

        async def readline(self):
            if self.idx < len(self.responses):
                line = self.responses[self.idx]
                self.idx += 1
                return line.encode("utf-8")
            return b""

        def write(self, data):
            pass

        async def drain(self):
            pass

        def close(self):
            pass

        async def wait_closed(self):
            pass

    mock_responses = [
        'VAR ups ups.status "OB LB"\n',  # On Battery + Low Battery
        'VAR ups battery.charge "18"\n',
        'VAR ups battery.runtime "420"\n',
        'VAR ups ups.load "45"\n',
        'VAR ups input.voltage "0.0"\n',
        'VAR ups battery.voltage "24.2"\n',
        'VAR ups device.model "APC Smart-UPS 1500"\n',
    ]

    async def mock_open_conn(host, port):
        stream = MockStream(mock_responses)
        return stream, stream

    monkeypatch.setattr("asyncio.open_connection", mock_open_conn)

    res = await collector.collect(
        target_address="192.168.1.200",
        params={"ups_name": "ups"},
    )
    assert len(res.observations) == 1
    obs = res.observations[0]
    assert obs.status == "crit"
    assert obs.details["is_on_battery"] is True
    assert obs.details["is_low_battery"] is True
    assert obs.value == 18.0

    # Event must be emitted
    assert len(res.events) == 1
    assert res.events[0].event_type == "ups_on_battery"
    assert "modalità batteria" in res.events[0].message


@pytest.mark.asyncio
async def test_synology_dsm_degraded_pool(monkeypatch):
    """Test Synology DSM collector detecting degraded storage pool."""
    collector = SynologyDsmCollector()

    class MockResponse:
        status_code = 200

        def json(self):
            return {
                "success": True,
                "data": {
                    "storagePools": [{"name": "Storage Pool 1", "status": "degraded"}],
                    "volumes": [{"name": "Volume 1", "status": "normal"}],
                    "disks": [{"name": "Drive 1", "status": "normal", "smart_status": "normal"}],
                    "temperature": 38,
                },
            }

    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, *args, **kwargs):
            return MockResponse()

    monkeypatch.setattr("httpx.AsyncClient", lambda **kwargs: MockClient())

    res = await collector.collect(
        target_address="192.168.1.10",
        params={"dsm_url": "https://192.168.1.10:5001", "sid": "mock_sid"},
    )
    assert len(res.observations) == 1
    obs = res.observations[0]
    assert obs.status == "warn"
    assert obs.details["storage_healthy"] is False
    assert "degraded" in obs.details["degraded_reason"]
    assert len(res.events) == 1
    assert res.events[0].event_type == "storage_degraded"


# ============================================================================
# ACCEPTANCE TEST: "AP Offline 20 minuti" — I 4 Casi di Sezione 6.4
# ============================================================================


def test_acceptance_ap_offline_case_a_reboot():
    """Caso A: Riavvio AP (Uptime azzerato < 300s o reboot event, link switch PoE attivo)."""
    evaluator = RuleEvaluator()
    ap_device = Device(
        id="ap-salotto",
        name="UniFi U6 Pro Salotto",
        kind="access_point",
        status="ok",
        criticality=3,
        addresses_json="{}",
        tags_json="[]",
        roles_json='["access_point"]',
    )
    evidences = [
        {
            "check_type": "ping",
            "positive": True,
            "status": "ok",
            "message": "Ping ICMP verso AP attivo (latenza 1.2ms)",
        },
        {
            "check_type": "unifi",
            "positive": True,
            "status": "ok",
            "message": "AP riavviato di recente",
            "details": {"uptime_seconds": 120},
        },
    ]

    diag = evaluator.evaluate_candidate(ap_device, evidences=evidences)
    assert diag.rule_id == "rule_03_ap_reboot"
    assert diag.category == "hardware"
    assert diag.confidence >= 0.85
    assert "riavviato" in diag.title.lower() or "reboot" in diag.title.lower()


def test_acceptance_ap_offline_case_b_poe_loss():
    """Caso B: Perdita Alimentazione PoE o Cavo Scollegato (porta switch 0W o down)."""
    evaluator = RuleEvaluator()
    ap_device = Device(
        id="ap-salotto",
        name="UniFi U6 Pro Salotto",
        kind="access_point",
        status="down",
        criticality=3,
        addresses_json="{}",
        tags_json="[]",
        roles_json='["access_point"]',
    )
    evidences = [
        {
            "check_type": "ping",
            "positive": False,
            "status": "crit",
            "message": "Nessuna risposta al ping ICMP",
        },
        {
            "check_type": "unifi",
            "positive": False,
            "status": "crit",
            "message": "Porta PoE switch non eroga corrente",
            "details": {"poe_power": 0.0, "port_idx": 4},
        },
    ]

    diag = evaluator.evaluate_candidate(ap_device, evidences=evidences)
    assert diag.rule_id == "rule_04_ap_poe_loss"
    assert diag.category == "power"
    assert diag.confidence >= 0.90
    assert any("poe" in r.lower() or "cavo" in r.lower() for r in diag.recommendations)


def test_acceptance_ap_offline_case_c_dhcp_lease_loss():
    """Caso C: Perdita Lease IP / DHCP (PoE attivo > 4W e link switch UP, ma IP non raggiungibile)."""
    evaluator = RuleEvaluator()
    ap_device = Device(
        id="ap-salotto",
        name="UniFi U6 Pro Salotto",
        kind="access_point",
        status="down",
        criticality=3,
        addresses_json="{}",
        tags_json="[]",
        roles_json='["access_point"]',
    )
    evidences = [
        {
            "check_type": "ping",
            "positive": False,
            "status": "crit",
            "message": "Nessuna risposta al ping ICMP",
        },
        {
            "check_type": "unifi",
            "positive": True,
            "status": "ok",
            "message": "PoE attiva sulla porta switch (assorbimento 7.2W)",
            "details": {"poe_power": 7.2, "port_idx": 4},
        },
    ]

    diag = evaluator.evaluate_candidate(ap_device, evidences=evidences)
    assert diag.rule_id == "rule_ap_ip_lease_loss"
    assert diag.category == "dhcp"
    assert diag.confidence >= 0.85
    assert any("dhcp" in r.lower() for r in diag.recommendations)
    # Verify missing evidence suggestion is present
    assert len(diag.alternative_hypotheses) > 0
    alt = diag.alternative_hypotheses[0]
    assert "missing_evidence" in alt
    assert len(alt["missing_evidence"]) > 0


def test_acceptance_ap_offline_case_d_controller_desync():
    """Caso D: Solo Controller Disconnesso (UniFi controller segnala disconnected, ma IP e client sono OK)."""
    evaluator = RuleEvaluator()
    ap_device = Device(
        id="ap-salotto",
        name="UniFi U6 Pro Salotto",
        kind="access_point",
        status="degraded",
        criticality=3,
        addresses_json="{}",
        tags_json="[]",
        roles_json='["access_point"]',
    )
    evidences = [
        {
            "check_type": "unifi",
            "positive": False,
            "status": "crit",
            "message": "Controller UniFi segnala AP 'disconnected'",
        },
        {
            "check_type": "ping",
            "positive": True,
            "status": "ok",
            "message": "Ping ICMP verso IP AP risponde con successo (latenza 1.5ms)",
        },
    ]

    diag = evaluator.evaluate_candidate(ap_device, evidences=evidences)
    assert diag.rule_id == "rule_ap_controller_desync"
    assert diag.category == "controller_desync"
    assert diag.confidence >= 0.90
    assert "controller" in diag.title.lower()
    # Check recommendations mention inform URL
    assert any("inform" in r.lower() for r in diag.recommendations)
    # Check missing evidence suggestion is present
    assert len(diag.alternative_hypotheses) > 0
    alt = diag.alternative_hypotheses[0]
    assert "missing_evidence" in alt
    assert len(alt["missing_evidence"]) > 0
