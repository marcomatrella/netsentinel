"""Tests for Milestone M3: Automated Topology Deduction, Canvas Management, and Dry-Run Simulation."""

from pathlib import Path

import pytest
from app.db.models import ConfigVersion, Device, Link
from app.db.session import AsyncSessionLocal, init_db
from app.main import app
from app.schemas.config_yaml import NetSentinelConfigYaml
from app.topology.deduction import deduce_dependencies_from_topology
from httpx import ASGITransport, AsyncClient


@pytest.mark.asyncio
async def test_m3_automated_dependency_deduction_home_lab():
    """M3 Acceptance: Verify that drawing the Section 13 reference network automatically deduces all expected dependencies."""
    ref_yaml = Path("examples/home-lab.yaml").read_text()
    config = NetSentinelConfigYaml.from_yaml(ref_yaml)

    # Convert config devices and links to models for deduction
    devices = [
        Device(
            id=d.id,
            name=d.name,
            kind=d.kind,
            roles_json=d.roles,
        )
        for d in config.devices
    ]
    # Keep json format string
    for d in devices:
        import json
        d.roles_json = json.dumps(d.roles_json)

    links = [
        Link(
            id=lnk.id,
            from_device_id=lnk.from_device,
            to_device_id=lnk.to_device,
            medium=lnk.medium,
            poe=lnk.poe,
        )
        for lnk in config.links
    ]

    deduced = deduce_dependencies_from_topology(
        devices=devices,
        links=links,
        vantage_point_id=config.vantage_point,
    )

    # Convert deduced into set of tuples (dependent_id, provider_id, kind)
    deduced_set = {(d.dependent_id, d.provider_id, d.kind) for d in deduced}

    # Verify critical expected relationships from Section 13
    # 1. Router depends on WAN for wan
    assert ("gateway-router", "wan-internet", "wan") in deduced_set

    # 2. Switch depends on Router for gateway
    assert ("switch-core", "gateway-router", "l3_gateway") in deduced_set

    # 3. AP Salotto depends on PoE injector for power and l2
    assert ("ap-livingroom", "poe-injector-ap-a", "power") in deduced_set
    assert ("ap-livingroom", "poe-injector-ap-a", "l2_path") in deduced_set

    # 4. PoE injector depends on switch for l2_path
    assert ("poe-injector-ap-a", "switch-core", "l2_path") in deduced_set

    # 5. NAS depends on UPS for power
    assert ("synology-nas", "ups-rack", "power") in deduced_set

    # 6. Switch and Router depend on UPS for power
    assert ("switch-core", "ups-rack", "power") in deduced_set
    assert ("gateway-router", "ups-rack", "power") in deduced_set

    # 7. Clients depend on NAS for dhcp and dns
    assert ("clients-lan", "synology-nas", "dhcp") in deduced_set
    assert ("clients-lan", "synology-nas", "dns") in deduced_set

    # 8. Clients depend on AP Salotto for Wi-Fi (l2_path)
    assert ("clients-lan", "ap-livingroom", "l2_path") in deduced_set


@pytest.mark.asyncio
async def test_topology_api_endpoints():
    """Verify GET /topology, POST /topology/deduce, and POST /topology/apply."""
    await init_db()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Deduce via REST API
        deduce_payload = {
            "vantage_point_id": "nas",
            "devices": [
                {"id": "nas", "name": "NAS", "kind": "nas", "roles": ["vantage_point", "dhcp_server"]},
                {"id": "switch", "name": "Switch", "kind": "switch", "roles": []},
                {"id": "client1", "name": "Phone", "kind": "client", "roles": []},
            ],
            "links": [
                {"id": "l1", "from": "nas", "to": "switch", "medium": "ethernet"},
                {"id": "l2", "from": "switch", "to": "client1", "medium": "ethernet"},
            ],
        }
        res_deduce = await client.post("/api/v1/topology/deduce", json=deduce_payload)
        assert res_deduce.status_code == 200
        deps = res_deduce.json()
        assert len(deps) >= 2
        # Client depends on switch for L2, and NAS for DHCP
        kinds = {d["kind"] for d in deps}
        assert "l2_path" in kinds
        assert "dhcp" in kinds

        # 2. Apply topology
        apply_payload = {
            "vantage_point_id": "nas",
            "description": "Initial canvas configuration test",
            "devices": deduce_payload["devices"],
            "links": deduce_payload["links"],
            "dependencies": deps,
            "layout": {
                "nodes": [{"id": "nas", "position": {"x": 100, "y": 100}}],
                "edges": [{"id": "e1", "source": "nas", "target": "switch"}],
                "groups": [],
            },
        }
        res_apply = await client.post("/api/v1/topology/apply", json=apply_payload)
        assert res_apply.status_code == 200
        assert res_apply.json()["status"] == "applied"

        # 3. Verify version snapshot created
        async with AsyncSessionLocal() as session:
            from sqlalchemy import select
            v_res = await session.execute(select(ConfigVersion))
            versions = v_res.scalars().all()
            assert len(versions) >= 1
            assert "Initial canvas" in versions[-1].description

        # 4. Verify GET /topology reflects the applied state
        res_full = await client.get("/api/v1/topology")
        assert res_full.status_code == 200
        full_data = res_full.json()
        assert len(full_data["devices"]) == 3
        assert len(full_data["links"]) == 2
        assert full_data["layout"] is not None
        assert len(full_data["layout"]["nodes"]) == 1


@pytest.mark.asyncio
async def test_dry_run_simulation():
    """Verify POST /simulate/failure produces accurate diagnosis and alert previews without altering live state."""
    await init_db()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Setup small network
        apply_payload = {
            "vantage_point_id": "nas",
            "description": "Simulation test",
            "devices": [
                {"id": "nas", "name": "NAS", "kind": "nas", "roles": ["vantage_point"]},
                {"id": "switch", "name": "Switch", "kind": "switch", "roles": []},
                {"id": "ap", "name": "AP Living", "kind": "access_point", "roles": []},
            ],
            "links": [
                {"id": "l1", "from": "nas", "to": "switch", "medium": "ethernet"},
                {"id": "l2", "from": "switch", "to": "ap", "medium": "ethernet"},
            ],
            "dependencies": [
                {"id": "d1", "dependent": "switch", "provider": "nas", "kind": "l2_path"},
                {"id": "d2", "dependent": "ap", "provider": "switch", "kind": "l2_path"},
            ],
            "layout": {"nodes": [], "edges": [], "groups": []},
        }
        await client.post("/api/v1/topology/apply", json=apply_payload)

        # Run dry-run simulation of switch failure
        sim_req = {"failed_device_ids": ["switch"]}
        sim_res = await client.post("/api/v1/simulate/failure", json=sim_req)
        assert sim_res.status_code == 200
        data = sim_res.json()

        assert data["root_cause_device_id"] == "switch"
        assert data["root_cause_category"] == "network_device"
        assert data["confidence"] >= 0.90
        assert "switch" in data["diagnosis_title"].lower()
        # AP should be in impacted list as a symptom
        assert "ap" in data["impacted_devices"]
        assert data["symptoms"].get("ap") == "unreachable"
        # Fault path: from nas -> switch
        assert data["fault_path"] == ["nas", "switch"]
