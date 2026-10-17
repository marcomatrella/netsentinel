"""Tests for Milestone M1: Collectors, Hysteresis, Flapping, Reboot and State APIs."""

import asyncio
from datetime import UTC, datetime

import pytest
from app.collector.plugins.dns import build_dns_query, parse_dns_response
from app.collector.plugins.http import HttpCollector
from app.collector.plugins.ping import PingCollector
from app.collector.plugins.tcp_port import TcpPortCollector
from app.db.models import Check, Device, Event, Observation
from app.db.session import AsyncSessionLocal, init_db
from app.main import app
from app.state.flapping import FlapDetector
from app.state.hysteresis import evaluate_check_hysteresis, synthesize_device_status
from app.state.reboot import RebootDetector
from httpx import ASGITransport, AsyncClient

# ---------------------------------------------------------------------------
# Collector Unit Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ping_collector_local():
    """Verify PingCollector runs on localhost target."""
    collector = PingCollector()
    res = await collector.collect("127.0.0.1", {"target": "127.0.0.1", "count": 1, "timeout_seconds": 1.0})
    assert len(res.observations) == 1
    obs = res.observations[0]
    assert obs.status in ["ok", "warn"]
    assert obs.details["target"] == "127.0.0.1"


@pytest.mark.asyncio
async def test_ping_collector_unreachable():
    """Verify PingCollector handles an unreachable host gracefully."""
    collector = PingCollector()
    # 192.0.2.1 is TEST-NET-1 (non-routable)
    res = await collector.collect("192.0.2.1", {"target": "192.0.2.1", "count": 1, "timeout_seconds": 0.5})
    assert len(res.observations) == 1
    assert res.observations[0].status == "crit"


@pytest.mark.asyncio
async def test_tcp_port_collector():
    """Verify TcpPortCollector detects open and closed ports."""
    collector = TcpPortCollector()

    # Start a dummy asyncio server on localhost
    async def echo_handler(reader, writer):
        writer.close()
        await writer.wait_closed()

    server = await asyncio.start_server(echo_handler, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]

    try:
        # Test open port
        res_open = await collector.collect("127.0.0.1", {"port": port, "timeout_seconds": 1.0})
        assert res_open.observations[0].status == "ok"
        assert res_open.observations[0].value is not None
    finally:
        server.close()
        await server.wait_closed()

    # Test closed port
    res_closed = await collector.collect("127.0.0.1", {"port": port, "timeout_seconds": 0.5})
    assert res_closed.observations[0].status == "crit"


@pytest.mark.asyncio
async def test_http_collector():
    """Verify HttpCollector handles status codes and errors."""
    collector = HttpCollector()

    # Missing target
    res_empty = await collector.collect(None, {})
    assert res_empty.observations[0].status == "unknown"

    # Non-existent local port
    res_fail = await collector.collect("127.0.0.1", {"url": "http://127.0.0.1:54321/test", "timeout_seconds": 0.5})
    assert res_fail.observations[0].status == "crit"


def test_dns_packet_builder_and_parser():
    """Verify DNS query construction and response header parsing."""
    query = build_dns_query("cloudflare.com", query_id=0x1234)
    assert len(query) > 12
    assert b"cloudflare" in query

    # Mock DNS response: ID=0x1234, Flags=0x8180 (Standard query response, NoError), 1 answer
    mock_resp = b"\x12\x34\x81\x80\x00\x01\x00\x01\x00\x00\x00\x00"
    rcode, ancount = parse_dns_response(mock_resp, query_id=0x1234)
    assert rcode == 0
    assert ancount == 1

    # Mock SERVFAIL response (rcode = 2)
    mock_servfail = b"\x12\x34\x81\x82\x00\x01\x00\x00\x00\x00\x00\x00"
    rcode_sf, _ = parse_dns_response(mock_servfail, query_id=0x1234)
    assert rcode_sf == 2


# ---------------------------------------------------------------------------
# State, Hysteresis, Flapping and Reboot Tests
# ---------------------------------------------------------------------------

