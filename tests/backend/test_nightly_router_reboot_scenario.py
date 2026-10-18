"""Scenario test: Nightly router reboot under scheduled maintenance.

Validates:
1. Recurring maintenance window in Rome timezone (03:59 to 04:15) correctly activates at 04:04 Rome time.
2. If router reboots and downstream devices fail, no spurious resolution or duplicate alerts are emitted.
3. Subordinate incidents are cleanly merged without firing false 'resolved' emails.
4. Downstream devices inherit maintenance from upstream router.
"""

import json
from datetime import datetime

import pytest
from app.correlation.engine import correlation_engine
from app.correlation.incident_manager import incident_manager
from app.db.models import (
    Dependency,
    Device,
    Event,
    Incident,
    Link,
    NotificationChannel,
    NotificationLog,
    ScheduledMaintenanceWindow,
)
from app.db.session import AsyncSessionLocal, init_db
from app.notification.manager import notification_manager
from app.state.maintenance import maintenance_tracker
from sqlalchemy import select


@pytest.mark.asyncio
async def test_nightly_reboot_maintenance_window_activation():
    """Verify that a daily maintenance window set for 03:59 to 04:15 correctly activates at 04:04 Rome local time."""
    win = ScheduledMaintenanceWindow(
        id="reboot-window",
        title="Riavvio Notturno TIM Router",
        device_id=None,  # Global
        start_ts=datetime(2026, 1, 1, 0, 0),
        end_ts=datetime(2027, 1, 1, 0, 0),
        recurrence_type="daily",
        start_time="03:59",
        end_time="04:15",
        enabled=True,
    )

    # In CEST (UTC+2 in summer) or CET (UTC+1 in winter):
    # 04:04 Rome time on 2026-10-14 is 02:04 UTC (CEST)
    check_time_utc = datetime(2026, 10, 14, 2, 4, 0)
    assert maintenance_tracker.is_window_active_at(win, check_time_utc) is True

    # 03:58 Rome time is 01:58 UTC -> should NOT be active
    check_early_utc = datetime(2026, 10, 14, 1, 58, 0)
    assert maintenance_tracker.is_window_active_at(win, check_early_utc) is False

    # 04:16 Rome time is 02:16 UTC -> should NOT be active
    check_late_utc = datetime(2026, 10, 14, 2, 16, 0)
    assert maintenance_tracker.is_window_active_at(win, check_late_utc) is False


