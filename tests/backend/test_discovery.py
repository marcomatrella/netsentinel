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