def test_hysteresis_transitions():
    """Verify hysteresis avoids false alerts and requires consecutive failures/recoveries."""
    f_policy = {"consecutive_failures": 3}
    r_policy = {"consecutive_successes": 2}

    # Initial state OK. Raw status fails once.
    r1 = evaluate_check_hysteresis("ok", "crit", 0, 0, f_policy, r_policy)
    assert r1.new_status == "ok"
    assert not r1.state_changed
    assert r1.consecutive_failures == 1

    # Fails twice.
    r2 = evaluate_check_hysteresis("ok", "crit", 1, 0, f_policy, r_policy)
    assert r2.new_status == "ok"
    assert not r2.state_changed
    assert r2.consecutive_failures == 2

    # Fails 3rd time -> transitions to CRIT.
    r3 = evaluate_check_hysteresis("ok", "crit", 2, 0, f_policy, r_policy)
    assert r3.new_status == "crit"
    assert r3.state_changed
    assert r3.consecutive_failures == 3

    # Recovery starts: 1st success -> still CRIT.
    r4 = evaluate_check_hysteresis("crit", "ok", 3, 0, f_policy, r_policy)
    assert r4.new_status == "crit"
    assert not r4.state_changed
    assert r4.consecutive_successes == 1

    # 2nd success -> transitions to OK.
    r5 = evaluate_check_hysteresis("crit", "ok", 0, 1, f_policy, r_policy)
    assert r5.new_status == "ok"
    assert r5.state_changed
    assert r5.consecutive_successes == 2


def test_device_status_synthesis():
    """Verify overall device status synthesis from multiple checks."""
    # When ping check is crit -> device is down
    checks = [{"type": "ping", "status": "crit"}, {"type": "http", "status": "ok"}]
    status, changed = synthesize_device_status("ok", checks)
    assert status == "down"
    assert changed

    # When ping is ok, but http is crit -> device is degraded
    checks_degraded = [{"type": "ping", "status": "ok"}, {"type": "http", "status": "crit"}]
    status2, changed2 = synthesize_device_status("ok", checks_degraded)
    assert status2 == "degraded"
    assert changed2

    # When all checks ok -> device is ok
    checks_ok = [{"type": "ping", "status": "ok"}, {"type": "http", "status": "ok"}]
    status3, changed3 = synthesize_device_status("degraded", checks_ok)
    assert status3 == "ok"
    assert changed3


def test_flapping_detector():
    """Verify rapid transitions trigger flapping condition."""
    detector = FlapDetector(window_seconds=60, max_transitions=4)
    dev_id = "test-device-1"

    assert not detector.record_transition(dev_id)
    assert not detector.record_transition(dev_id)
    assert not detector.record_transition(dev_id)
    assert detector.record_transition(dev_id)  # 4th transition triggers flapping
    assert detector.is_flapping(dev_id)


def test_reboot_detector():
    """Verify uptime drop triggers reboot event."""
    detector = RebootDetector()
    dev_id = "test-router"

    # Seed initial uptime: 100,000s (~27 hours)
    detector.set_known_state(dev_id, uptime_seconds=100000.0)

    # Uptime decreases to 30s -> reboot!
    rebooted, reason = detector.check_for_reboot(dev_id, current_uptime_seconds=30.0)
    assert rebooted
    assert "Uptime diminuito" in reason

    # Boot ID change also triggers reboot
    detector.set_known_state(dev_id, boot_id="boot-uuid-aaa")
    rebooted_bid, reason_bid = detector.check_for_reboot(dev_id, boot_id="boot-uuid-bbb")
    assert rebooted_bid
    assert "identificativo di avvio" in reason_bid


