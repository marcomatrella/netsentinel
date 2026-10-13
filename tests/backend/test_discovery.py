"""Tests for network discovery and quick ping probe endpoints."""

import pytest
from app.main import app
from httpx import ASGITransport, AsyncClient


@pytest.mark.asyncio
async def test_quick_ping_probe_localhost():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/v1/discovery/ping", json={"target": "127.0.0.1", "timeout_seconds": 1.0})
        assert resp.status_code == 200
        data = resp.json()
        assert data["target"] == "127.0.0.1"
        assert isinstance(data["reachable"], bool)


@pytest.mark.asyncio
async def test_quick_ping_probe_unreachable():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/v1/discovery/ping", json={"target": "192.0.2.1", "timeout_seconds": 0.5})
        assert resp.status_code == 200
        data = resp.json()
        assert data["target"] == "192.0.2.1"
        assert data["reachable"] is False


@pytest.mark.asyncio
async def test_network_scan_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/discovery/scan")
        assert resp.status_code == 200
        data = resp.json()
        assert "devices" in data
        assert isinstance(data["devices"], list)


@pytest.mark.asyncio
async def test_batch_delete_devices_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Create a test device first
        create_resp = await client.post(
            "/api/v1/devices",
            json={
                "id": "test-batch-del-dev-1",
                "name": "Test Batch Delete Device",
                "kind": "client",
                "roles": ["passive_tracking"],
                "addresses": {"ip": "192.168.1.249"},
            },
        )
        assert create_resp.status_code in [200, 201]

        # Call batch delete
        del_resp = await client.post(
            "/api/v1/devices/batch-delete",
            json={"device_ids": ["test-batch-del-dev-1"]},
        )
        assert del_resp.status_code == 200
        del_data = del_resp.json()
        assert del_data["deleted_count"] == 1
        assert "test-batch-del-dev-1" in del_data["deleted_ids"]