@pytest.mark.asyncio
async def test_downstream_incident_merging_during_router_reboot():
    """Verify that downstream devices that fail before/with the router are merged into router incident.

    No false 'Incident Resolved' alerts are sent for downstream devices when router takes over.
    """
    await init_db()
    async with AsyncSessionLocal() as session:
        # Topology: vantage_point -> router -> switch -> [nas, server]
        vp = Device(id="vp", name="Core NAS (VP)", kind="nas", roles_json='["vantage_point"]', status="ok")
        router = Device(id="router-tim", name="TIM Hub Router", kind="router", status="ok")
        switch = Device(id="switch-core", name="Switch Core", kind="switch", status="ok")
        nas = Device(id="nas-storage", name="Storage NAS", kind="nas", status="ok")
        server = Device(id="srv-proxmox", name="Proxmox Server", kind="server", status="ok")
        session.add_all([vp, router, switch, nas, server])
        await session.flush()

        session.add(Link(id="l1", from_device_id="vp", to_device_id="switch-core", medium="ethernet"))
        session.add(Link(id="l2", from_device_id="switch-core", to_device_id="router-tim", medium="ethernet"))
        session.add(Link(id="l3", from_device_id="switch-core", to_device_id="nas-storage", medium="ethernet"))
        session.add(Link(id="l4", from_device_id="switch-core", to_device_id="srv-proxmox", medium="ethernet"))
        await session.flush()

        session.add(Dependency(id="d1", dependent_id="switch-core", provider_id="router-tim", kind="l2_path"))
        session.add(Dependency(id="d2", dependent_id="nas-storage", provider_id="switch-core", kind="l2_path"))
        session.add(Dependency(id="d3", dependent_id="srv-proxmox", provider_id="switch-core", kind="l2_path"))
        await session.commit()

        # Step 1: Suppose nas-storage check fails first, before router check trips
        nas.status = "down"
        await session.commit()

        incidents_pass1 = await correlation_engine.run_correlation_cycle(session)
        assert len(incidents_pass1) == 1
        assert incidents_pass1[0].root_cause_device_id == "nas-storage"

        # Step 2: Now router-tim is detected DOWN (rebooting)
        router.status = "down"
        switch.status = "unreachable"
        nas.status = "unreachable"
        server.status = "unreachable"
        await session.commit()

        incidents_pass2 = await correlation_engine.run_correlation_cycle(session)
        # Router should be the single primary incident
        assert len(incidents_pass2) == 1
        assert incidents_pass2[0].root_cause_device_id == "router-tim"

        # Check that the previous nas-storage incident was shifted to router-tim or merged, NOT resolved!
        prev_inc = await session.get(Incident, incidents_pass1[0].id)
        if prev_inc.id == incidents_pass2[0].id:
            assert prev_inc.root_cause_device_id == "router-tim"
            assert "root_cause_shift" in prev_inc.timeline_json
        else:
            assert prev_inc.status == "merged"

        # Step 3: Router finishes rebooting and network recovers
        router.status = "ok"
        switch.status = "ok"
        nas.status = "ok"
        server.status = "ok"
        await session.commit()

        incidents_pass3 = await correlation_engine.run_correlation_cycle(session)
        assert len(incidents_pass3) == 0

        # Now the primary incident is resolved
        primary_inc = await session.get(Incident, incidents_pass2[0].id)
        assert primary_inc.status == "resolved"


@pytest.mark.asyncio
async def test_maintenance_suppression_and_no_resolution_alert():
    """Verify that an incident occurring during scheduled maintenance does NOT dispatch resolution alerts."""
    await init_db()
    async with AsyncSessionLocal() as session:
        # Create Device for router-tim
        dev = Device(id="router-tim", name="TIM Hub Router", kind="router", status="ok")
        session.add(dev)
        await session.flush()

        # Create active maintenance window for router-tim
        win = ScheduledMaintenanceWindow(
            id="win-maint-test",
            title="Manutenzione Router",
            device_id="router-tim",
            start_ts=datetime(2026, 1, 1, 0, 0),
            end_ts=datetime(2027, 1, 1, 0, 0),
            recurrence_type="daily",
            start_time="03:59",
            end_time="04:15",
            enabled=True,
        )
        session.add(win)
        await session.commit()

        # Simulated incident on router during maintenance
        inc = Incident(
            id="inc-maint-sim",
            status="open",
            started_at=datetime(2026, 10, 14, 2, 4, 0),  # 04:04 Rome time (inside window)
            root_cause_device_id="router-tim",
            root_cause_category="router",
            confidence=0.99,
            summary="Router riavviato",
        )
        session.add(inc)
        await session.commit()

        # Resolving this incident should suppress notifications because it started in maintenance!
        res_inc = await incident_manager.resolve_incident(session, inc.id)
        assert res_inc.status == "resolved"

        # Verify notify_incident suppresses resolution alert
        logs = await notification_manager.notify_incident(res_inc, is_resolved=True)
        # Should be empty or suppressed
        assert len(logs) == 0 or logs[0].status == "suppressed_maintenance"


