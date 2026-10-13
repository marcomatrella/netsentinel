"""Comprehensive tests for Milestone M5: Notifications, Persistent Queue, Quiet Hours, and Dead-Man's Switch."""

import json
from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest
from app.db.models import Incident, NotificationChannel, utcnow
from app.db.session import AsyncSessionLocal
from app.heartbeat.client import heartbeat_client
from app.heartbeat.watchdog import watchdog
from app.main import app
from app.notification.formatters import render_incident_notification
from app.notification.manager import notification_manager
from app.state.maintenance import maintenance_tracker
from httpx import ASGITransport, AsyncClient


def test_notification_formatter_italian():
    """Verify Italian notification rendering with HTML and text templates."""
    incident = {
        "id": "inc-test-1",
        "summary": "Switch principale di rete offline",
        "confidence": 0.95,
        "started_at": "2026-10-11T10:00:00",
        "resolved_at": "2026-10-11T10:15:00",
        "root_cause_device_id": "usw-switch-24",
        "root_cause_category": "network_device",
        "recommendations": ["Verifica alimentazione elettrica dello switch", "Controlla spie LED"],
    }
    root_dev = {"id": "usw-switch-24", "name": "UniFi Switch 24 PoE", "kind": "switch"}
    impacted = [{"id": "ap-salotto", "name": "AP Salotto", "kind": "access_point"}]

    subject, html, text = render_incident_notification(
        incident=incident,
        root_cause_device=root_dev,
        impacted_devices=impacted,
        is_resolved=True,
    )

    assert "[NetSentinel RISOLTO]" in subject
    assert "UniFi Switch 24 PoE" in subject
    assert "95%" in html
    assert "AP Salotto" in html
    assert "Verifica alimentazione" in html
    assert "Durata totale:" in html
    assert "15 minuti" in html

    assert "[NetSentinel RISOLTO]" in text
    assert "UniFi Switch 24 PoE" in text
    assert "DIAGNOSI:" in text


@pytest.mark.asyncio
async def test_quiet_hours_evaluation():
    """Test quiet hours suppression and critical alert bypass."""
    qh_config = {
        "enabled": True,
        "start": "23:00",
        "end": "07:00",
        "allow_critical": True,
    }

    # Fixed time during night (03:00)
    with patch("app.notification.manager.datetime") as mock_dt:
        mock_now = datetime(2026, 10, 11, 3, 0, 0)
        mock_dt.now.return_value = mock_now
        mock_dt.strptime = datetime.strptime

        # Warn alert should be suppressed
        is_quiet_warn = notification_manager.is_in_quiet_hours(qh_config, severity="warn")
        assert is_quiet_warn is True

        # Critical alert should bypass quiet hours
        is_quiet_crit = notification_manager.is_in_quiet_hours(qh_config, severity="crit")
        assert is_quiet_crit is False


@pytest.mark.asyncio
async def test_maintenance_mode_suppression():
    """Test that active maintenance mode suppresses all alerts."""
    maintenance_tracker.set_maintenance(enabled=True, duration_minutes=60, notes="Manutenzione programmata switch")

    inc = Incident(
        id="inc-maint-test",
        status="open",
        started_at=utcnow(),
        root_cause_device_id="switch-core",
        root_cause_category="network_device",
        confidence=0.90,
        summary="Switch non raggiungibile",
    )

    logs = await notification_manager.notify_incident(inc)
    assert len(logs) == 1
    assert logs[0].status == "suppressed_maintenance"

    # Reset maintenance
    maintenance_tracker.set_maintenance(enabled=False)
    assert maintenance_tracker.is_active() is False


