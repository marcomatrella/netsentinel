"""Home Assistant notification channel."""

import logging
from typing import Any

import httpx

logger = logging.getLogger("netsentinel.notification.home_assistant")


async def send_home_assistant_notification(
    config: dict[str, Any],
    title: str,
    message: str,
    notification_id: str = "netsentinel_incident",
) -> bool:
    """Post persistent notification into Home Assistant via REST API."""
    ha_url = config.get("ha_url", "").rstrip("/")
    token = config.get("access_token", "")

    if not ha_url or not token:
        logger.warning("Home Assistant URL o token non configurati per le notifiche.")
        return False

    url = f"{ha_url}/api/services/persistent_notification/create"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    payload = {
        "title": title,
        "message": message,
        "notification_id": notification_id,
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code >= 400:
                raise RuntimeError(f"HA notification create HTTP {resp.status_code}: {resp.text[:100]}")
            logger.info("Notifica persistente inviata a Home Assistant (%s)", ha_url)
            return True
    except Exception as exc:
        logger.error("Errore invio notifica a Home Assistant: %s", exc)
        raise exc

