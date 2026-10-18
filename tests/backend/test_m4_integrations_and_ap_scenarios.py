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
        "fritzbox",
        "omada",
        "mikrotik",
        "snmp_bridge",
        "opnsense",
        "pfsense",
        "asuswrt",
        "netgear",
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


@pytest.mark.asyncio
async def test_unifi_collector_client_detection(monkeypatch):
    """Verify UniFi collector extracts connected clients for the target device."""
    from app.collector.plugins.unifi import UniFiCollector

    collector = UniFiCollector()

    class MockResponse:
        def __init__(self, url: str):
            self.url = url
            self.status_code = 200

        def json(self):
            if "clients" in str(self.url) or "stat/sta" in str(self.url):
                return {
                    "data": [
                        {
                            "mac": "11:22:33:44:55:66",
                            "ip": "192.168.1.150",
                            "name": "iPhone di Marco",
                            "is_wired": False,
                            "ap_mac": "aa:bb:cc:dd:ee:01",
                            "essid": "Home-WiFi",
                            "signal": -55,
                        },
                        {
                            "mac": "aa:11:22:33:44:55",
                            "ip": "192.168.1.151",
                            "name": "Altro Client",
                            "is_wired": False,
                            "ap_mac": "99:88:77:66:55:44",
                            "essid": "Home-WiFi",
                            "signal": -70,
                        },
                    ]
                }
            return {
                "data": [
                    {
                        "mac": "aa:bb:cc:dd:ee:01",
                        "name": "UniFi AP U6 Pro",
                        "state": 1,
                        "uptime": 7200,
                        "model": "U6-Pro",
                        "type": "uap",
                    }
                ]
            }

    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, url, *args, **kwargs):
            return MockResponse(url)

    monkeypatch.setattr("httpx.AsyncClient", lambda **kwargs: MockClient())

    result = await collector.collect(
        target_address="192.168.1.1",
        params={
            "api_key": "test_api_key_123",
            "site": "default",
            "mac": "aa:bb:cc:dd:ee:01",
        },
    )

    assert len(result.observations) > 0
    obs = result.observations[0]
    assert obs.status == "ok"
    assert "connected_clients" in obs.details
    # Should only match client connected to aa:bb:cc:dd:ee:01
    matched = obs.details["connected_clients"]
    assert len(matched) == 1
    assert matched[0]["mac"] == "11:22:33:44:55:66"
    assert matched[0]["ip"] == "192.168.1.150"
    assert matched[0]["name"] == "iPhone di Marco"
    assert obs.details["clients_count"] == 1


@pytest.mark.asyncio
async def test_unifi_deduced_dependency_reason():
    """Verify that links derived from UniFi integration produce a deduction reason noting UniFi."""
    from app.db.models import Link
    from app.topology.deduction import deduce_dependencies_from_topology

    ap_dev = Device(
        id="dev-ap",
        name="Access Point Salotto",
        kind="access_point",
        status="ok",
        criticality=3,
        addresses_json='{"ip": "192.168.1.2"}',
        tags_json="[]",
        roles_json='["access_point"]',
    )
    client_dev = Device(
        id="dev-client",
        name="Smartphone Utente",
        kind="client",
        status="ok",
        criticality=1,
        addresses_json='{"ip": "192.168.1.150"}',
        tags_json="[]",
        roles_json='["passive_tracking"]',
    )

    unifi_link = Link(
        id="link-unifi-ap-client",
        from_device_id="dev-ap",
        to_device_id="dev-client",
        medium="wifi",
        status="ok",
        status_source="unifi",
    )

    deps = deduce_dependencies_from_topology(
        devices=[ap_dev, client_dev],
        links=[unifi_link],
    )

    unifi_dep = next((d for d in deps if d.dependent_id == "dev-client" and d.provider_id == "dev-ap"), None)
    assert unifi_dep is not None
    assert "rilevato da integrazione UniFi" in unifi_dep.reason


