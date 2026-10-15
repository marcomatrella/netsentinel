"""Tests for Vantage Point uniqueness and synchronization across devices, topology and settings."""

import json

import pytest
from app.config import settings
from app.db.models import Device
from app.db.session import AsyncSessionLocal, init_db
from app.main import app
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select


async def _setup_two_devices(client: AsyncClient) -> None:
    apply_payload = {
        "vantage_point_id": "device_a",
        "description": "Vantage Point Test",
        "devices": [
            {
                "id": "device_a",
                "name": "NAS Synology",
                "kind": "nas",
                "roles": ["vantage_point"],
                "addresses": {"ip": "192.168.1.50"},
            },
            {
                "id": "device_b",
                "name": "Server Proxmox",
                "kind": "server",
                "roles": [],
                "addresses": {"ip": "192.168.1.60"},
            },
        ],
        "links": [
            {"id": "l1", "from": "device_a", "to": "device_b", "medium": "ethernet"},
        ],
        "dependencies": [],
        "layout": {"nodes": [], "edges": [], "groups": []},
    }
    res_apply = await client.post("/api/v1/topology/apply", json=apply_payload)
    assert res_apply.status_code == 200


@pytest.mark.asyncio
async def test_vantage_point_uniqueness_on_device_update():
    """Verify that setting vantage_point role on Device B removes it from Device A and updates settings."""
    await init_db()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await _setup_two_devices(client)

        # Verify initial state
        topo_res = await client.get("/api/v1/topology")
        assert topo_res.status_code == 200
        topo = topo_res.json()
        assert topo["vantage_point_id"] == "device_a"

        dev_a = next(d for d in topo["devices"] if d["id"] == "device_a")
        dev_b = next(d for d in topo["devices"] if d["id"] == "device_b")
        assert "vantage_point" in dev_a["roles"]
        assert "vantage_point" not in dev_b["roles"]
        assert settings.vantage_point_id == "device_a"

        # 2. Update device_b to become the vantage point
        patch_res = await client.patch(
            "/api/v1/devices/device_b", json={"roles": ["vantage_point"]}
        )
        assert patch_res.status_code == 200
        patched_b = patch_res.json()
        assert "vantage_point" in patched_b["roles"]

        # 3. Check topology and verify device_a NO LONGER has vantage_point
        topo_res_after = await client.get("/api/v1/topology")
        assert topo_res_after.status_code == 200
        topo_after = topo_res_after.json()
        assert topo_after["vantage_point_id"] == "device_b"

        dev_a_after = next(d for d in topo_after["devices"] if d["id"] == "device_a")
        dev_b_after = next(d for d in topo_after["devices"] if d["id"] == "device_b")
        assert "vantage_point" not in dev_a_after["roles"]
        assert "vantage_point" in dev_b_after["roles"]
        assert settings.vantage_point_id == "device_b"


@pytest.mark.asyncio
async def test_vantage_point_uniqueness_on_assign_roles():
    """Verify that assign-roles moves vantage_point role and keeps it singular."""
    await init_db()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await _setup_two_devices(client)

        # Move vantage point to device_b via assign-roles
        roles_payload = {
            "vantage_point_id": "device_b",
        }
        res = await client.post("/api/v1/topology/assign-roles", json=roles_payload)
        assert res.status_code == 200
        topo = res.json()

        assert topo["vantage_point_id"] == "device_b"
        dev_a = next(d for d in topo["devices"] if d["id"] == "device_a")
        dev_b = next(d for d in topo["devices"] if d["id"] == "device_b")
        assert "vantage_point" not in dev_a["roles"]
        assert "vantage_point" in dev_b["roles"]
        assert settings.vantage_point_id == "device_b"


@pytest.mark.asyncio
async def test_vantage_point_auto_healing_dirty_database():
    """Verify that if database has duplicate vantage points, system auto-heals and retains only one."""
    await init_db()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await _setup_two_devices(client)

        # Intentionally corrupt DB by giving both devices the vantage_point role
        async with AsyncSessionLocal() as session:
            res = await session.execute(
                select(Device).where(Device.id.in_(["device_a", "device_b"]))
            )
            for d in res.scalars().all():
                d.roles_json = json.dumps(["vantage_point"])
            await session.commit()

        # Query GET /api/v1/topology
        res = await client.get("/api/v1/topology")
        assert res.status_code == 200
        topo = res.json()

        vp_count = sum(1 for d in topo["devices"] if "vantage_point" in d["roles"])
        assert vp_count == 1
        assert topo["vantage_point_id"] in ["device_a", "device_b"]

        # Check direct DB state to ensure corruption was persisted away
        async with AsyncSessionLocal() as session:
            res = await session.execute(
                select(Device).where(Device.id.in_(["device_a", "device_b"]))
            )
            db_devs = res.scalars().all()
            db_vp_count = sum(
                1
                for d in db_devs
                if "vantage_point" in (json.loads(d.roles_json) if d.roles_json else [])
            )
            assert db_vp_count == 1
