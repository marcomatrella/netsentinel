"""Tests for Milestone M2: Topological Correlation Engine and Scenario Suite."""

import json
from pathlib import Path

import pytest
import yaml
from app.correlation.engine import correlation_engine
from app.db.models import Dependency, Device, Incident, Link, utcnow
from app.db.session import AsyncSessionLocal, init_db
from app.main import app
from httpx import ASGITransport, AsyncClient


async def _load_scenario_topology(session, scenario_data: dict):
    """Helper to populate DB with a scenario's topology and device states."""
    topo = scenario_data["topology"]
    vp_id = topo.get("vantage_point")

    # Add devices
    for d in topo["devices"]:
        roles = d.get("roles", [])
        if d["id"] == vp_id and "vantage_point" not in roles:
            roles.append("vantage_point")

        dev = Device(
            id=d["id"],
            name=d["name"],
            kind=d["kind"],
            criticality=d.get("criticality", 3),
            roles_json=json.dumps(roles),
            status=scenario_data["device_states"].get(d["id"], "ok"),
            status_since=utcnow(),
        )
        session.add(dev)
    await session.flush()

    # Add links
    for lnk in topo.get("links", []):
        link = Link(
            id=lnk["id"],
            from_device_id=lnk["from"],
            to_device_id=lnk["to"],
            medium=lnk.get("medium", "ethernet"),
            poe=lnk.get("poe", False),
            status="ok",
        )
        session.add(link)
    await session.flush()

    # Add dependencies
    for dep in topo.get("dependencies", []):
        dependency = Dependency(
            id=dep["id"],
            dependent_id=dep["dependent"],
            provider_id=dep["provider"],
            kind=dep["kind"],
            strength=dep.get("strength", "hard"),
            source="inferred",
        )
        session.add(dependency)

    await session.commit()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "scenario_file",
    [
        "scenario_01_wan_loss.yaml",
        "scenario_02_gateway_down.yaml",
        "scenario_06_switch_down.yaml",
        "scenario_07_nas_dhcp_dns_down.yaml",
        "scenario_11_vantage_point_isolated.yaml",
    ],
)
async def test_correlation_single_root_cause_scenarios(scenario_file: str):
    """Verify that each single-failure scenario isolates the exact root cause and creates 1 incident."""
    scenario_path = Path("tests/scenarios") / scenario_file
    assert scenario_path.exists(), f"File non trovato: {scenario_path}"
    scenario = yaml.safe_load(scenario_path.read_text())

    await init_db()
    async with AsyncSessionLocal() as session:
        await _load_scenario_topology(session, scenario)

        # Run correlation engine
        incidents = await correlation_engine.run_correlation_cycle(session)

        exp = scenario["expected"]
        assert len(incidents) == exp.get("incident_count", 1)

        inc = incidents[0]
        if "root_cause_device_id" in exp:
            assert inc.root_cause_device_id == exp["root_cause_device_id"]
        if "root_cause_category" in exp:
            assert inc.root_cause_category == exp["root_cause_category"]
        if "confidence_min" in exp:
            assert inc.confidence >= exp["confidence_min"]
        if "key_phrase" in exp:
            assert exp["key_phrase"].lower() in inc.summary.lower()

        # Verify symptoms marked as unreachable or affected (honesty of knowledge)
        for symptom_id in exp.get("symptoms", []):
            symptom_dev = await session.get(Device, symptom_id)
            assert symptom_dev is not None
            assert symptom_dev.status in ["unreachable", "affected", "down"]
            # Must be listed in impacted list
            impacted = json.loads(inc.impacted_json)
            assert symptom_id in impacted


@pytest.mark.asyncio
async def test_multiple_independent_failures_scenario():
    """Verify multiple independent simultaneous failures generate distinct incidents without confusion."""
    scenario_path = Path("tests/scenarios/scenario_multiple_independent_failures.yaml")
    scenario = yaml.safe_load(scenario_path.read_text())

    await init_db()
    async with AsyncSessionLocal() as session:
        await _load_scenario_topology(session, scenario)

        incidents = await correlation_engine.run_correlation_cycle(session)
        assert len(incidents) == 2

        found_causes = {inc.root_cause_device_id for inc in incidents}
        assert found_causes == {"ap-livingroom", "home-server"}


