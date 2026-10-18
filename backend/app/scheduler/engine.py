"""Internal asynchronous scheduler for check execution, batch persistence and state updates."""

import asyncio
import json
import logging
import random
import time
from collections.abc import Callable
from datetime import timedelta
from typing import Any

from app.collector.plugins import registry
from app.config import settings
from app.db.models import Check, Device, Event, Observation, utcnow
from app.db.session import AsyncSessionLocal, is_sqlite
from app.state.flapping import FlapDetector
from app.state.hysteresis import evaluate_check_hysteresis, synthesize_device_status
from app.state.reboot import RebootDetector
from sqlalchemy import delete, select, text

logger = logging.getLogger("netsentinel.scheduler")


INTEGRATION_CHECK_TYPES = {
    "unifi",
    "adguard_home",
    "home_assistant",
    "synology_dsm",
    "fritzbox",
    "omada",
    "mikrotik",
    "snmp_bridge",
    "opnsense",
    "pfsense",
    "asuswrt",
    "netgear",
}


class SchedulerEngine:
    """Internal asyncio-based job scheduler for network checks."""

    def __init__(self, concurrency_limit: int = 20) -> None:
        self.concurrency_limit = concurrency_limit
        self.semaphore = asyncio.Semaphore(concurrency_limit)
        self.is_running = False
        self._task: asyncio.Task[None] | None = None
        self._flush_task: asyncio.Task[None] | None = None
        self._retention_task: asyncio.Task[None] | None = None

        # State engines
        self.flap_detector = FlapDetector(window_seconds=600, max_transitions=4)
        self.reboot_detector = RebootDetector()

        # In-memory fast cache for live device RTT (ms) to eliminate N+1 DB queries in SSE
        self._latest_rtts: dict[str, float] = {}

        # Batch persistence buffer
        self._obs_buffer: list[dict[str, Any]] = []
        self._buffer_lock = asyncio.Lock()

        # Event listeners (for SSE streaming)
        self._event_subscribers: list[Callable[[dict[str, Any]], None]] = []

        # Debounce caches to prevent event storming / duplicates in SQLite
        # Debounce caches and settling buffer to prevent event storms during cascading transitions (e.g. router reboot)
        self._last_check_event_ts: dict[tuple[str, str], float] = {}
        self._last_dev_event_ts: dict[tuple[str, str], float] = {}
        self._correlation_task: asyncio.Task[None] | None = None
        self._pending_anomaly_events: list[dict[str, Any]] = []
        self._settling_first_ts: float | None = None
        self._settling_delay: float = 5.0
        self._max_settling_window: float = 10.0

        self._latest_check_details: dict[str, dict[str, Any]] = {}

    def get_latest_rtts(self) -> dict[str, float]:
        """Return in-memory map of device_id -> latest RTT in ms."""
        return dict(self._latest_rtts)

    def get_latest_check_details(self, check_id: str) -> dict[str, Any]:
        """Return latest in-memory observation details for a given check_id."""
        return dict(self._latest_check_details.get(check_id, {}))

    def set_latest_check_details(self, check_id: str, details: dict[str, Any]) -> None:
        """Store latest observation details for a given check_id in memory."""
        self._latest_check_details[check_id] = details

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

    def schedule_correlation(self, delay: float = 5.0) -> None:
        """Debounce correlation execution to allow cascading check transitions to settle (e.g. router reboot)."""
        now = time.time()
        if self._settling_first_ts is None:
            self._settling_first_ts = now

        # If already waiting, extend/re-arm timer unless max settling window has been reached
        if self._correlation_task and not self._correlation_task.done():
            if (now - self._settling_first_ts) < self._max_settling_window:
                self._correlation_task.cancel()
            else:
                return

        self._correlation_task = asyncio.create_task(
            self._debounced_correlation_runner(delay=delay),
            name="netsentinel-corr-debounce",
        )

    async def _debounced_correlation_runner(self, delay: float = 5.0) -> None:
        """Wait for cascading checks across devices to settle, then run correlation pass and filter symptom logs."""
        try:
            await asyncio.sleep(delay)
            self._settling_first_ts = None

            async with AsyncSessionLocal() as session:
                from app.correlation.engine import correlation_engine
                incidents = await correlation_engine.run_correlation_cycle(session)

                # Identify all symptom devices across active incidents
                symptom_device_ids: set[str] = set()
                root_cause_device_ids: set[str] = set()
                for inc in incidents:
                    if inc.root_cause_device_id:
                        root_cause_device_ids.add(inc.root_cause_device_id)
                    imp = json.loads(inc.impacted_json) if inc.impacted_json else []
                    symptom_device_ids.update(imp)

                # Remove root causes from symptoms if present
                symptom_device_ids.difference_update(root_cause_device_ids)

                # Drain held anomaly events, discarding events for downstream symptoms
                pending_events = list(self._pending_anomaly_events)
                self._pending_anomaly_events.clear()

                for ev_data in pending_events:
                    dev_id = ev_data.get("device_id")
                    if dev_id and dev_id in symptom_device_ids:
                        logger.debug("Soppresso log anomalia per sintomo subordinato: %s (%s)", dev_id, ev_data.get("event_type"))
                        continue

                    # If this is device_state_change for root cause, incident_opened already covers it
                    if ev_data.get("event_type") == "device_state_change" and dev_id in root_cause_device_ids:
                        continue

                    session.add(Event(**ev_data))

                await session.commit()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning("Errore ciclo correlazione debounced: %s", e)

    async def start(self) -> None:
        """Start scheduler worker loops."""
        if self.is_running:
            return
        self.is_running = True

        # Preload latest check details from DB observations
        try:
            async with AsyncSessionLocal() as session:
                obs_res = await session.execute(
                    select(Observation).order_by(Observation.id.desc()).limit(150)
                )
                for o in reversed(obs_res.scalars().all()):
                    if o.details_json and o.check_id not in self._latest_check_details:
                        try:
                            self._latest_check_details[o.check_id] = json.loads(o.details_json)
                        except Exception:
                            pass
        except Exception as e:
            logger.debug("Preload dettagli osservazioni saltato: %s", e)

        self._task = asyncio.create_task(self._scheduler_loop(), name="netsentinel-scheduler")
        self._flush_task = asyncio.create_task(self._batch_flush_loop(), name="netsentinel-flush")
        self._retention_task = asyncio.create_task(self._retention_loop(), name="netsentinel-retention")
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
        if self._retention_task:
            self._retention_task.cancel()
        if self._correlation_task and not self._correlation_task.done():
            self._correlation_task.cancel()
        # Final flush
        await self._flush_observations()
        logger.info("Scheduler arrestato e buffer osservazioni salvato.")

    async def _scheduler_loop(self) -> None:
        """Main scheduling loop polling checks due for execution."""
        last_corr_pass = utcnow()
        while self.is_running:
            try:
                now = utcnow()
                async with AsyncSessionLocal() as session:
                    # Find enabled checks due for run (excluding suspended integration checks that require user auth/MFA)
                    stmt = select(Check).where(
                        Check.enabled.is_(True),
                        (
                            (Check.next_run_at.is_(None) & ~Check.type.in_(INTEGRATION_CHECK_TYPES))
                            | (Check.next_run_at.is_not(None) & (Check.next_run_at <= now))
                        ),
                    ).limit(50)
                    res = await session.execute(stmt)
                    due_checks = res.scalars().all()

                    # Schedule each check
                    due_to_run = []
                    for chk in due_checks:
                        if chk.type in INTEGRATION_CHECK_TYPES:
                            try:
                                pj = json.loads(chk.params_json) if chk.params_json else {}
                                if pj.get("auth_suspended") or pj.get("mfa_required"):
                                    chk.enabled = False
                                    chk.next_run_at = None
                                    continue
                            except Exception:
                                pass

                        # Schedule next run time immediately with jitter (+/- 10%)
                        jitter = random.uniform(0.9, 1.1)
                        next_interval = max(5, int(chk.interval_seconds * jitter))
                        chk.next_run_at = now + timedelta(seconds=next_interval)
                        due_to_run.append(chk.id)

                    await session.commit()

                    # Launch execution tasks protected by concurrency semaphore
                    for chk_id in due_to_run:
                        asyncio.create_task(self._execute_check_safe(chk_id))

                    # Periodically check active incidents against topology every 15s to auto-resolve stale incidents
                    if (now - last_corr_pass).total_seconds() >= 15:
                        last_corr_pass = now
                        try:
                            from app.correlation.engine import correlation_engine
                            await correlation_engine.run_correlation_cycle(session)
                        except Exception as corr_e:
                            logger.debug("Ciclo periodico di correlazione: %s", corr_e)

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
                await asyncio.wait_for(self._run_check(check_id), timeout=35.0)
            except TimeoutError:
                logger.warning("Check %s scaduto dopo timeout limite di 35s.", check_id)
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
                from app.crypto import decrypt_secret
                for k in ["password", "token", "api_key", "secret", "access_token"]:
                    if k in params and isinstance(params[k], str):
                        params[k] = decrypt_secret(params[k])
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

        # Update in-memory fast cache for live SSE streaming and topology
        if obs.details:
            self._latest_check_details[chk.id] = obs.details

        if obs.status == "ok" and obs.value is not None:
            try:
                self._latest_rtts[chk.device_id] = round(float(obs.value), 1)
            except (ValueError, TypeError):
                pass

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

        # Suspend recurring runs for external integrations if authentication or MFA challenge fails
        is_auth_or_mfa = (
            bool(obs.details.get("mfa_required"))
            or bool(obs.details.get("auth_failed"))
            or obs.details.get("last_http_code") in (401, 403, 429)
            or "Ubic2faTokenRequired" in str(obs.details.get("error", ""))
        )
        if is_auth_or_mfa and chk.type in INTEGRATION_CHECK_TYPES:
            async with AsyncSessionLocal() as session:
                c = await session.get(Check, chk.id)
                if c:
                    c.enabled = False
                    c.next_run_at = None
                    try:
                        pj = json.loads(c.params_json) if c.params_json else {}
                        pj["auth_suspended"] = True
                        if obs.details.get("mfa_required"):
                            pj["mfa_required"] = True
                        c.params_json = json.dumps(pj)
                    except Exception:
                        pass
                    await session.commit()
            logger.warning(
                "⚠️ [SCHEDULER] Check integrazione '%s' (%s) fallito per autenticazione/MFA: "
                "disabilitato (enabled=False) ed esecuzione periodica automatica SOSPESA per prevenire lockout o email multiple dal vendor. "
                "Il retry avverrà solo su test o salvataggio da parte dell'utente.",
                chk.name,
                chk.id,
            )

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

                if h_res.new_status in ["crit", "warn"]:
                    err_detail = obs.details.get("error") or obs.details.get("packet_loss_percent") or "Check fallito"
                    logger.info(
                        "⚠️ [CHECK ANOMALIA] Apparato '%s' (%s) -> Check '%s' FALLITO [%s -> %s]: %s",
                        device.name,
                        chk.device_id,
                        chk.name,
                        old_chk_status.upper(),
                        h_res.new_status.upper(),
                        err_detail,
                    )
                elif h_res.new_status == "ok":
                    rtt_str = f" (RTT: {obs.value}ms)" if obs.value is not None else ""
                    logger.info(
                        "✅ [CHECK RIPRISTINO] Apparato '%s' (%s) -> Check '%s' RIPRISTINATO [OK]%s",
                        device.name,
                        chk.device_id,
                        chk.name,
                        rtt_str,
                    )

                # Check if device is under maintenance or already down
                from app.state.maintenance import maintenance_tracker
                in_maint_chk, _ = await maintenance_tracker.is_device_in_maintenance(session, device_id)

                should_log_check_event = True
                if in_maint_chk and h_res.new_status in ["crit", "warn"]:
                    # Suppress failure event logging in DB during maintenance
                    should_log_check_event = False
                elif device.status in ["down", "unreachable"] and h_res.new_status in ["crit", "warn"] and chk.type != "ping":
                    # Device is already completely offline; suppress failure events for secondary checks
                    should_log_check_event = False
                else:
                    chk_cache_key = (check_id, h_res.new_status)
                    now_ts = time.time()
                    if chk_cache_key in self._last_check_event_ts and (now_ts - self._last_check_event_ts[chk_cache_key]) < 60:
                        should_log_check_event = False
                    else:
                        self._last_check_event_ts[chk_cache_key] = now_ts

                if should_log_check_event:
                    ev_dict = {
                        "ts": utcnow(),
                        "device_id": device_id,
                        "check_id": check_id,
                        "event_type": "check_state_change",
                        "severity": h_res.event_severity or "info",
                        "title": f"Check {chk.name}: {old_chk_status.upper()} -> {h_res.new_status.upper()}",
                        "message": f"Il controllo '{chk.name}' su '{device.name}' è passato allo stato {h_res.new_status.upper()}.",
                        "details_json": json.dumps(obs.details),
                    }
                    if h_res.new_status in ["crit", "warn"]:
                        self._pending_anomaly_events.append(ev_dict)
                    else:
                        session.add(Event(**ev_dict))

                self._broadcast_event({
                    "type": "check_state_change",
                    "device_id": device_id,
                    "check_id": check_id,
                    "old_status": old_chk_status,
                    "new_status": h_res.new_status,
                })

            # Check if successful ping indicates WAN recovery
            if obs.status == "ok" and chk.type == "ping":
                from app.notification.manager import notification_manager
                if not notification_manager.is_wan_online:
                    dev_roles = json.loads(device.roles_json) if device.roles_json else []
                    if device.kind in ["router", "modem"] or any(r in ["router", "gateway", "wan"] for r in dev_roles) or "8.8.8.8" in (chk.params_json or "") or "1.1.1.1" in (chk.params_json or ""):
                        logger.info("🟢 [PING RECUPERO] Connessione WAN ripristinata rilevata tramite ping '%s' su '%s'.", chk.name, device.name)
                        notification_manager.set_wan_status(True)
                        asyncio.create_task(notification_manager.drain_pending_wan_queue())

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
            is_passive = "passive_tracking" in dev_roles or device.kind in ["client", "smart_plug", "sensor"]

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

                if new_dev_status in ["down", "unreachable"]:
                    logger.info(
                        "🚨 [DISPOSITIVO OFFLINE] Apparato '%s' (%s, Kind: %s) -> STATO: %s (era %s)",
                        device.name,
                        device.id,
                        device.kind,
                        new_dev_status.upper(),
                        old_dev_status.upper(),
                    )
                elif new_dev_status == "ok":
                    logger.info(
                        "🟢 [DISPOSITIVO ONLINE] Apparato '%s' (%s, Kind: %s) -> TORNATO ONLINE [OK] (era %s)",
                        device.name,
                        device.id,
                        device.kind,
                        old_dev_status.upper(),
                    )
                else:
                    logger.info(
                        "ℹ️ [DISPOSITIVO STATO] Apparato '%s' (%s) -> cambio stato %s -> %s",
                        device.name,
                        device.id,
                        old_dev_status.upper(),
                        new_dev_status.upper(),
                    )

                # Check if device is under planned maintenance window
                from app.state.maintenance import maintenance_tracker
                in_maint, maint_win = await maintenance_tracker.is_device_in_maintenance(session, device_id)

                # Passive devices emit info; offline devices under maintenance emit "critical_managed"
                if is_passive:
                    severity = "info"
                elif new_dev_status in ["down", "flapping"]:
                    severity = "critical_managed" if in_maint else "crit"
                else:
                    severity = "info"

                dev_cache_key = (device_id, new_dev_status)
                now_ts = time.time()
                should_log_dev_event = True
                if in_maint and new_dev_status in ["down", "unreachable", "flapping", "degraded"]:
                    # In maintenance, log at most once every 5 minutes
                    if dev_cache_key in self._last_dev_event_ts and (now_ts - self._last_dev_event_ts[dev_cache_key]) < 300:
                        should_log_dev_event = False
                    else:
                        self._last_dev_event_ts[dev_cache_key] = now_ts
                else:
                    # Debounce duplicate events for same device & status within 30s
                    if dev_cache_key in self._last_dev_event_ts and (now_ts - self._last_dev_event_ts[dev_cache_key]) < 30:
                        should_log_dev_event = False
                    else:
                        self._last_dev_event_ts[dev_cache_key] = now_ts

                if should_log_dev_event:
                    maint_suffix = f" [Manutenzione Programmata: {maint_win.title}]" if (in_maint and maint_win) else (" [Manutenzione Attiva]" if in_maint else "")
                    ev_dev_dict = {
                        "ts": utcnow(),
                        "device_id": device_id,
                        "event_type": "device_state_change",
                        "severity": severity,
                        "title": f"Apparato {device.name}: {old_dev_status.upper()} -> {new_dev_status.upper()}{maint_suffix}",
                        "message": f"Lo stato di '{device.name}' (tracciamento passivo) è {new_dev_status.upper()}." if is_passive else f"Lo stato complessivo di '{device.name}' è ora {new_dev_status.upper()}{maint_suffix}.",
                        "details_json": json.dumps({
                            "old_status": old_dev_status,
                            "new_status": new_dev_status,
                            "passive": is_passive,
                            "maintenance": in_maint,
                            "maintenance_title": maint_win.title if maint_win else None,
                        }),
                    }
                    if new_dev_status in ["down", "unreachable", "flapping", "degraded"]:
                        self._pending_anomaly_events.append(ev_dev_dict)
                    else:
                        session.add(Event(**ev_dev_dict))

                self._broadcast_event({
                    "type": "device_state_change",
                    "device_id": device_id,
                    "old_status": old_dev_status,
                    "new_status": new_dev_status,
                    "passive": is_passive,
                    "severity": severity,
                })

            if obs.status == "ok":
                device.last_seen = utcnow()

            await session.commit()

            # If device state changed and it's not a passive client, schedule debounced root-cause correlation
            if dev_changed and not is_passive:
                self.schedule_correlation()

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

    async def _retention_loop(self) -> None:
        """Periodically purge aged observations/events and optimize database size."""
        # Initial sleep of 60 seconds to avoid competing with app startup
        try:
            await asyncio.sleep(60.0)
        except asyncio.CancelledError:
            return

        while self.is_running:
            try:
                await self._run_retention_cleanup()
                # Run retention cleanup every 30 minutes
                await asyncio.sleep(1800.0)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Errore nel ciclo di retention cleanup: %s", e)
                await asyncio.sleep(300.0)

    async def _run_retention_cleanup(self) -> None:
        """Purge raw observations older than retention period and prune old events."""
        async with AsyncSessionLocal() as session:
            try:
                # 1. Purge raw observations older than configured retention (default 7 days)
                cutoff_obs = utcnow() - timedelta(days=settings.retention_raw_days)
                stmt_obs = delete(Observation).where(Observation.ts < cutoff_obs)
                res_obs = await session.execute(stmt_obs)
                deleted_obs = res_obs.rowcount if hasattr(res_obs, "rowcount") else 0

                # 2. Prune old events older than 30 days
                cutoff_events = utcnow() - timedelta(days=30)
                stmt_events = delete(Event).where(Event.ts < cutoff_events)
                res_events = await session.execute(stmt_events)
                deleted_events = res_events.rowcount if hasattr(res_events, "rowcount") else 0

                await session.commit()

                if deleted_obs > 0 or deleted_events > 0:
                    logger.info(
                        "Retention cleanup completato: rimosse %d osservazioni (>%dg) e %d eventi (>30g).",
                        deleted_obs,
                        settings.retention_raw_days,
                        deleted_events,
                    )

                # 3. Optimize and checkpoint SQLite WAL to prevent unbounded disk/memory growth
                if is_sqlite:
                    await session.execute(text("PRAGMA wal_checkpoint(PASSIVE)"))
                    await session.execute(text("PRAGMA optimize"))

                # 4. Prune stale in-memory debounce entries older than 1 hour
                now_epoch = time.time()
                self._last_check_event_ts = {k: v for k, v in self._last_check_event_ts.items() if now_epoch - v < 3600}
                self._last_dev_event_ts = {k: v for k, v in self._last_dev_event_ts.items() if now_epoch - v < 3600}
            except Exception as e:
                logger.error("Errore durante esecuzione retention cleanup: %s", e)


# Singleton scheduler instance
scheduler = SchedulerEngine()
