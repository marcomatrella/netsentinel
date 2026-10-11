"""Notification channels and persistent logs REST API endpoints."""

import json
from typing import Any

from app.db.models import NotificationChannel, NotificationLog, utcnow
from app.db.session import get_db
from app.notification.manager import notification_manager
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class ChannelCreateRequest(BaseModel):
    id: str
    name: str
    type: str  # smtp, webhook, ntfy, home_assistant
    config: dict[str, Any]
    enabled: bool = True
    min_severity: str = "warn"
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


@router.post("/channels")
async def create_or_update_channel(payload: ChannelCreateRequest, db: AsyncSession = Depends(get_db)):
    """Add or update a notification channel."""
    res = await db.execute(select(NotificationChannel).where(NotificationChannel.id == payload.id))
    channel = res.scalar_one_or_none()

    config_str = json.dumps(payload.config)
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


@router.post("/channels/{channel_id}/test")
async def test_notification_channel(channel_id: str, db: AsyncSession = Depends(get_db)):
    """Send a test alert message through the specified channel."""
    res = await db.execute(select(NotificationChannel).where(NotificationChannel.id == channel_id))
    channel = res.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Canale di notifica non trovato.")

    subject = "[NetSentinel TEST] Notifica di prova"
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
        return {"status": "ok", "message": "Notifica di test inviata con successo."}
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
