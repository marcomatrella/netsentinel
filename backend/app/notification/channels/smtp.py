"""SMTP notification channel using aiosmtplib."""

import logging
from email.message import EmailMessage
from typing import Any

import aiosmtplib

logger = logging.getLogger("netsentinel.notification.smtp")


async def send_smtp(
    config: dict[str, Any],
    subject: str,
    html_body: str,
    text_body: str,
) -> bool:
    """Send an email notification via SMTP (STARTTLS/SSL supported)."""
    host = config.get("host", "localhost")
    port = int(config.get("port", 587))
    username = config.get("username")
    password = config.get("password")
    from_addr = config.get("from_addr", "netsentinel@local")
    to_addrs = config.get("to_addrs", [])
    use_tls = config.get("use_tls", False)  # Implicit SSL on 465
    start_tls = config.get("start_tls", True)  # STARTTLS on 587

    if isinstance(to_addrs, str):
        to_addrs = [a.strip() for a in to_addrs.split(",") if a.strip()]

    if not to_addrs:
        logger.warning("⚠️ [SMTP] Nessun destinatario email configurato per il canale SMTP.")
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = ", ".join(to_addrs)
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    sec_label = "SSL/TLS (Porta 465)" if use_tls else ("STARTTLS (Porta 587)" if start_tls else "In chiaro (Porta 25)")
    logger.info(
        "📬 [SMTP INVIO] Connessione a %s:%d [%s] -> Mittente: '%s' -> Destinatari: %s | Oggetto: '%s'",
        host,
        port,
        sec_label,
        from_addr,
        to_addrs,
        subject,
    )

    try:
        await aiosmtplib.send(
            msg,
            hostname=host,
            port=port,
            username=username if username else None,
            password=password if password else None,
            use_tls=use_tls,
            start_tls=start_tls if not use_tls else False,
            timeout=10.0,
        )
        logger.info("🎉 [SMTP SUCCESSO] Notifica email recapitata con successo dal server %s ai destinatari %s", host, to_addrs)
        return True
    except Exception as exc:
        logger.error("❌ [SMTP ERRORE] Impossibile inviare email tramite %s:%d a %s: %s", host, port, to_addrs, exc)
        raise exc

