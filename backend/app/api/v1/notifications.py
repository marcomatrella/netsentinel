"""Notification channels and persistent logs REST API endpoints."""

import json
from typing import Any

from app.config import settings
from app.db.models import NotificationChannel, NotificationLog, utcnow
from app.db.session import get_db
from app.notification.channels.smtp import send_smtp
from app.notification.formatters import render_test_notification
from app.notification.manager import notification_manager
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class ChannelCreateRequest(BaseModel):
    id: str
    name: str
    type: str = "smtp"  # smtp, webhook, ntfy, home_assistant
    config: dict[str, Any]
    enabled: bool = True
    min_severity: str = "warn"
    quiet_hours: dict[str, Any] = Field(default_factory=dict)


class TestDirectNotificationRequest(BaseModel):
    channel_id: str | None = None
    type: str = "smtp"
    config: dict[str, Any]
    quiet_hours: dict[str, Any] = Field(default_factory=dict)


@router.get("/channels")
async def list_notification_channels(db: AsyncSession = Depends(get_db)):
    """List all configured notification channels (with secrets masked)."""
    res = await db.execute(select(NotificationChannel))
    channels = res.scalars().all()
    results = []
    for c in channels:
        cfg = json.loads(c.config_json) if c.config_json else {}
        # Mask sensitive keys
        masked_cfg = {
            k: ("******" if any(s in k.lower() for s in ["pass", "token", "secret", "key"]) else v)
            for k, v in cfg.items()
        }
        results.append({
            "id": c.id,
            "name": c.name,
            "type": c.type,
            "config": masked_cfg,
            "enabled": c.enabled,
            "min_severity": c.min_severity,
            "quiet_hours": json.loads(c.quiet_hours_json) if c.quiet_hours_json else {},
        })
    return results


@router.get("/channels/{channel_id}")
async def get_notification_channel(channel_id: str, db: AsyncSession = Depends(get_db)):
    """Get a single configured notification channel (with secrets masked)."""
    res = await db.execute(select(NotificationChannel).where(NotificationChannel.id == channel_id))
    channel = res.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Canale di notifica non trovato.")

    cfg = json.loads(channel.config_json) if channel.config_json else {}
    masked_cfg = {
        k: ("******" if any(s in k.lower() for s in ["pass", "token", "secret", "key"]) else v)
        for k, v in cfg.items()
    }
    return {
        "id": channel.id,
        "name": channel.name,
        "type": channel.type,
        "config": masked_cfg,
        "enabled": channel.enabled,
        "min_severity": channel.min_severity,
        "quiet_hours": json.loads(channel.quiet_hours_json) if channel.quiet_hours_json else {},
    }


@router.post("/channels")
async def create_or_update_channel(payload: ChannelCreateRequest, db: AsyncSession = Depends(get_db)):
    """Add or update a notification channel, preserving existing secrets if masked."""
    res = await db.execute(select(NotificationChannel).where(NotificationChannel.id == payload.id))
    channel = res.scalar_one_or_none()

    new_cfg = dict(payload.config)
    if channel and channel.config_json:
        try:
            existing_cfg = json.loads(channel.config_json)
            # If user didn't change masked passwords, keep previous values
            for k, v in new_cfg.items():
                if v == "******" and k in existing_cfg:
                    new_cfg[k] = existing_cfg[k]
        except Exception:
            pass

    config_str = json.dumps(new_cfg)
    qh_str = json.dumps(payload.quiet_hours)

    if not channel:
        channel = NotificationChannel(
            id=payload.id,
            name=payload.name,
            type=payload.type,
            config_json=config_str,
            enabled=payload.enabled,
            min_severity=payload.min_severity,
            quiet_hours_json=qh_str,
        )
        db.add(channel)
    else:
        channel.name = payload.name
        channel.type = payload.type
        channel.config_json = config_str
        channel.enabled = payload.enabled
        channel.min_severity = payload.min_severity
        channel.quiet_hours_json = qh_str

    await db.commit()
    return {"status": "ok", "channel_id": channel.id}


