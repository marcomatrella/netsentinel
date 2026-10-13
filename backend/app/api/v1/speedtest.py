"""Speedtest API endpoints supporting Ookla Speedtest servers and Cloudflare Edge."""

import asyncio
import json
import logging
import statistics
import time
from collections.abc import AsyncGenerator
from typing import Any

import httpx
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

logger = logging.getLogger("netsentinel.api.speedtest")

router = APIRouter(prefix="/speedtest", tags=["Speedtest"])

SPEEDTEST_HEADERS = {
    "User-Agent": "curl/8.7.1",
    "Accept": "*/*",
}

# Curated high-performance test servers in Italy and major hubs
SPEEDTEST_SERVERS: list[dict[str, Any]] = [
    {
        "id": "auto",
        "name": "Automatico (Cloudflare Anycast)",
        "sponsor": "Cloudflare",
        "city": "Edge più vicino",
        "country": "IT",
        "type": "cloudflare",
        "base_url": "https://speed.cloudflare.com",
    },
    {
        "id": "roma_iliad",
        "name": "Iliad Italia (Roma)",
        "sponsor": "Iliad Italia S.p.A.",
        "city": "Roma",
        "country": "IT",
        "type": "ookla",
        "base_url": "http://speedtest-roma.proxad.it:8080/speedtest",
    },
    {
        "id": "roma_vodafone",
        "name": "Vodafone IT (Roma)",
        "sponsor": "Vodafone Italy",
        "city": "Roma",
        "country": "IT",
        "type": "ookla",
        "base_url": "http://speedtestrm1.vodafone.it:8080/speedtest",
    },
    {
        "id": "milano_iliad",
        "name": "Iliad Italia (Milano)",
        "sponsor": "Iliad Italia S.p.A.",
        "city": "Milano",
        "country": "IT",
        "type": "ookla",
        "base_url": "http://speedtest-milano.proxad.it:8080/speedtest",
    },
    {
        "id": "milano_eolo",
        "name": "EOLO (Milano)",
        "sponsor": "EOLO SpA",
        "city": "Milano",
        "country": "IT",
        "type": "ookla",
        "base_url": "http://test.eolo.it:8080/speedtest",
    },
    {
        "id": "napoli_fastweb",
        "name": "Fastweb (Napoli)",
        "sponsor": "Fastweb SpA",
        "city": "Napoli",
        "country": "IT",
        "type": "ookla",
        "base_url": "http://cmp1-ookla.perf.fastedge.it:8080/speedtest",
    },
]


@router.get("/servers", summary="Restituisce la lista dei server speedtest disponibili")
async def get_speedtest_servers() -> list[dict[str, Any]]:
    """Returns the list of available test servers."""
    return [
        {
            "id": s["id"],
            "name": s["name"],
            "sponsor": s["sponsor"],
            "city": s["city"],
            "country": s["country"],
        }
        for s in SPEEDTEST_SERVERS
    ]


