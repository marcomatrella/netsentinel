"""Main FastAPI application for NetSentinel."""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.api.health import router as health_router
from app.api.v1.router import api_v1_router
from app.config import settings
from app.db.models import Event, utcnow
from app.db.session import AsyncSessionLocal, init_db
from app.scheduler.engine import scheduler

# Configure structured logging
logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
)
logger = logging.getLogger("netsentinel")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Lifespan context manager for application startup and shutdown."""
    logger.info("Avvio di NetSentinel v%s...", settings.app_version)
    # Step 1: Initialize database schemas
    await init_db()
    logger.info("Database SQLite (WAL) inizializzato con successo in: %s", settings.data_dir)

    # Step 2: Record monitor restart event
    async with AsyncSessionLocal() as session:
        ev = Event(
            ts=utcnow(),
            event_type="monitor_restart",
            severity="info",
            title="Avvio servizio NetSentinel",
            message=f"NetSentinel v{settings.app_version} è stato avviato correttamente.",
            details_json="{}",
        )
        session.add(ev)
        await session.commit()

    # Step 3: Start internal scheduler and external heartbeat
    await scheduler.start()
    from app.heartbeat.client import heartbeat_client
    await heartbeat_client.start()

    yield

    # Teardown
    await heartbeat_client.stop()
    await scheduler.stop()
    logger.info("Arresto di NetSentinel completato.")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Sistema di monitoraggio intelligente e correlazione eventi per reti domestiche avanzate.",
    lifespan=lifespan,
)

# CORS Middleware (LAN-friendly)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register core health & metrics endpoints
app.include_router(health_router)
app.include_router(api_v1_router)

# Mount frontend static files if present
static_path = Path(settings.static_dir).resolve()
if static_path.exists() and (static_path / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=str(static_path / "assets")), name="assets")

    @app.get("/{full_path:path}", response_class=HTMLResponse)
    async def serve_spa(request: Request, full_path: str):
        # Ignore API and health requests
        if full_path.startswith("api/") or full_path in ["healthz", "metrics"]:
            return None
        file_to_serve = static_path / full_path
        if file_to_serve.is_file():
            return FileResponse(file_to_serve)

        index_file = static_path / "index.html"
        content = index_file.read_text(encoding="utf-8")
        ingress_path = request.headers.get("X-Ingress-Path", "")
        if ingress_path:
            clean_ingress = ingress_path.rstrip("/")
            meta_tag = (
                f'<meta name="ingress-path" content="{clean_ingress}">\n'
                f'    <base href="{clean_ingress}/">'
            )
            content = content.replace("<head>", f"<head>\n    {meta_tag}", 1)
        return HTMLResponse(
            content=content,
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )
else:
    @app.get("/", response_class=HTMLResponse)
    async def serve_fallback():
        return HTMLResponse(
            f"""<!DOCTYPE html>
<html>
<head><title>NetSentinel</title></head>
<body style="font-family: sans-serif; padding: 2rem; background: #0f172a; color: #f8fafc;">
    <h1>🛡️ NetSentinel v{settings.app_version}</h1>
    <p>Il backend NetSentinel è attivo e funzionante.</p>
    <p>API docs: <a style="color: #38bdf8;" href="/docs">/docs</a></p>
    <p>Health check: <a style="color: #38bdf8;" href="/healthz">/healthz</a></p>
    <p>Metrics: <a style="color: #38bdf8;" href="/metrics">/metrics</a></p>
</body>
</html>"""
        )


def resolve_cert_path(path_str: str | None) -> Path | None:
    """Resolve SSL certificate file path, checking direct path and Home Assistant /ssl directory."""
    if not path_str:
        return None
    p = Path(path_str)
    if p.is_file():
        return p
    ha_ssl = Path("/ssl") / path_str
    if ha_ssl.is_file():
        return ha_ssl
    return None


def main():
    """CLI entrypoint with dual-binding support for direct LAN access (HTTP or HTTPS) and Home Assistant Ingress."""
    import asyncio
    import socket

    import uvicorn

    configured_port = settings.port
    ingress_port = settings.ingress_port

    ssl_cert = resolve_cert_path(settings.ssl_certfile) if settings.ssl_enabled else None
    ssl_key = resolve_cert_path(settings.ssl_keyfile) if settings.ssl_enabled else None
    use_ssl = bool(settings.ssl_enabled and ssl_cert and ssl_key)

    if settings.ssl_enabled and not use_ssl:
        logger.error(
            "SSL abilitato nelle impostazioni, ma i file certificato non sono stati trovati (cert: %s, key: %s). "
            "Verifica la cartella /ssl o i percorsi specificati. Avvio in modalità HTTP di fallback.",
            settings.ssl_certfile,
            settings.ssl_keyfile,
        )

    # In debug mode, run standard single server with reload
    if settings.debug:
        uvicorn.run(
            "app.main:app",
            host=settings.host,
            port=configured_port,
            reload=True,
            ssl_keyfile=str(ssl_key) if use_ssl else None,
            ssl_certfile=str(ssl_cert) if use_ssl else None,
        )
        return

    # Case 1: Direct access via HTTPS (Ingress remains HTTP on dedicated ingress_port)
    if use_ssl:
        eff_ingress_port = ingress_port
        if eff_ingress_port == configured_port:
            eff_ingress_port = 8099 if configured_port != 8099 else 8098
            logger.warning(
                "La porta Ingress coincide con la porta HTTPS configurata (%d). Ingress spostato sulla porta %d.",
                configured_port,
                eff_ingress_port,
            )

        logger.info(
            "Avvio NetSentinel in HTTPS su %s:%d (cert: %s)",
            settings.host,
            configured_port,
            ssl_cert,
        )
        logger.info("Avvio endpoint Home Assistant Ingress in HTTP su 0.0.0.0:%d", eff_ingress_port)

        main_config = uvicorn.Config(
            app=app,
            host=settings.host,
            port=configured_port,
            ssl_keyfile=str(ssl_key),
            ssl_certfile=str(ssl_cert),
            log_config=None,
            lifespan="on",
        )
        ingress_config = uvicorn.Config(
            app=app,
            host="0.0.0.0",
            port=eff_ingress_port,
            log_config=None,
            lifespan="off",
        )

        main_server = uvicorn.Server(main_config)
        ingress_server = uvicorn.Server(ingress_config)

        async def serve_dual():
            await asyncio.gather(main_server.serve(), ingress_server.serve())

        asyncio.run(serve_dual())
        return

    # Case 2: Plain HTTP for direct access (Multi-port transparent binding)
    ports_to_bind = [configured_port]
    if ingress_port not in ports_to_bind:
        ports_to_bind.append(ingress_port)
    if 8181 not in ports_to_bind:
        ports_to_bind.append(8181)

    sockets: list[socket.socket] = []
    for port in ports_to_bind:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind((settings.host, port))
            s.listen(128)
            s.setblocking(False)
            sockets.append(s)
            logger.info("Socket HTTP NetSentinel attivo su %s:%d", settings.host, port)
        except OSError as e:
            if port == configured_port:
                logger.error("Impossibile associare la porta principale configurata %d: %s", port, e)
                raise
            else:
                logger.warning("Porta secondaria/ingress %d non disponibile (%s).", port, e)

    config = uvicorn.Config(app=app, log_config=None)
    server = uvicorn.Server(config)
    asyncio.run(server.serve(sockets=sockets))


if __name__ == "__main__":
    main()
