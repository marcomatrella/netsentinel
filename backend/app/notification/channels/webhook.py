"""Generic webhook notification channel."""

import logging
from typing import Any

import httpx

logger = logging.getLogger("netsentinel.notification.webhook")


async def send_webhook(
    config: dict[str, Any],
    payload: dict[str, Any],
) -> bool:
    """Send incident notification payload to a configured webhook endpoint."""
    url = config.get("url")
    if not url:
        logger.warning("URL webhook non configurato.")
        return False

    method = config.get("method", "POST").upper()
    headers = config.get("headers", {})
    secret_token = config.get("token")
    if secret_token:
        headers["Authorization"] = f"Bearer {secret_token}"

    timeout = float(config.get("timeout_seconds", 5.0))

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.request(method, url, json=payload, headers=headers)
            if resp.status_code >= 400:
                raise RuntimeError(f"Webhook {url} ha risposto con HTTP {resp.status_code}: {resp.text[:100]}")
            logger.info("Notifica webhook inviata con successo a %s", url)
            return True
    except Exception as exc:
        logger.error("Errore invio notifica webhook a %s: %s", url, exc)
        raise exc