@pytest.mark.asyncio
async def test_wan_blackout_queue_and_drain():
    """Test that notifications are queued as pending_wan during WAN outage and drained on recovery."""
    maintenance_tracker.set_maintenance(enabled=False)

    async with AsyncSessionLocal() as session:
        # Insert test notification channel
        ch = NotificationChannel(
            id="test-webhook-wan",
            name="Webhook Allarmi",
            type="webhook",
            config_json=json.dumps({"url": "http://127.0.0.1:9999/alert", "requires_wan": True}),
            enabled=True,
        )
        session.add(ch)

        inc = Incident(
            id="inc-wan-outage",
            status="open",
            started_at=utcnow(),
            root_cause_device_id="wan-modem",
            root_cause_category="wan",
            confidence=0.98,
            summary="Connessione Internet assente",
        )
        session.add(inc)
        await session.commit()

    # Simulate WAN offline
    notification_manager.set_wan_status(False)

    logs = await notification_manager.notify_incident(inc)
    assert len(logs) == 1
    assert logs[0].status == "pending_wan"

    # Now restore WAN and drain queue
    notification_manager.set_wan_status(True)
    drained = await notification_manager.drain_pending_wan_queue()
    assert drained >= 1


@pytest.mark.asyncio
async def test_dead_mans_switch_watchdog():
    """Test dead-man's switch watchdog evaluating database and scheduler."""
    # 1. Unhealthy case: when scheduler is stopped, ping MUST be blocked!
    with patch.object(watchdog, "check_scheduler", return_value=False):
        healthy, details = await watchdog.evaluate_health()
        assert healthy is False
        assert details["scheduler_ok"] is False

        success, msg = await heartbeat_client.send_ping(force_url="https://hc-ping.com/mock-uuid")
        assert success is False
        assert "bloccato" in msg.lower()

    # 2. Healthy case: when database and scheduler are both running, ping succeeds!
    with patch.object(watchdog, "check_scheduler", return_value=True):
        healthy, details = await watchdog.evaluate_health()
        assert healthy is True
        assert details["database_ok"] is True
        assert details["scheduler_ok"] is True

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value.status_code = 200
            success, msg = await heartbeat_client.send_ping(force_url="https://hc-ping.com/mock-uuid")
            assert success is True
            assert "successo" in msg.lower()