# ---------------------------------------------------------------------------
# Acceptance Test: 10 Monitored Devices + State Transitions via REST API
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ten_devices_monitored_with_state_transitions():
    """M1 Acceptance: 10 monitored devices with simulated failures and state verification via API."""
    await init_db()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Step 1: Create 10 devices
        created_devices = []
        for i in range(1, 11):
            dev_id = f"m1-dev-{i:02d}"
            payload = {
                "id": dev_id,
                "name": f"Device {i:02d}",
                "kind": "nas" if i == 1 else ("router" if i == 2 else "switch"),
                "criticality": 4,
                "addresses": {"ip": f"192.168.1.{100 + i}"},
                "tags": ["lab", "m1-test"],
                "roles": ["vantage_point"] if i == 1 else [],
            }
            resp = await client.post("/api/v1/devices", json=payload)
            assert resp.status_code == 201, resp.text
            created_devices.append(resp.json())

        assert len(created_devices) == 10

        # Step 2: Create a check on each device
        created_checks = []
        for dev in created_devices:
            chk_payload = {
                "id": f"chk-{dev['id']}",
                "device_id": dev["id"],
                "type": "ping",
                "name": f"Ping {dev['name']}",
                "params": {"target": dev["addresses"]["ip"]},
                "interval_seconds": 15,
                "timeout_seconds": 2.0,
                "failure_policy": {"consecutive_failures": 2, "window_seconds": 60},
                "recovery_policy": {"consecutive_successes": 1},
                "enabled": True,
            }
            resp_chk = await client.post("/api/v1/checks", json=chk_payload)
            assert resp_chk.status_code == 201, resp_chk.text
            created_checks.append(resp_chk.json())

        assert len(created_checks) == 10

        # Step 3: Verify GET /api/v1/devices returns all 10
        get_all_devs = await client.get("/api/v1/devices")
        assert get_all_devs.status_code == 200
        all_ids = {d["id"] for d in get_all_devs.json()}
        for d in created_devices:
            assert d["id"] in all_ids

        # Step 4: Simulate failure transitions directly in DB
        async with AsyncSessionLocal() as session:
            # Device 3 fails (becomes DOWN)
            dev_to_fail = await session.get(Device, "m1-dev-03")
            chk_to_fail = await session.get(Check, "chk-m1-dev-03")
            assert dev_to_fail is not None
            assert chk_to_fail is not None

            chk_to_fail.current_status = "crit"
            chk_to_fail.consecutive_failures = 3
            dev_to_fail.status = "down"

            # Record event
            ev = Event(
                ts=datetime.now(UTC).replace(tzinfo=None),
                device_id="m1-dev-03",
                check_id="chk-m1-dev-03",
                event_type="device_state_change",
                severity="crit",
                title="Device m1-dev-03 DOWN",
                message="Simulated failure for acceptance test.",
                details_json='{"status": "down"}',
            )
            session.add(ev)

            # Record observation
            obs = Observation(
                ts=datetime.now(UTC).replace(tzinfo=None),
                device_id="m1-dev-03",
                check_id="chk-m1-dev-03",
                status="crit",
                details_json='{"packet_loss_percent": 100.0}',
            )
            session.add(obs)
            await session.commit()

        # Step 5: Verify updated status via API
        resp_dev3 = await client.get("/api/v1/devices/m1-dev-03")
        assert resp_dev3.status_code == 200
        assert resp_dev3.json()["status"] == "down"

        # Step 6: Verify observation via API
        obs_res = await client.get("/api/v1/observations?device_id=m1-dev-03")
        assert obs_res.status_code == 200
        obs_list = obs_res.json()
        assert len(obs_list) >= 1
        assert obs_list[0]["status"] == "crit"

        # Step 7: Verify event via API
        ev_res = await client.get("/api/v1/events?device_id=m1-dev-03")
        assert ev_res.status_code == 200
        ev_list = ev_res.json()
        assert len(ev_list) >= 1
        assert ev_list[0]["severity"] == "crit"

        # Step 8: Verify exclude_event_type parameter
        ev_type = ev_list[0]["event_type"]
        ev_excluded = await client.get(f"/api/v1/events?device_id=m1-dev-03&exclude_event_type={ev_type}")
        assert ev_excluded.status_code == 200
        assert all(e["event_type"] != ev_type for e in ev_excluded.json())
