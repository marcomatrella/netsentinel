"""Internal health watchdog for dead-man's switch verification."""

import logging
from typing import Any

from app.db.session import AsyncSessionLocal
from app.scheduler.engine import scheduler
from sqlalchemy import text

logger = logging.getLogger("netsentinel.heartbeat.watchdog")


class HealthWatchdog:
    """Monitors internal subsystem health to guard dead-man's switch ping."""

    async def check_database(self) -> bool:
        """Verify SQLite WAL database responds to queries."""
        try:
            async with AsyncSessionLocal() as session:
                res = await session.execute(text("SELECT 1"))
                return res.scalar() == 1
        except Exception as exc:
            logger.error("Watchdog DB check fallito: %s", exc)
            return False

    def check_scheduler(self) -> bool:
        """Verify internal asyncio scheduler is running."""
        return scheduler.is_running

    async def evaluate_health(self) -> tuple[bool, dict[str, Any]]:
        """Run all internal health checks and determine if heartbeat can be sent."""
        db_ok = await self.check_database()
        sched_ok = self.check_scheduler()

        overall_ok = db_ok and sched_ok
        details = {
            "database_ok": db_ok,
            "scheduler_ok": sched_ok,
            "overall_healthy": overall_ok,
        }
        if not overall_ok:
            logger.warning("Watchdog ha rilevato problemi interni: %s", details)
        return overall_ok, details


watchdog = HealthWatchdog()