@router.delete("/channels/{channel_id}")
async def delete_notification_channel(channel_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a notification channel."""
    res = await db.execute(select(NotificationChannel).where(NotificationChannel.id == channel_id))
    channel = res.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Canale di notifica non trovato.")

    await db.delete(channel)
    await db.commit()
    return {"status": "ok", "message": f"Canale '{channel.name}' eliminato con successo."}


@router.post("/channels/{channel_id}/test")
async def test_notification_channel(channel_id: str, db: AsyncSession = Depends(get_db)):
    """Send a polished test alert message through the specified stored channel."""
    res = await db.execute(select(NotificationChannel).where(NotificationChannel.id == channel_id))
    channel = res.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Canale di notifica non trovato.")

    cfg = json.loads(channel.config_json) if channel.config_json else {}

    if channel.type == "smtp":
        subject, html_body, text_body = render_test_notification(
            smtp_config=cfg,
            vantage_point_name=settings.vantage_point_id or "Host NetSentinel",
            dashboard_url=f"http://{settings.host}:{settings.port}",
            app_version=settings.app_version,
        )
    else:
        subject = f"[NetSentinel TEST] Notifica di prova ({channel.name})"
        text_body = "Questo è un messaggio di prova inviato da NetSentinel per verificare la corretta configurazione del canale."
        html_body = f"<p><strong>NetSentinel</strong>: {text_body}</p>"

    try:
        await notification_manager._dispatch_channel(channel, subject, html_body, text_body, {})
        log = NotificationLog(
            channel_id=channel.id,
            status="sent",
            payload_summary=subject,
            ts=utcnow(),
        )
        db.add(log)
        await db.commit()
        to_str = str(cfg.get("to_addrs", "destinatario"))
        return {"status": "ok", "message": f"Notifica di test inviata con successo a {to_str}."}
    except Exception as exc:
        log = NotificationLog(
            channel_id=channel.id,
            status="failed",
            error_message=str(exc),
            payload_summary=subject,
            ts=utcnow(),
        )
        db.add(log)
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Errore invio notifica di prova: {exc}")


@router.post("/test")
async def test_direct_notification(payload: TestDirectNotificationRequest, db: AsyncSession = Depends(get_db)):
    """Send a test email directly using supplied configuration (ideal for pre-flight testing)."""
    cfg = dict(payload.config)

    # If channel_id provided and password is masked, restore saved password
    if payload.channel_id and (cfg.get("password") == "******" or not cfg.get("password")):
        res = await db.execute(select(NotificationChannel).where(NotificationChannel.id == payload.channel_id))
        stored = res.scalar_one_or_none()
        if stored and stored.config_json:
            stored_cfg = json.loads(stored.config_json)
            if stored_cfg.get("password"):
                cfg["password"] = stored_cfg["password"]

    to_addrs = cfg.get("to_addrs")
    if not to_addrs:
        raise HTTPException(status_code=400, detail="Specificare almeno un indirizzo email di destinazione.")

    if payload.type == "smtp":
        subject, html_body, text_body = render_test_notification(
            smtp_config=cfg,
            vantage_point_name=settings.vantage_point_id or "Host NetSentinel",
            dashboard_url=f"http://{settings.host}:{settings.port}",
            app_version=settings.app_version,
        )
        try:
            await send_smtp(cfg, subject, html_body, text_body)
            log = NotificationLog(
                channel_id=payload.channel_id or "test-smtp",
                status="sent",
                payload_summary=subject,
                ts=utcnow(),
            )
            db.add(log)
            await db.commit()
            to_repr = ", ".join(to_addrs) if isinstance(to_addrs, list) else str(to_addrs)
            return {"status": "ok", "message": f"Email di prova inviata con successo a {to_repr}."}
        except Exception as exc:
            log = NotificationLog(
                channel_id=payload.channel_id or "test-smtp",
                status="failed",
                error_message=str(exc),
                payload_summary=subject,
                ts=utcnow(),
            )
            db.add(log)
            await db.commit()
            raise HTTPException(status_code=500, detail=f"Errore connessione/invio SMTP: {exc}")
    else:
        raise HTTPException(status_code=400, detail=f"Tipo di canale '{payload.type}' non supportato per il test diretto.")


@router.get("/logs")
async def list_notification_logs(limit: int = 50, db: AsyncSession = Depends(get_db)):
    """List recent notification logs and queued messages."""
    res = await db.execute(
        select(NotificationLog).order_by(desc(NotificationLog.ts)).limit(limit)
    )
    logs = res.scalars().all()
    return [
        {
            "id": log.id,
            "ts": log.ts.isoformat(),
            "incident_id": log.incident_id,
            "channel_id": log.channel_id,
            "status": log.status,
            "error_message": log.error_message,
            "payload_summary": log.payload_summary,
        }
        for log in logs
    ]