@pytest.mark.asyncio
async def test_fritzbox_collector_client_detection(monkeypatch):
    """Verify FRITZ!Box collector extracts connected clients and WAN info via TR-064."""
    from app.collector.plugins.fritzbox import FritzBoxCollector

    collector = FritzBoxCollector()

    class MockResponse:
        def __init__(self, url: str):
            self.url = str(url)
            self.status_code = 200

        @property
        def text(self):
            if "hosts" in self.url:
                return (
                    '<?xml version="1.0"?>'
                    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">'
                    '<s:Body>'
                    '<u:X_AVM-DE_GetHostListResponse xmlns:u="urn:dslforum-org:service:Hosts:1">'
                    '<NewX_AVM-DE_HostList>'
                    '&lt;List&gt;'
                    '&lt;Item&gt;'
                    '&lt;Index&gt;1&lt;/Index&gt;'
                    '&lt;IPAddress&gt;192.168.178.25&lt;/IPAddress&gt;'
                    '&lt;MACAddress&gt;AA:BB:CC:DD:EE:11&lt;/MACAddress&gt;'
                    '&lt;HostName&gt;Smart-TV-Salotto&lt;/HostName&gt;'
                    '&lt;InterfaceType&gt;Ethernet&lt;/InterfaceType&gt;'
                    '&lt;Active&gt;1&lt;/Active&gt;'
                    '&lt;/Item&gt;'
                    '&lt;Item&gt;'
                    '&lt;Index&gt;2&lt;/Index&gt;'
                    '&lt;IPAddress&gt;192.168.178.50&lt;/IPAddress&gt;'
                    '&lt;MACAddress&gt;AA:BB:CC:DD:EE:22&lt;/MACAddress&gt;'
                    '&lt;HostName&gt;iPhone-Marco&lt;/HostName&gt;'
                    '&lt;InterfaceType&gt;802.11&lt;/InterfaceType&gt;'
                    '&lt;Active&gt;1&lt;/Active&gt;'
                    '&lt;X_AVM-DE_Speed&gt;866&lt;/X_AVM-DE_Speed&gt;'
                    '&lt;/Item&gt;'
                    '&lt;/List&gt;'
                    '</NewX_AVM-DE_HostList>'
                    '</u:X_AVM-DE_GetHostListResponse>'
                    '</s:Body>'
                    '</s:Envelope>'
                )
            elif "deviceinfo" in self.url:
                return (
                    '<?xml version="1.0"?>'
                    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">'
                    '<s:Body>'
                    '<u:GetInfoResponse xmlns:u="urn:dslforum-org:service:DeviceInfo:1">'
                    '<NewModelName>7590 AX</NewModelName>'
                    '<NewUpTime>86400</NewUpTime>'
                    '</u:GetInfoResponse>'
                    '</s:Body>'
                    '</s:Envelope>'
                )
            elif "wanipconnection" in self.url:
                return (
                    '<?xml version="1.0"?>'
                    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">'
                    '<s:Body>'
                    '<u:GetInfoResponse xmlns:u="urn:dslforum-org:service:WANIPConnection:1">'
                    '<NewExternalIPAddress>93.45.67.89</NewExternalIPAddress>'
                    '<NewConnectionStatus>Connected</NewConnectionStatus>'
                    '<NewUptime>86400</NewUptime>'
                    '</u:GetInfoResponse>'
                    '</s:Body>'
                    '</s:Envelope>'
                )
            return "<ok/>"

    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def post(self, url, *args, **kwargs):
            return MockResponse(url)

    monkeypatch.setattr("httpx.AsyncClient", lambda **kwargs: MockClient())

    result = await collector.collect(
        target_address="192.168.178.1",
        params={"username": "admin", "password": "secretpassword"},
    )

    assert len(result.observations) > 0
    obs = result.observations[0]
    assert obs.status == "ok"
    assert "FRITZ!Box 7590 AX" in obs.details["model"]
    assert obs.details["clients_count"] == 2
    clients = obs.details["connected_clients"]
    assert any(c["name"] == "Smart-TV-Salotto" and c["is_wired"] is True for c in clients)
    assert any(c["name"] == "iPhone-Marco" and c["is_wired"] is False for c in clients)
    assert obs.details["wan"]["external_ip"] == "93.45.67.89"


