"""Internal asynchronous scheduler for check execution, batch persistence and state updates."""

import asyncio
import json
import logging
import random
from collections.abc import Callable
from datetime import timedelta
from typing import Any

from app.collector.plugins import registry
from app.config import settings
from app.db.models import Check, Device, Event, Observation, utcnow
from app.db.session import AsyncSessionLocal
from app.state.flapping import FlapDetector
from app.state.hysteresis import evaluate_check_hysteresis, synthesize_device_status
from app.state.reboot import RebootDetector
from sqlalchemy import select

logger = logging.getLogger("netsentinel.scheduler")


class SchedulerEngine:
    """Internal asyncio-based job scheduler for network checks."""

    def __init__(self, concurrency_limit: int = 20) -> None:
        self.concurrency_limit = concurrency_limit
        self.semaphore = asyncio.Semaphore(concurrency_limit)
        self.is_running = False
        self._task: asyncio.Task[None] | None = None
        self._flush_task: asyncio.Task[None] | None = None

        # State engines
        self.flap_detector = FlapDetector(window_seconds=600, max_transitions=4)
        self.reboot_detector = RebootDetector()

        # Batch persistence buffer
        self._obs_buffer: list[dict[str, Any]] = []
        self._buffer_lock = asyncio.Lock()

        # Event listeners (for SSE streaming)
        self._event_subscribers: list[Callable[[dict[str, Any]], None]] = []

    def subscribe_events(self, callback: Callable[[dict[str, Any]], None]) -> None:
        """Subscribe to real-time events and state updates."""
        self._event_subscribers.append(callback)

    def unsubscribe_events(self, callback: Callable[[dict[str, Any]], None]) -> None:
        """Unsubscribe from events."""
        if callback in self._event_subscribers:
            self._event_subscribers.remove(callback)

    def _broadcast_event(self, event_data: dict[str, Any]) -> None:
        """Broadcast state event to all subscribers."""
        for cb in list(self._event_subscribers):
            try:
                cb(event_data)
            except Exception as e:
                logger.debug("Errore notifica subscriber: %s", e)

    async def start(self) -> None:
        """Start scheduler worker loops."""
        if self.is_running:
            return
        self.is_running = True
        self._task = asyncio.create_task(self._scheduler_loop(), name="netsentinel-scheduler")
        self._flush_task = asyncio.create_task(self._batch_flush_loop(), name="netsentinel-flush")
        logger.info("Scheduler asincrono avviato (concorrenza max: %d).", self.concurrency_limit)

    async def stop(self) -> None:
        """Gracefully stop scheduler and flush pending writes."""
        if not self.is_running:
            return
        self.is_running = False
        if self._task:
            self._task.cancel()
        if self._flush_task:
            self._flush_task.cancel()
        # Final flush
        await self._flush_observations()
        logger.info("Scheduler arrestato e buffer osservazioni salvato.")

    async def _scheduler_loop(self) -> None:
        """Main scheduling loop polling checks due for execution."""
        while self.is_running:
            try:
                now = utcnow()
                async with AsyncSessionLocal() as session:
                    # Find enabled checks due for run
                    stmt = select(Check).where(
                        Check.enabled.is_(True),
                        (Check.next_run_at.is_(None)) | (Check.next_run_at <= now),
                    ).limit(50)
                    res = await session.execute(stmt)
                    due_checks = res.scalars().all()

                    # Schedule each check
                    for chk in due_checks:
                        # Schedule next run time immediately with jitter (+/- 10%)
                        jitter = random.uniform(0.9, 1.1)
                        next_interval = max(5, int(chk.interval_seconds * jitter))
                        chk.next_run_at = now + timedelta(seconds=next_interval)
                        await session.commit()

                        # Launch execution task protected by concurrency semaphore
                        asyncio.create_task(self._execute_check_safe(chk.id))

                await asyncio.sleep(1.0)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Errore nel ciclo scheduler: %s", e, exc_info=True)
                await asyncio.sleep(2.0)

    async def _execute_check_safe(self, check_id: str) -> None:
        """Execute a single check with concurrency control and error handling."""
        async with self.semaphore:
            try:
                await self._run_check(check_id)
            except Exception as e:
                logger.error("Errore non gestito durante check %s: %s", check_id, e)

    async def _run_check(self, check_id: str) -> None:
        """Run collector, apply hysteresis and record results."""
        async with AsyncSessionLocal() as session:
            chk = await session.get(Check, check_id)
            if not chk or not chk.enabled:
                return

            device = await session.get(Device, chk.device_id)
            if not device:
                return

            collector = registry.get(chk.type)
            if not collector:
                logger.warning("Collector non trovato per tipo: %s", chk.type)
                return

            # Parse parameters
            try:
                params = json.loads(chk.params_json) if chk.params_json else {}
            except Exception:
                params = {}

            # Target address
            target = params.get("target")
            if not target and device.addresses_json:
                try:
                    addrs = json.loads(device.addresses_json)
                    target = addrs.get("ip") or addrs.get("hostname")
                except Exception:
                    pass

            chk.last_run_at = utcnow()

        # Execute collector outside DB session
        result = await collector.collect(
            target_address=target,
            params=params,
            timeout_seconds=chk.timeout_seconds,
        )

        obs = result.observations[0] if result.observations else None
        if not obs:
            return

        # Queue observation for batch DB insertion
        async with self._buffer_lock:
            self._obs_buffer.append({
                "ts": obs.ts,
                "device_id": chk.device_id,
                "check_id": chk.id,
                "status": obs.status,
                "value": obs.value,
                "details_json": json.dumps(obs.details),
            })

        # Process hysteresis and state updates
        await self._process_check_state_update(chk.id, chk.device_id, obs)

    async def _process_check_state_update(self, check_id: str, device_id: str, obs: Any) -> None:
        """Apply hysteresis, check for flapping/reboots, and update device status."""
        async with AsyncSessionLocal() as session:
            chk = await session.get(Check, check_id)
            device = await session.get(Device, device_id)
            if not chk or not device:
                return

            # Failure / recovery policies
            f_policy = json.loads(chk.failure_policy_json) if chk.failure_policy_json else {}
            r_policy = json.loads(chk.recovery_policy_json) if chk.recovery_policy_json else {}

            h_res = evaluate_check_hysteresis(
                current_status=chk.current_status,
                raw_status=obs.status,
                consecutive_failures=chk.consecutive_failures,
                consecutive_successes=chk.consecutive_successes,
                failure_policy_dict=f_policy,
                recovery_policy_dict=r_policy,
            )

            chk.consecutive_failures = h_res.consecutive_failures
            chk.consecutive_successes = h_res.consecutive_successes

            if h_res.state_changed:
                old_chk_status = chk.current_status
                chk.current_status = h_res.new_status
                chk.status_since = utcnow()

                # Record check state change event
                ev = Event(
                    ts=utcnow(),
                    device_id=device_id,
                    check_id=check_id,
                    event_type="check_state_change",
                    severity=h_res.event_severity or "info",
                    title=f"Check {chk.name}: {old_chk_status.upper()} -> {h_res.new_status.upper()}",
                    message=f"Il controllo '{chk.name}' su '{device.name}' è passato allo stato {h_res.new_status.upper()}.",
                    details_json=json.dumps(obs.details),
                )
                session.add(ev)
                self._broadcast_event({
                    "type": "check_state_change",
                    "device_id": device_id,
                    "check_id": check_id,
                    "old_status": old_chk_status,
                    "new_status": h_res.new_status,
                })

            # Check for reboot
            uptime_val = obs.details.get("uptime_seconds")
            boot_id = obs.details.get("boot_id")
            if uptime_val or boot_id:
                rebooted, reason = self.reboot_detector.check_for_reboot(device_id, uptime_val, boot_id)
                if rebooted:
                    ev_reboot = Event(
                        ts=utcnow(),
                        device_id=device_id,
                        check_id=check_id,
                        event_type="reboot_detected",
                        severity="warn",
                        title=f"Riavvio rilevato: {device.name}",
                        message=reason,
                        details_json=json.dumps(obs.details),
                    )
                    session.add(ev_reboot)
                    self._broadcast_event({
                        "type": "reboot_detected",
                        "device_id": device_id,
                        "reason": reason,
                    })

            # Check for flapping
            is_flapping = False
            dev_roles = json.loads(device.roles_json) if device.roles_json else []
            is_passive = "passive_tracking" in dev_roles or device.kind == "client"

            if h_res.state_changed:
                is_flapping = self.flap_detector.record_transition(device_id)
                if is_flapping and not is_passive:
                    ev_flap = Event(
                        ts=utcnow(),
                        device_id=device_id,
                        check_id=check_id,
                        event_type="link_flap",
                        severity="warn",
                        title=f"Flapping instabile rilevato: {device.name}",
                        message="Rilevati frequenti cambi di stato nella finestra temporale.",
                        details_json=json.dumps({"transitions": self.flap_detector.max_transitions}),
                    )
                    session.add(ev_flap)

            # Synthesize overall device status
            all_checks_stmt = select(Check).where(Check.device_id == device_id, Check.enabled.is_(True))
            res = await session.execute(all_checks_stmt)
            dev_checks = res.scalars().all()
            checks_status_list = [{"type": c.type, "status": c.current_status} for c in dev_checks]

            new_dev_status, dev_changed = synthesize_device_status(
                current_device_status=device.status,
                check_statuses=checks_status_list,
                is_flapping=is_flapping if not is_passive else False,
            )

            if dev_changed:
                old_dev_status = device.status
                device.status = new_dev_status
                device.status_since = utcnow()
                # Passive devices (clients) only emit info severity events
                severity = "info" if is_passive else ("crit" if new_dev_status in ["down", "flapping"] else "info")
                ev_dev = Event(
                    ts=utcnow(),
                    device_id=device_id,
                    event_type="device_state_change",
                    severity=severity,
                    title=f"Apparato {device.name}: {old_dev_status.upper()} -> {new_dev_status.upper()}",
                    message=f"Lo stato di '{device.name}' (tracciamento passivo) è {new_dev_status.upper()}." if is_passive else f"Lo stato complessivo di '{device.name}' è ora {new_dev_status.upper()}.",
                    details_json=json.dumps({"old_status": old_dev_status, "new_status": new_dev_status, "passive": is_passive}),
                )
                session.add(ev_dev)
                self._broadcast_event({
                    "type": "device_state_change",
                    "device_id": device_id,
                    "old_status": old_dev_status,
                    "new_status": new_dev_status,
                    "passive": is_passive,
                })

            if obs.status == "ok":
                device.last_seen = utcnow()

            await session.commit()

    async def _batch_flush_loop(self) -> None:
        """Periodically flushes accumulated observations to SQLite in a single transaction."""
        while self.is_running:
            try:
                await asyncio.sleep(settings.batch_write_interval_seconds)
                await self._flush_observations()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Errore nel flush delle osservazioni: %s", e)

    async def _flush_observations(self) -> None:
        """Flush in-memory observations buffer to DB."""
        items_to_write: list[dict[str, Any]] = []
        async with self._buffer_lock:
            if not self._obs_buffer:
                return
            items_to_write = self._obs_buffer[:]
            self._obs_buffer.clear()

        if not items_to_write:
            return

        async with AsyncSessionLocal() as session:
            try:
                for item in items_to_write:
                    session.add(Observation(**item))
                await session.commit()
                logger.debug("Salvate %d osservazioni in batch su SQLite.", len(items_to_write))
            except Exception as e:
                logger.error("Fallimento scrittura batch osservazioni: %s", e)
                # Re-queue items that failed to write
                async with self._buffer_lock:
                    self._obs_buffer = items_to_write + self._obs_buffer


# Singleton scheduler instance
scheduler = SchedulerEngine()