@pytest.mark.asyncio
async def test_maintenance_and_heartbeat_api():
    """Test REST API endpoints for maintenance mode and heartbeat status."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Maintenance toggle
        resp = await client.post("/api/v1/maintenance", json={"enabled": True, "duration_minutes": 30, "notes": "Test API"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["enabled"] is True
        assert data["is_active"] is True

        # 2. Query status
        status_resp = await client.get("/api/v1/maintenance")
        assert status_resp.status_code == 200
        assert status_resp.json()["enabled"] is True

        # Disable
        await client.post("/api/v1/maintenance", json={"enabled": False})

        # 3. Scheduled recurring maintenance endpoint test (e.g. daily 04:00 to 04:30)
        daily_payload = {
            "title": "Riavvio Quotidiano Rete",
            "device_id": None,
            "start_ts": "2026-01-01T00:00:00Z",
            "end_ts": "2027-01-01T00:00:00Z",
            "recurrence_type": "daily",
            "start_time": "04:00",
            "end_time": "04:30",
            "notes": "Nightly reboot slot",
        }
        create_resp = await client.post("/api/v1/maintenance/scheduled", json=daily_payload)
        assert create_resp.status_code == 200
        created = create_resp.json()
        assert created["recurrence_type"] == "daily"
        assert created["start_time"] == "04:00"
        assert created["end_time"] == "04:30"
        slot_id = created["id"]

        # Check active at 04:15 UTC -> should be active!
        act_resp_yes = await client.get("/api/v1/maintenance/scheduled/active?at_ts=2026-06-15T04:15:00Z")
        assert act_resp_yes.status_code == 200
        act_data = act_resp_yes.json()
        assert act_data["is_global_active"] is True
        assert act_data["global_window"]["id"] == slot_id

        # Check active at 05:00 UTC -> should NOT be active!
        act_resp_no = await client.get("/api/v1/maintenance/scheduled/active?at_ts=2026-06-15T05:00:00Z")
        assert act_resp_no.status_code == 200
        assert act_resp_no.json()["is_global_active"] is False

        # Cleanup
        del_resp = await client.delete(f"/api/v1/maintenance/scheduled/{slot_id}")
        assert del_resp.status_code == 200

        # 4. Heartbeat status endpoint
        hb_resp = await client.get("/api/v1/heartbeat/status")
        assert hb_resp.status_code == 200
        hb_data = hb_resp.json()
        assert "healthy" in hb_data
        assert "watchdog_details" in hb_data


def test_render_test_notification():
    """Verify polished HTML and text formatting for test notification emails."""
    from app.notification.formatters import render_test_notification

    smtp_cfg = {
        "host": "smtp.example.com",
        "port": 587,
        "username": "admin@example.com",
        "from_addr": "alerts@netsentinel.local",
        "to_addrs": ["admin@example.com", "oncall@example.com"],
        "start_tls": True,
        "use_tls": False,
    }

    subject, html_body, text_body = render_test_notification(
        smtp_config=smtp_cfg,
        vantage_point_name="Core NAS",
        dashboard_url="http://192.168.1.10:8080",
        app_version="0.1.0",
    )

    assert "[NetSentinel TEST]" in subject
    assert "smtp.example.com:587" in html_body
    assert "STARTTLS" in html_body
    assert "admin@example.com, oncall@example.com" in html_body
    assert "Core NAS" in html_body
    assert "http://192.168.1.10:8080" in html_body
    assert "✓ CONFIGURAZIONE SMTP VERIFICATA CON SUCCESSO!" in text_body


@pytest.mark.asyncio
async def test_notifications_rest_api_and_test_email():
    """Test channel setup, masking, password preservation, and test email sending."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create channel
        ch_payload = {
            "id": "smtp-primary",
            "name": "Server SMTP Personale",
            "type": "smtp",
            "config": {
                "host": "smtp.mailgun.org",
                "port": 587,
                "username": "postmaster@mailgun.org",
                "password": "supersecretpassword123",
                "from_addr": "netsentinel@mydomain.com",
                "to_addrs": ["admin@mydomain.com"],
                "start_tls": True,
            },
            "enabled": True,
            "min_severity": "warn",
            "quiet_hours": {"enabled": True, "start": "22:00", "end": "08:00"},
        }
        res = await client.post("/api/v1/notifications/channels", json=ch_payload)
        assert res.status_code == 200

        # 2. List channels - password must be masked
        list_res = await client.get("/api/v1/notifications/channels")
        assert list_res.status_code == 200
        channels = list_res.json()
        found = [c for c in channels if c["id"] == "smtp-primary"]
        assert len(found) == 1
        assert found[0]["config"]["password"] == "******"

        # 3. Update without modifying password (sending masked)
        update_payload = dict(ch_payload)
        update_payload["name"] = "Server SMTP Rinominato"
        update_payload["config"]["password"] = "******"
        update_res = await client.post("/api/v1/notifications/channels", json=update_payload)
        assert update_res.status_code == 200

        # 4. Test direct notification with mock SMTP
        with patch("app.api.v1.notifications.send_smtp", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = True
            test_res = await client.post(
                "/api/v1/notifications/test",
                json={
                    "channel_id": "smtp-primary",
                    "type": "smtp",
                    "config": {
                        "host": "smtp.mailgun.org",
                        "port": 587,
                        "username": "postmaster@mailgun.org",
                        "password": "******",
                        "from_addr": "netsentinel@mydomain.com",
                        "to_addrs": ["admin@mydomain.com"],
                    },
                },
            )
            assert test_res.status_code == 200
            assert test_res.json()["status"] == "ok"
            # Verify password was resolved to real password, not masked!
            assert mock_send.call_count == 1
            call_cfg = mock_send.call_args[0][0]
            assert call_cfg["password"] == "supersecretpassword123"

        # 5. Test channel test endpoint with mock
        with patch("app.api.v1.notifications.notification_manager._dispatch_channel", new_callable=AsyncMock) as mock_dispatch:
            mock_dispatch.return_value = None
            ch_test_res = await client.post("/api/v1/notifications/channels/smtp-primary/test")
            assert ch_test_res.status_code == 200
            assert ch_test_res.json()["status"] == "ok"

        # 6. Delete channel
        del_res = await client.delete("/api/v1/notifications/channels/smtp-primary")
        assert del_res.status_code == 200