@pytest.mark.asyncio
async def test_omada_collector_client_detection(monkeypatch):
    """Verify TP-Link Omada collector extracts connected clients and filters per AP."""
    from app.collector.plugins.omada import OmadaCollector

    collector = OmadaCollector()

    class MockResponse:
        def __init__(self, url: str):
            self.url = str(url)
            self.status_code = 200

        def json(self):
            if "login" in self.url:
                return {"errorCode": 0, "result": {"token": "omada_token_xyz"}}
            elif "clients" in self.url:
                return {
                    "errorCode": 0,
                    "result": {
                        "data": [
                            {
                                "mac": "11:22:33:44:55:66",
                                "ip": "192.168.0.100",
                                "name": "Tablet",
                                "wireless": True,
                                "apMac": "aa:bb:cc:dd:ee:ff",
                                "ssid": "Omada-WiFi",
                                "rssi": -50,
                            },
                            {
                                "mac": "aa:11:22:33:44:55",
                                "ip": "192.168.0.101",
                                "name": "Desktop PC",
                                "wireless": False,
                                "switchMac": "11:22:33:44:55:aa",
                                "port": 3,
                            },
                        ]
                    },
                }
            elif "devices" in self.url:
                return {
                    "errorCode": 0,
                    "result": {
                        "data": [
                            {"mac": "aa:bb:cc:dd:ee:ff", "model": "EAP660 HD", "type": "ap"},
                            {"mac": "11:22:33:44:55:aa", "model": "SG2210P", "type": "switch"},
                        ]
                    },
                }
            return {}

    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def post(self, url, *args, **kwargs):
            return MockResponse(url)

        async def get(self, url, *args, **kwargs):
            return MockResponse(url)

    monkeypatch.setattr("httpx.AsyncClient", lambda **kwargs: MockClient())

    result = await collector.collect(
        target_address="192.168.0.2",
        params={
            "username": "admin",
            "password": "password",
            "mac": "aa:bb:cc:dd:ee:ff",
        },
    )

    assert len(result.observations) > 0
    obs = result.observations[0]
    assert obs.status == "ok"
    # Should only match wireless client connected to EAP660 HD
    assert obs.details["clients_count"] == 1
    assert obs.details["connected_clients"][0]["mac"] == "11:22:33:44:55:66"
    assert obs.details["connected_clients"][0]["is_wired"] is False


@pytest.mark.asyncio
async def test_omada_collector_auth_failure(monkeypatch):
    """Verify TP-Link Omada collector marks status='crit' when login fails or host is not Omada."""
    from app.collector.plugins.omada import OmadaCollector

    collector = OmadaCollector()

    class MockFailingClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def post(self, url, *args, **kwargs):
            class Resp:
                status_code = 401
                def json(self):
                    return {"errorCode": -1001, "msg": "Invalid credentials"}
            return Resp()

        async def get(self, url, *args, **kwargs):
            class Resp:
                status_code = 404
                def json(self):
                    return {}
            return Resp()

    monkeypatch.setattr("httpx.AsyncClient", lambda **kwargs: MockFailingClient())

    result = await collector.collect(
        target_address="192.168.1.1",
        params={
            "username": "admin",
            "password": "wrongpassword",
        },
    )

    assert len(result.observations) > 0
    obs = result.observations[0]
    assert obs.status == "crit"
    assert "fallita" in obs.details["error"]


