"""ntfy push notification channel."""

import logging
from typing import Any

import httpx

logger = logging.getLogger("netsentinel.notification.ntfy")


async def send_ntfy(
    config: dict[str, Any],
    title: str,
    message: str,
    priority: int = 3,
    tags: list[str] | None = None,
    click_url: str | None = None,
) -> bool:
    """Send push notification to an ntfy instance (e.g. https://ntfy.sh or self-hosted)."""
    server = config.get("server", "https://ntfy.sh").rstrip("/")
    topic = config.get("topic", "")
    token = config.get("token")

    if not topic:
        logger.warning("Topic ntfy non configurato.")
        return False

    url = f"{server}/{topic}"
    headers: dict[str, str] = {
        "Title": title,
        "Priority": str(priority),
    }
    if tags:
        headers["Tags"] = ",".join(tags)
    if click_url:
        headers["Click"] = click_url
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(url, content=message.encode("utf-8"), headers=headers)
            if resp.status_code >= 400:
                raise RuntimeError(f"ntfy ha risposto con HTTP {resp.status_code}: {resp.text[:100]}")
            logger.info("Notifica ntfy inviata con successo su %s", url)
            return True
    except Exception as exc:
        logger.error("Errore invio notifica ntfy a %s: %s", url, exc)
        raise exc
