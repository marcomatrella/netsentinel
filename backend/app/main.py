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

# Ingress Middleware (Home Assistant reverse proxy support)
@app.middleware("http")
async def ingress_middleware(request: Request, call_next):
    ingress_path = request.headers.get("X-Ingress-Path")
    if ingress_path:
        request.scope["root_path"] = ingress_path.rstrip("/")
    return await call_next(request)

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
            meta_tag = f'<meta name="ingress-path" content="{ingress_path.rstrip("/")}">'
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


def main():
    """CLI entrypoint."""
    import asyncio
    import socket

    import uvicorn

    ha_ingress_port = 8181
    configured_port = settings.port

    if configured_port == ha_ingress_port or settings.debug:
        uvicorn.run(
            "app.main:app",
            host=settings.host,
            port=configured_port,
            reload=settings.debug,
        )
        return

    # If user customized port (e.g. 8282), try to also bind to 8181 for Ingress
    sockets: list[socket.socket] = []
    for port in [configured_port, ha_ingress_port]:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind((settings.host, port))
            s.listen(128)
            s.setblocking(False)
            sockets.append(s)
            logger.info("Socket web server in ascolto su %s:%d", settings.host, port)
        except OSError as e:
            if port == configured_port:
                logger.error("Impossibile associare la porta configurata %d: %s", port, e)
                raise
            else:
                logger.warning("Porta Ingress secondaria %d non disponibile (%s).", port, e)

    config = uvicorn.Config(app=app, log_config=None)
    server = uvicorn.Server(config)
    asyncio.run(server.serve(sockets=sockets))


if __name__ == "__main__":
    main()