@pytest.mark.asyncio
async def test_mikrotik_collector_client_detection(monkeypatch):
    """Verify MikroTik collector parses system info and active clients."""
    from app.collector.plugins.mikrotik import MikroTikCollector

    collector = MikroTikCollector()

    class MockResponse:
        def __init__(self, url: str):
            self.url = str(url)
            self.status_code = 200

        def json(self):
            if "system/resource" in self.url:
                return [{"board-name": "RB5009UG+S+IN", "version": "7.15", "cpu-load": 4, "uptime": "15d"}]
            elif "dhcp-server/lease" in self.url:
                return [
                    {"address": "192.168.88.20", "mac-address": "aa:bb:cc:11:22:33", "host-name": "Workstation", "status": "bound"},
                    {"address": "192.168.88.21", "mac-address": "aa:bb:cc:11:22:44", "host-name": "HomePod", "status": "bound"},
                ]
            elif "bridge/host" in self.url:
                return [
                    {"mac-address": "aa:bb:cc:11:22:33", "on-interface": "ether2", "local": False},
                ]
            return []

    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, url, *args, **kwargs):
            return MockResponse(url)

    monkeypatch.setattr("httpx.AsyncClient", lambda **kwargs: MockClient())

    result = await collector.collect(
        target_address="192.168.88.1",
        params={"username": "admin", "password": "testpassword"},
    )

    assert len(result.observations) > 0
    obs = result.observations[0]
    assert obs.status == "ok"
    assert obs.details["model"] == "RB5009UG+S+IN"
    assert obs.details["clients_count"] >= 2
    assert any(c["mac"] == "aa:bb:cc:11:22:33" and c["port"] == "ether2" for c in obs.details["connected_clients"])


@pytest.mark.asyncio
async def test_opnsense_collector_client_detection(monkeypatch):
    """Verify OPNsense collector parses ARP and DHCP tables."""
    from app.collector.plugins.opnsense import OpnsenseCollector

    collector = OpnsenseCollector()

    class MockResponse:
        def __init__(self, url: str):
            self.url = str(url)
            self.status_code = 200

        def json(self):
            if "getArpTable" in self.url:
                return [
                    {"ip": "192.168.1.10", "mac": "00:11:22:33:44:55", "hostname": "printer.local", "intf_description": "LAN"},
                    {"ip": "192.168.1.20", "mac": "00:11:22:33:44:66", "hostname": "nas.local", "intf_description": "LAN"},
                ]
            elif "searchLease" in self.url:
                return {"rows": []}
            elif "gateway/status" in self.url:
                return {"items": [{"name": "WAN_GW", "status": "online"}]}
            return {}

    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, url, *args, **kwargs):
            return MockResponse(url)

        async def post(self, url, *args, **kwargs):
            return MockResponse(url)

    monkeypatch.setattr("httpx.AsyncClient", lambda **kwargs: MockClient())

    result = await collector.collect(
        target_address="192.168.1.1",
        params={"api_key": "k", "api_secret": "s"},
    )

    assert len(result.observations) > 0
    obs = result.observations[0]
    assert obs.status == "ok"
    assert obs.details["clients_count"] == 2
    assert obs.details["connected_clients"][0]["mac"] == "00:11:22:33:44:55"
    assert obs.details["connected_clients"][0]["name"] == "printer.local"


@pytest.mark.asyncio
async def test_all_integration_sources_in_deduction():
    """Verify that all supported integration sources generate appropriate deduction reasons."""
    from app.db.models import Link
    from app.topology.deduction import deduce_dependencies_from_topology

    router = Device(
        id="dev-rtr",
        name="Router Principale",
        kind="router",
        status="ok",
        criticality=5,
        addresses_json='{"ip": "192.168.1.1"}',
        tags_json="[]",
        roles_json='["gateway"]',
    )
    client = Device(
        id="dev-cli",
        name="Client PC",
        kind="client",
        status="ok",
        criticality=1,
        addresses_json='{"ip": "192.168.1.50"}',
        tags_json="[]",
        roles_json='["passive_tracking"]',
    )

    sources = ["fritzbox", "omada", "mikrotik", "snmp_bridge", "opnsense", "pfsense", "asuswrt", "netgear"]
    for src in sources:
        test_link = Link(
            id=f"link-{src}",
            from_device_id="dev-rtr",
            to_device_id="dev-cli",
            medium="ethernet",
            status="ok",
            status_source=src,
        )
        deps = deduce_dependencies_from_topology(devices=[router, client], links=[test_link])
        l2_dep = next((d for d in deps if d.dependent_id == "dev-cli" and d.provider_id == "dev-rtr" and d.kind == "l2_path"), None)
        assert l2_dep is not None, f"Dependency missing for source {src}"
        assert "rilevato da integrazione" in l2_dep.reason, f"Reason for {src} does not acknowledge integration: {l2_dep.reason}"


