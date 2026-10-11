"""Tests for Milestone M6: SSE Streaming, Time Machine historical playback, and Resource Footprint Benchmark."""

import json
import resource
import time
from datetime import timedelta

import pytest
from app.db.models import Check, Device, Incident, Observation, utcnow
from app.db.session import AsyncSessionLocal
from app.main import app
from httpx import ASGITransport, AsyncClient


@pytest.mark.asyncio
async def test_sse_streaming_endpoint():
    """Verify Server-Sent Events (SSE) stream emits status diff frames with devices and incidents."""
    from app.api.v1.stream import event_generator

    gen = event_generator()
    frame = await anext(gen)
    assert "event: status_diff" in frame
    assert "data:" in frame

    # Parse payload
    data_line = [line for line in frame.splitlines() if line.startswith("data:")][0]
    payload = json.loads(data_line[len("data:") :].strip())
    assert "devices" in payload
    assert "links" in payload
    assert "ts" in payload

    await gen.aclose()


@pytest.mark.asyncio
async def test_timemachine_historical_snapshot():
    """Verify Time Machine endpoint returns past state snapshots accurately."""
    async with AsyncSessionLocal() as session:
        t_past = utcnow() - timedelta(hours=2)

        # Device
        dev = Device(
            id="test-timemachine-nas",
            name="NAS Storico",
            kind="nas",
            status="ok",
            criticality=4,
            addresses_json="{}",
            tags_json="[]",
            roles_json="[]",
        )
        session.add(dev)
        await session.flush()

        chk = Check(
            id="test-tm-chk-ping",
            device_id=dev.id,
            type="ping",
            name="Ping NAS",
            current_status="ok",
            status_since=utcnow(),
        )
        session.add(chk)
        await session.flush()

        # Historical observation at t_past
        obs_past = Observation(
            ts=t_past - timedelta(minutes=5),
            device_id=dev.id,
            check_id=chk.id,
            status="crit",
            value=0.0,
            details_json="{}",
        )
        session.add(obs_past)

        # Historical incident active at t_past
        inc_past = Incident(
            id="inc-timemachine-1",
            status="resolved",
            started_at=t_past - timedelta(minutes=20),
            resolved_at=t_past + timedelta(minutes=10),
            root_cause_device_id=dev.id,
            root_cause_category="server",
            confidence=0.95,
            summary="NAS crash test",
        )
        session.add(inc_past)
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Query during past incident
        iso_during = t_past.isoformat()
        res_during = await client.get(f"/api/v1/timemachine/snapshot?target_time={iso_during}")
        assert res_during.status_code == 200
        data_during = res_during.json()
        assert data_during["active_incident"] is not None
        assert data_during["active_incident"]["id"] == "inc-timemachine-1"
        target_dev = [d for d in data_during["devices"] if d["id"] == "test-timemachine-nas"][0]
        assert target_dev["status"] == "down"

        # 2. Query after resolution (e.g. now)
        iso_after = utcnow().isoformat()
        res_after = await client.get(f"/api/v1/timemachine/snapshot?target_time={iso_after}")
        assert res_after.status_code == 200
        data_after = res_after.json()
        assert data_after["active_incident"] is None


@pytest.mark.asyncio
async def test_resource_and_performance_benchmark():
    """Verify NetSentinel runs with minimal CPU/RAM footprint (< 200MB RAM, fast cycles)."""
    # Memory benchmark via getrusage
    usage = resource.getrusage(resource.RUSAGE_SELF)
    max_rss_mb = (usage.ru_maxrss / (1024 * 1024)) if usage.ru_maxrss > 10000000 else (usage.ru_maxrss / 1024)
    assert max_rss_mb < 200.0, f"Uso memoria eccessivo: {max_rss_mb:.2f} MB >= 200 MB"

    # CPU/Execution speed benchmark: 50 observations in batch
    async with AsyncSessionLocal() as session:
        bdev = Device(
            id="benchmark-dev",
            name="Benchmark Device",
            kind="server",
            status="ok",
            criticality=2,
            addresses_json="{}",
            tags_json="[]",
            roles_json="[]",
        )
        session.add(bdev)
        await session.flush()

        bchk = Check(
            id="benchmark-chk",
            device_id=bdev.id,
            type="ping",
            name="Bench Check",
            current_status="ok",
            status_since=utcnow(),
        )
        session.add(bchk)
        await session.flush()

        t0 = time.perf_counter()
        for i in range(50):
            obs = Observation(
                ts=utcnow(),
                device_id=bdev.id,
                check_id=bchk.id,
                status="ok",
                value=float(i),
                details_json="{}",
            )
            session.add(obs)
        await session.commit()
        elapsed = time.perf_counter() - t0

        # Clean up benchmark entities to keep DB pristine
        from sqlalchemy import delete
        await session.execute(delete(Observation).where(Observation.device_id == bdev.id))
        await session.execute(delete(Check).where(Check.device_id == bdev.id))
        await session.execute(delete(Device).where(Device.id == bdev.id))
        await session.commit()

    assert elapsed < 0.50, f"Tempo di inserimento batch troppo lento: {elapsed:.3f}s"