@pytest.mark.asyncio
async def test_root_cause_shift_and_incident_resolution():
    """Verify that root cause updates when upstream fails and resolves cleanly when network recovers."""
    await init_db()
    async with AsyncSessionLocal() as session:
        # Topology: NAS (VP) -> Switch -> AP
        nas = Device(id="nas", name="NAS", kind="nas", roles_json='["vantage_point"]', status="ok")
        switch = Device(id="switch", name="Switch", kind="switch", status="ok")
        ap = Device(id="ap", name="AP", kind="access_point", status="down")
        session.add_all([nas, switch, ap])
        await session.flush()

        session.add(Link(id="l1", from_device_id="nas", to_device_id="switch", medium="ethernet"))
        session.add(Link(id="l2", from_device_id="switch", to_device_id="ap", medium="ethernet"))
        await session.flush()

        session.add(Dependency(id="d1", dependent_id="nas", provider_id="switch", kind="l2_path"))
        session.add(Dependency(id="d2", dependent_id="ap", provider_id="switch", kind="l2_path"))
        await session.commit()

        # Cycle 1: AP is down, Switch is OK
        incidents1 = await correlation_engine.run_correlation_cycle(session)
        assert len(incidents1) == 1
        assert incidents1[0].root_cause_device_id == "ap"

        # Cycle 2: Switch also goes down (upstream failure)
        switch.status = "down"
        await session.commit()

        incidents2 = await correlation_engine.run_correlation_cycle(session)
        assert len(incidents2) == 1
        # Incident root cause should have shifted to switch!
        assert incidents2[0].root_cause_device_id == "switch"
        assert "root_cause_shift" in incidents2[0].timeline_json

        # Cycle 3: Everything recovers
        switch.status = "ok"
        ap.status = "ok"
        await session.commit()

        incidents3 = await correlation_engine.run_correlation_cycle(session)
        assert len(incidents3) == 0

        # Verify previous incident was marked as resolved
        resolved_inc = await session.get(Incident, incidents2[0].id)
        assert resolved_inc.status == "resolved"
        assert resolved_inc.resolved_at is not None


@pytest.mark.asyncio
async def test_incident_rest_api_lifecycle():
    """Verify listing, detail and acknowledge endpoints via REST API."""
    await init_db()
    transport = ASGITransport(app=app)

    async with AsyncSessionLocal() as session:
        inc = Incident(
            id="inc-api-test-01",
            status="open",
            root_cause_device_id="switch-core",
            root_cause_category="network_device",
            confidence=0.95,
            summary="Switch principale non raggiungibile",
            impacted_json='["gateway", "ap"]',
            evidence_json='[{"device_id": "switch-core", "status": "down", "ts": "2026-10-11T10:00:00", "message": "Down"}]',
            timeline_json='[{"ts": "2026-10-11T10:00:00", "event_type": "incident_opened", "message": "Aperto"}]',
            recommendations_json='["Controlla cavo", "Verifica alimentazione"]',
        )
        session.add(inc)
        await session.commit()

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # GET /api/v1/incidents
        resp = await client.get("/api/v1/incidents")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert data[0]["id"] == "inc-api-test-01"

        # GET /api/v1/incidents/{id}
        resp_detail = await client.get("/api/v1/incidents/inc-api-test-01")
        assert resp_detail.status_code == 200
        detail = resp_detail.json()
        assert detail["confidence"] == 0.95
        assert len(detail["recommendations"]) == 2
        assert len(detail["impacted"]) == 2

        # POST /api/v1/incidents/{id}/acknowledge
        resp_ack = await client.post(
            "/api/v1/incidents/inc-api-test-01/acknowledge",
            json={"acknowledged_by": "marco"},
        )
        assert resp_ack.status_code == 200
        ack_data = resp_ack.json()
        assert ack_data["acknowledged_by"] == "marco"
        assert ack_data["status"] == "monitoring"
