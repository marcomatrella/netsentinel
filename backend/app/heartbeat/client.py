"""External dead-man's switch heartbeat client (Healthchecks.io compatible)."""

import asyncio
import logging

import httpx
from app.config import settings
from app.heartbeat.watchdog import watchdog

logger = logging.getLogger("netsentinel.heartbeat.client")


class HeartbeatClient:
    """Sends periodic heartbeats to an external monitoring service if internal health is green."""

    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._running: bool = False
        self.last_ping_status: str = "never"
        self.last_ping_time: str | None = None

    async def start(self) -> None:
        """Start background heartbeat loop."""
        if not settings.heartbeat_url:
            logger.info("Nessun URL heartbeat dead-man's switch configurato.")
            return

        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("Heartbeat client avviato verso: %s", settings.heartbeat_url)

    async def stop(self) -> None:
        """Stop background heartbeat loop."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def send_ping(self, force_url: str | None = None) -> tuple[bool, str]:
        """Evaluate watchdog health and perform single heartbeat ping."""
        target_url = force_url or settings.heartbeat_url
        if not target_url:
            return False, "Nessun URL heartbeat configurato"

        is_healthy, details = await watchdog.evaluate_health()
        if not is_healthy:
            msg = f"Watchdog ha bloccato il ping: sistema non in salute ({details})"
            logger.warning(msg)
            # Send fail ping to healthchecks.io if applicable
            try:
                fail_url = f"{target_url.rstrip('/')}/fail"
                async with httpx.AsyncClient(timeout=5.0) as client:
                    await client.post(fail_url, content=msg.encode("utf-8"))
            except Exception:
                pass
            return False, msg

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                body = f"NetSentinel v{settings.app_version} OK (DB: OK, Scheduler: OK)"
                resp = await client.post(target_url, content=body.encode("utf-8"))
                if resp.status_code == 200:
                    self.last_ping_status = "ok"
                    self.last_ping_time = asyncio.get_running_loop().time()
                    return True, "Ping inviato con successo"
                else:
                    return False, f"HTTP {resp.status_code}"
        except Exception as exc:
            logger.error("Errore invio ping heartbeat: %s", exc)
            return False, str(exc)

    async def _run_loop(self) -> None:
        """Periodically ping external heartbeat service."""
        interval = max(10, settings.heartbeat_interval_seconds)
        while self._running:
            try:
                await self.send_ping()
            except Exception as exc:
                logger.error("Eccezione durante il ciclo di heartbeat: %s", exc)
            await asyncio.sleep(interval)


heartbeat_client = HeartbeatClient()
