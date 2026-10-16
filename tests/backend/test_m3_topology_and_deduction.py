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


@pytest.mark.asyncio
async def test_topology_templates_endpoint():
    """Verify GET /api/v1/topology/templates returns general-purpose network templates."""
    await init_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/topology/templates")
        assert res.status_code == 200
        templates = res.json()
        assert len(templates) >= 3
        template_ids = {t["id"] for t in templates}
        assert "homelab" in template_ids
        assert "simple_home" in template_ids
        assert "office" in template_ids

        # Verify homelab template structure
        hl = next(t for t in templates if t["id"] == "homelab")
        assert len(hl["devices"]) >= 8
        assert len(hl["links"]) >= 8
        assert hl["vantage_point_id"] == "nas-synology"


@pytest.mark.asyncio
async def test_assign_network_roles_endpoint():
    """Verify POST /topology/assign-roles successfully reallocates DNS/DHCP roles and deduces dependencies."""
    await init_db()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        apply_payload = {
            "vantage_point_id": "nas",
            "description": "Role transfer test",
            "devices": [
                {"id": "router", "name": "Router", "kind": "router", "roles": ["gateway", "dhcp_server", "dns_resolver"], "addresses": {"ip": "192.168.1.1"}},
                {"id": "nas", "name": "NAS AdGuard", "kind": "nas", "roles": ["vantage_point"], "addresses": {"ip": "192.168.1.50"}},
                {"id": "client1", "name": "PC", "kind": "client", "roles": [], "addresses": {"ip": "192.168.1.100"}},
            ],
            "links": [
                {"id": "l1", "from": "router", "to": "nas", "medium": "ethernet"},
                {"id": "l2", "from": "router", "to": "client1", "medium": "ethernet"},
            ],
            "dependencies": [],
            "layout": {"nodes": [], "edges": [], "groups": []},
        }
        await client.post("/api/v1/topology/apply", json=apply_payload)

        # Reassign DNS and DHCP to NAS (e.g. AdGuard Home container)
        roles_payload = {
            "dns_server_id": "nas",
            "dhcp_server_id": "nas",
            "gateway_id": "router",
            "vantage_point_id": "nas",
        }
        res = await client.post("/api/v1/topology/assign-roles", json=roles_payload)
        assert res.status_code == 200
        topo = res.json()

        # Check that NAS now has dns_resolver and dhcp_server
        nas_dev = next(d for d in topo["devices"] if d["id"] == "nas")
        assert "dns_resolver" in nas_dev["roles"]
        assert "dhcp_server" in nas_dev["roles"]

        # Check that Router no longer has dns_resolver or dhcp_server
        router_dev = next(d for d in topo["devices"] if d["id"] == "router")
        assert "dns_resolver" not in router_dev["roles"]
        assert "dhcp_server" not in router_dev["roles"]
        assert "gateway" in router_dev["roles"]

        # Verify dependencies: client depends on NAS for dns and dhcp
        dns_deps = [d for d in topo["dependencies"] if d["kind"] == "dns" and d["dependent_id"] == "client1"]
        assert len(dns_deps) == 1
        assert dns_deps[0]["provider_id"] == "nas"