async def _run_speedtest_generator(server_id: str = "auto") -> AsyncGenerator[str, None]:
    """Execute high-speed edge probe and yield incremental SSE events."""
    target_server = next((s for s in SPEEDTEST_SERVERS if s["id"] == server_id), SPEEDTEST_SERVERS[0])

    try:
        srv_name = target_server["name"]
        yield f"data: {json.dumps({'stage': 'init', 'progress': 5, 'message': f'Connessione a {srv_name}...'})}\n\n"
        await asyncio.sleep(0.05)

        async with httpx.AsyncClient(headers=SPEEDTEST_HEADERS, timeout=25.0) as client:
            is_ookla = target_server["type"] == "ookla"
            base_url = target_server["base_url"]

            # 1. Server metadata and Ping / Jitter
            yield f"data: {json.dumps({'stage': 'ping', 'progress': 15, 'message': 'Misurazione latenza e jitter...'})}\n\n"
            latencies: list[float] = []

            ping_url = f"{base_url}/latency.txt" if is_ookla else f"{base_url}/__down?bytes=0"

            last_resp = None
            for i in range(4):
                t0 = time.perf_counter()
                r = await client.get(ping_url)
                elapsed_ms = (time.perf_counter() - t0) * 1000
                latencies.append(elapsed_ms)
                last_resp = r
                yield f"data: {json.dumps({'stage': 'ping', 'progress': 15 + (i + 1) * 5, 'current_ping_ms': round(elapsed_ms, 1)})}\n\n"
                await asyncio.sleep(0.04)

            ping_ms = round(min(latencies), 1)
            jitter_ms = round(statistics.stdev(latencies), 1) if len(latencies) > 1 else 0.0

            if is_ookla:
                server_info = {
                    "name": target_server["sponsor"],
                    "location": f"{target_server['city']}, {target_server['country']}",
                    "isp": target_server["sponsor"],
                    "colo": target_server["city"],
                }
            else:
                meta_city = last_resp.headers.get("city", "Milano") if last_resp else "Milano"
                meta_country = last_resp.headers.get("country", "IT") if last_resp else "IT"
                meta_colo = last_resp.headers.get("colo", "MXP") if last_resp else "MXP"
                meta_asn = last_resp.headers.get("asn", "WAN") if last_resp else "WAN"
                server_info = {
                    "name": f"Cloudflare Edge ({meta_colo})",
                    "location": f"{meta_city}, {meta_country}",
                    "isp": f"AS{meta_asn}",
                    "colo": meta_colo,
                }

            yield f"data: {json.dumps({'stage': 'ping_done', 'progress': 35, 'ping_ms': ping_ms, 'jitter_ms': jitter_ms, 'server': server_info})}\n\n"
            await asyncio.sleep(0.08)

            # 2. Download speed test
            yield f"data: {json.dumps({'stage': 'download', 'progress': 40, 'message': 'Test download in corso...'})}\n\n"

            if is_ookla:
                # Stage 1: ~1.98MB
                t_warm = time.perf_counter()
                r_warm = await client.get(f"{base_url}/random1000x1000.jpg")
                dur_warm = max(0.001, time.perf_counter() - t_warm)
                warm_mbps = (len(r_warm.content) * 8) / (dur_warm * 1e6)
                yield f"data: {json.dumps({'stage': 'download', 'progress': 50, 'download_mbps': round(warm_mbps, 1)})}\n\n"
                await asyncio.sleep(0.04)

                # Stage 2: ~7.9MB
                t_dl = time.perf_counter()
                r_dl = await client.get(f"{base_url}/random2000x2000.jpg")
                dur_dl = max(0.001, time.perf_counter() - t_dl)

                total_dl_bytes = len(r_warm.content) + len(r_dl.content)
                total_dl_dur = dur_warm + dur_dl
                final_dl_mbps = round((total_dl_bytes * 8) / (total_dl_dur * 1e6), 1)
            else:
                # Cloudflare download
                t_warm = time.perf_counter()
                r_warm = await client.get(f"{base_url}/__down?bytes=2000000")
                dur_warm = max(0.001, time.perf_counter() - t_warm)
                warm_mbps = (len(r_warm.content) * 8) / (dur_warm * 1e6)
                yield f"data: {json.dumps({'stage': 'download', 'progress': 50, 'download_mbps': round(warm_mbps, 1)})}\n\n"
                await asyncio.sleep(0.04)

                t_dl = time.perf_counter()
                r_dl = await client.get(f"{base_url}/__down?bytes=8000000")
                dur_dl = max(0.001, time.perf_counter() - t_dl)

                total_dl_bytes = len(r_warm.content) + len(r_dl.content)
                total_dl_dur = dur_warm + dur_dl
                final_dl_mbps = round((total_dl_bytes * 8) / (total_dl_dur * 1e6), 1)

            yield f"data: {json.dumps({'stage': 'download_done', 'progress': 70, 'download_mbps': final_dl_mbps})}\n\n"
            await asyncio.sleep(0.08)

            # 3. Upload speed test
            yield f"data: {json.dumps({'stage': 'upload', 'progress': 75, 'message': 'Test upload in corso...'})}\n\n"

            up_url = f"{base_url}/upload.php" if is_ookla else f"{base_url}/__up"

            # Stage 1 upload (1.5MB)
            payload_1 = b"0" * (1500 * 1024)
            t_up1 = time.perf_counter()
            await client.post(up_url, content=payload_1)
            dur_up1 = max(0.001, time.perf_counter() - t_up1)
            up1_mbps = (len(payload_1) * 8) / (dur_up1 * 1e6)
            yield f"data: {json.dumps({'stage': 'upload', 'progress': 85, 'upload_mbps': round(up1_mbps, 1)})}\n\n"
            await asyncio.sleep(0.04)

            # Stage 2 upload (3.5MB)
            payload_2 = b"1" * (3500 * 1024)
            t_up2 = time.perf_counter()
            await client.post(up_url, content=payload_2)
            dur_up2 = max(0.001, time.perf_counter() - t_up2)

            total_up_bytes = len(payload_1) + len(payload_2)
            total_up_dur = dur_up1 + dur_up2
            final_up_mbps = round((total_up_bytes * 8) / (total_up_dur * 1e6), 1)

            # 4. Final summary event
            complete_payload = {
                "stage": "complete",
                "progress": 100,
                "ping_ms": ping_ms,
                "jitter_ms": jitter_ms,
                "download_mbps": final_dl_mbps,
                "upload_mbps": final_up_mbps,
                "server": server_info,
                "timestamp": time.time(),
            }
            yield f"data: {json.dumps(complete_payload)}\n\n"

    except Exception as e:
        logger.error("Errore durante l'esecuzione dello speedtest: %s", e)
        yield f"data: {json.dumps({'stage': 'error', 'message': f'Errore speedtest: {e}'})}\n\n"


@router.get("/run", summary="Esegue speedtest di rete con streaming SSE progressivo")
async def run_speedtest(server_id: str = Query("auto", description="ID del server speedtest")) -> StreamingResponse:
    """Streams live speedtest execution events (ping, jitter, download, upload, server metadata)."""
    return StreamingResponse(
        _run_speedtest_generator(server_id=server_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/probe-sync", summary="Esegue speedtest sincrono (fallback)")
async def run_speedtest_sync(server_id: str = "auto") -> dict[str, Any]:
    """Synchronous one-shot speedtest measurement."""
    events = []
    async for raw in _run_speedtest_generator(server_id=server_id):
        if raw.startswith("data: "):
            try:
                events.append(json.loads(raw[6:].strip()))
            except Exception:
                pass
    complete_event = next((ev for ev in reversed(events) if ev.get("stage") == "complete"), None)
    if complete_event:
        return complete_event
    return {"error": "Speedtest fallito o interrotto."}
