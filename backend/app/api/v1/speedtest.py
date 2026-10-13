"""Speedtest API endpoints using lightweight, high-performance edge probes."""

import asyncio
import json
import logging
import statistics
import time
from collections.abc import AsyncGenerator
from typing import Any

import httpx
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

logger = logging.getLogger("netsentinel.api.speedtest")

router = APIRouter(prefix="/speedtest", tags=["Speedtest"])

SPEEDTEST_HEADERS = {
    "User-Agent": "curl/8.7.1",
    "Accept": "*/*",
}


async def _run_speedtest_generator() -> AsyncGenerator[str, None]:
    """Execute high-speed edge probe and yield incremental SSE events."""
    try:
        # Initial event: starting probe
        yield f"data: {json.dumps({'stage': 'init', 'progress': 5, 'message': 'Ricerca server ottimale...'})}\n\n"
        await asyncio.sleep(0.05)

        async with httpx.AsyncClient(headers=SPEEDTEST_HEADERS, timeout=25.0) as client:
            # 1. Server metadata and Ping / Jitter
            yield f"data: {json.dumps({'stage': 'ping', 'progress': 15, 'message': 'Misurazione latenza e jitter...'})}\n\n"
            latencies: list[float] = []
            last_resp = None

            for i in range(4):
                t0 = time.perf_counter()
                r = await client.get("https://speed.cloudflare.com/__down?bytes=0")
                elapsed_ms = (time.perf_counter() - t0) * 1000
                latencies.append(elapsed_ms)
                last_resp = r
                yield f"data: {json.dumps({'stage': 'ping', 'progress': 15 + (i + 1) * 5, 'current_ping_ms': round(elapsed_ms, 1)})}\n\n"
                await asyncio.sleep(0.05)

            meta_city = last_resp.headers.get("city", "Milano") if last_resp else "Milano"
            meta_country = last_resp.headers.get("country", "IT") if last_resp else "IT"
            meta_colo = last_resp.headers.get("colo", "MXP") if last_resp else "MXP"
            meta_asn = last_resp.headers.get("asn", "WAN") if last_resp else "WAN"

            ping_ms = round(min(latencies), 1)
            jitter_ms = round(statistics.stdev(latencies), 1) if len(latencies) > 1 else 0.0

            server_info = {
                "name": f"Cloudflare Edge ({meta_colo})",
                "location": f"{meta_city}, {meta_country}",
                "isp": f"AS{meta_asn}",
                "colo": meta_colo,
            }

            yield f"data: {json.dumps({'stage': 'ping_done', 'progress': 35, 'ping_ms': ping_ms, 'jitter_ms': jitter_ms, 'server': server_info})}\n\n"
            await asyncio.sleep(0.1)

            # 2. Download speed test (multi-stage progressive)
            yield f"data: {json.dumps({'stage': 'download', 'progress': 40, 'message': 'Test download in corso...'})}\n\n"

            # Warm-up / Stage 1 download (2MB)
            t_warm = time.perf_counter()
            r_warm = await client.get("https://speed.cloudflare.com/__down?bytes=2000000")
            dur_warm = max(0.001, time.perf_counter() - t_warm)
            warm_mbps = (len(r_warm.content) * 8) / (dur_warm * 1e6)
            yield f"data: {json.dumps({'stage': 'download', 'progress': 50, 'download_mbps': round(warm_mbps, 1)})}\n\n"
            await asyncio.sleep(0.05)

            # Full Stage 2 download (8MB)
            t_dl = time.perf_counter()
            r_dl = await client.get("https://speed.cloudflare.com/__down?bytes=8000000")
            dur_dl = max(0.001, time.perf_counter() - t_dl)

            # Weighted average for download speed
            total_dl_bytes = len(r_warm.content) + len(r_dl.content)
            total_dl_dur = dur_warm + dur_dl
            final_dl_mbps = round((total_dl_bytes * 8) / (total_dl_dur * 1e6), 1)

            yield f"data: {json.dumps({'stage': 'download_done', 'progress': 70, 'download_mbps': final_dl_mbps})}\n\n"
            await asyncio.sleep(0.1)

            # 3. Upload speed test
            yield f"data: {json.dumps({'stage': 'upload', 'progress': 75, 'message': 'Test upload in corso...'})}\n\n"

            # Stage 1 upload (1.5MB)
            payload_1 = b"0" * (1500 * 1024)
            t_up1 = time.perf_counter()
            await client.post("https://speed.cloudflare.com/__up", content=payload_1)
            dur_up1 = max(0.001, time.perf_counter() - t_up1)
            up1_mbps = (len(payload_1) * 8) / (dur_up1 * 1e6)
            yield f"data: {json.dumps({'stage': 'upload', 'progress': 85, 'upload_mbps': round(up1_mbps, 1)})}\n\n"
            await asyncio.sleep(0.05)

            # Stage 2 upload (3.5MB)
            payload_2 = b"1" * (3500 * 1024)
            t_up2 = time.perf_counter()
            await client.post("https://speed.cloudflare.com/__up", content=payload_2)
            dur_up2 = max(0.001, time.perf_counter() - t_up2)

            total_up_bytes = len(payload_1) + len(payload_2)
            total_up_dur = dur_up1 + dur_up2
            final_up_mbps = round((total_up_bytes * 8) / (total_up_dur * 1e6), 1)

            # 4. Final summary event
            yield f"data: {json.dumps({\
                'stage': 'complete',\
                'progress': 100,\
                'ping_ms': ping_ms,\
                'jitter_ms': jitter_ms,\
                'download_mbps': final_dl_mbps,\
                'upload_mbps': final_up_mbps,\
                'server': server_info,\
                'timestamp': time.time(),\
            })}\n\n"

    except Exception as e:
        logger.error("Errore durante l'esecuzione dello speedtest: %s", e)
        yield f"data: {json.dumps({'stage': 'error', 'message': f'Errore speedtest: {e}'})}\n\n"


@router.get("/run", summary="Esegue speedtest di rete con streaming SSE progressivo")
async def run_speedtest() -> StreamingResponse:
    """Streams live speedtest execution events (ping, jitter, download, upload, server metadata)."""
    return StreamingResponse(
        _run_speedtest_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/probe-sync", summary="Esegue speedtest sincrono (fallback)")
async def run_speedtest_sync() -> dict[str, Any]:
    """Synchronous one-shot speedtest measurement."""
    events = []
    async for raw in _run_speedtest_generator():
        if raw.startswith("data: "):
            try:
                events.append(json.loads(raw[6:].strip()))
            except Exception:
                pass
    complete_event = next((ev for ev in reversed(events) if ev.get("stage") == "complete"), None)
    if complete_event:
        return complete_event
    return {"error": "Speedtest fallito o interrotto."}