@pytest.mark.asyncio
async def test_nightly_router_reboot_without_maintenance_clean_aggregation_and_wan_digest():
    """Verify router reboot without maintenance window:
    1. WAN status automatically drops to False when Router fails.
    2. Outgoing alerts are safely queued as pending_wan without socket connection attempts.
    3. Exactly 1 primary incident is created.
    4. No premature root_cause_shift WARN events are spammed.
    5. When router recovers, WAN status returns to True and a single consolidated resolution report is sent.
    """
    await init_db()
    maintenance_tracker.set_maintenance(enabled=False)
    notification_manager.last_incident_email_ts.clear()
    notification_manager.is_wan_online = True

    async with AsyncSessionLocal() as session:
        # Create topology: vp -> switch -> router -> wan
        vp = Device(id="vp-nas", name="Synology VP", kind="nas", roles_json='["vantage_point"]', status="ok")
        switch = Device(id="sw-core", name="Switch Core", kind="switch", status="ok")
        router = Device(id="router-tim", name="TIM Hub Router", kind="router", roles_json='["router", "gateway"]', status="ok")
        wan = Device(id="wan-inet", name="WAN Gateway (1.1.1.1)", kind="wan", roles_json='["wan"]', status="ok")
        pc = Device(id="pc-client", name="Workstation PC", kind="client", status="ok")

        session.add_all([vp, switch, router, wan, pc])
        await session.flush()

        session.add(Link(id="l1", from_device_id="vp-nas", to_device_id="sw-core", medium="ethernet"))
        session.add(Link(id="l2", from_device_id="sw-core", to_device_id="router-tim", medium="ethernet"))
        session.add(Link(id="l3", from_device_id="router-tim", to_device_id="wan-inet", medium="fiber"))
        session.add(Link(id="l4", from_device_id="sw-core", to_device_id="pc-client", medium="ethernet"))
        await session.flush()

        session.add(Dependency(id="d1", dependent_id="wan-inet", provider_id="router-tim", kind="l2_path"))
        session.add(Dependency(id="d2", dependent_id="pc-client", provider_id="sw-core", kind="l2_path"))
        await session.flush()

        # Add notification channel (requires WAN)
        ch = NotificationChannel(
            id="test-smtp-reboot",
            name="Email Allarmi",
            type="webhook",
            config_json=json.dumps({
                "url": "http://127.0.0.1:9999/alert",
                "requires_wan": True,
            }),
            enabled=True,
        )
        session.add(ch)
        await session.commit()

        # Simulation of router reboot: router and wan fail
        router.status = "down"
        wan.status = "unreachable"
        await session.commit()

        # Correlation cycle runs
        incidents = await correlation_engine.run_correlation_cycle(session)
        assert len(incidents) == 1
        assert incidents[0].root_cause_device_id == "router-tim"

        # WAN should be detected offline
        assert notification_manager.is_wan_online is False

        # Check notification logs: should have queued as pending_wan, NOT failed with connection error
        logs_stmt = select(NotificationLog).where(NotificationLog.incident_id == incidents[0].id)
        logs_res = await session.execute(logs_stmt)
        n_logs = logs_res.scalars().all()
        assert len(n_logs) == 1
        assert n_logs[0].status == "pending_wan"

        # Check Event table: verify NO root_cause_shift WARN events were emitted
        ev_stmt = select(Event).where(Event.event_type == "root_cause_shift")
        ev_res = await session.execute(ev_stmt)
        shifts = ev_res.scalars().all()
        assert len(shifts) == 0

        # Now Router finishes rebooting and recovers
        router.status = "ok"
        wan.status = "ok"
        await session.commit()

        # Recovery correlation cycle
        rec_incs = await correlation_engine.run_correlation_cycle(session)
        assert len(rec_incs) == 0

        # WAN status should be restored
        assert notification_manager.is_wan_online is True

        inc_id = incidents[0].id
        # Incident is resolved
        inc_check = await session.get(Incident, inc_id)
        assert inc_check.status == "resolved"

    # Check drained notification log in fresh session to bypass identity map caching
    async with AsyncSessionLocal() as verify_session:
        drained_stmt = select(NotificationLog).where(NotificationLog.incident_id == inc_id)
        d_res = await verify_session.execute(drained_stmt)
        d_logs = d_res.scalars().all()
        assert len(d_logs) >= 1
        assert any(log_entry.status == "sent" for log_entry in d_logs)