def test_cascading_router_switch_devices_dependency_direction():
    """Verify that in a cascade of Router -> Switch -> Devices, Router does NOT depend on Switch."""
    import json

    devices = [
        Device(id="router-gw", name="Router Gateway", kind="router", roles_json=json.dumps(["gateway"])),
        Device(id="switch-netgear", name="Switch Netgear", kind="switch", roles_json=json.dumps([])),
        Device(id="nas-storage", name="NAS Synology", kind="nas", roles_json=json.dumps(["vantage_point"])),
        Device(id="pc-client", name="Workstation", kind="client", roles_json=json.dumps([])),
    ]

    links = [
        Link(id="l1", from_device_id="router-gw", to_device_id="switch-netgear", medium="ethernet", poe=False),
        Link(id="l2", from_device_id="switch-netgear", to_device_id="nas-storage", medium="ethernet", poe=False),
        Link(id="l3", from_device_id="switch-netgear", to_device_id="pc-client", medium="ethernet", poe=False),
    ]

    # Even if vantage point is on the downstream NAS:
    deduced = deduce_dependencies_from_topology(devices, links, vantage_point_id="nas-storage")
    deduced_set = {(d.dependent_id, d.provider_id, d.kind) for d in deduced}

    # 1. Switch MUST depend on Router for L2 path
    assert ("switch-netgear", "router-gw", "l2_path") in deduced_set

    # 2. Router MUST NOT depend on Switch!
    assert ("router-gw", "switch-netgear", "l2_path") not in deduced_set

    # 3. NAS and Client MUST depend on Switch for L2 path
    assert ("nas-storage", "switch-netgear", "l2_path") in deduced_set
    assert ("pc-client", "switch-netgear", "l2_path") in deduced_set

    # 4. Switch MUST NOT depend on NAS or Client
    assert ("switch-netgear", "nas-storage", "l2_path") not in deduced_set
    assert ("switch-netgear", "pc-client", "l2_path") not in deduced_set


@pytest.mark.asyncio
async def test_router_failure_simulation_preserves_lan_reachability():
    """Verify that simulating router failure does NOT take local LAN devices offline."""
    await init_db()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Topology: WAN <-> Router <-> Switch <-> [HA (VP), NAS, AP]
        apply_payload = {
            "vantage_point_id": "ha-host",
            "description": "User Topology Test",
            "devices": [
                {"id": "ha-host", "name": "Home Assistant", "kind": "server", "roles": ["vantage_point"]},
                {"id": "switch-core", "name": "Switch", "kind": "switch", "roles": []},
                {"id": "router-gw", "name": "Router", "kind": "router", "roles": ["gateway"]},
                {"id": "wan-inet", "name": "WAN", "kind": "wan_gateway", "roles": ["wan_provider"]},
                {"id": "nas-srv", "name": "NAS", "kind": "nas", "roles": ["dns_resolver", "dhcp_server"]},
                {"id": "ap-wifi", "name": "Access Point", "kind": "access_point", "roles": []},
            ],
            "links": [
                {"id": "l1", "from": "wan-inet", "to": "router-gw", "medium": "fiber"},
                {"id": "l2", "from": "router-gw", "to": "switch-core", "medium": "ethernet"},
                {"id": "l3", "from": "switch-core", "to": "ha-host", "medium": "ethernet"},
                {"id": "l4", "from": "switch-core", "to": "nas-srv", "medium": "ethernet"},
                {"id": "l5", "from": "switch-core", "to": "ap-wifi", "medium": "ethernet"},
            ],
            "dependencies": [],
            "layout": {"nodes": [], "edges": [], "groups": []},
        }
        await client.post("/api/v1/topology/apply", json=apply_payload)

        # Simulate router failure
        sim_res = await client.post("/api/v1/simulate/failure", json={"failed_device_ids": ["router-gw"]})
        assert sim_res.status_code == 200
        data = sim_res.json()

        assert data["root_cause_device_id"] == "router-gw"
        assert data["root_cause_category"] == "gateway"

        # WAN is physically unreachable because it is behind the router
        assert data["symptoms"].get("wan-inet") == "unreachable"

        # LAN devices MUST NOT have failure symptoms (they are completely healthy on LAN)
        assert data["symptoms"].get("switch-core") is None
        assert data["symptoms"].get("nas-srv") is None
        assert data["symptoms"].get("ap-wifi") is None
        assert data["symptoms"].get("ha-host") is None

        # Simulate WAN failure
        wan_sim_res = await client.post("/api/v1/simulate/failure", json={"failed_device_ids": ["wan-inet"]})
        assert wan_sim_res.status_code == 200
        wan_data = wan_sim_res.json()

        assert wan_data["root_cause_device_id"] == "wan-inet"
        assert wan_data["root_cause_category"] == "wan"
        # LAN is 100% healthy, no symptoms on any LAN device
        assert wan_data["symptoms"] == {}
        assert wan_data["impacted_devices"] == ["wan-inet"]




