"""Main FastAPI application for NetSentinel."""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
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
    async def serve_spa(full_path: str):
        # Ignore API and health requests
        if full_path.startswith("api/") or full_path in ["healthz", "metrics"]:
            return None
        file_to_serve = static_path / full_path
        if file_to_serve.is_file():
            return FileResponse(file_to_serve)
        return FileResponse(static_path / "index.html")
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
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )


if __name__ == "__main__":
    main()
