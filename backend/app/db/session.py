"""Database engine and session management with SQLite WAL configuration."""

import os
from collections.abc import AsyncGenerator

from app.config import settings
from app.db.base import Base
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

# Create async engine with WAL mode optimization and NullPool for SQLite
db_url = os.getenv(
    "NETSENTINEL_DATABASE_URL", settings.database_url or "sqlite+aiosqlite:///./data/netsentinel.db"
)
is_sqlite = db_url.startswith("sqlite")
engine_kwargs = {
    "echo": settings.debug,
    "future": True,
    "connect_args": {"check_same_thread": False},
}
if is_sqlite:
    engine_kwargs["poolclass"] = NullPool

engine = create_async_engine(
    db_url,
    **engine_kwargs,
)


@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Configure SQLite pragmas for performance and data safety on HDD/NAS."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA synchronous=NORMAL;")
    cursor.execute("PRAGMA foreign_keys=ON;")
    cursor.execute("PRAGMA busy_timeout=5000;")
    cursor.execute("PRAGMA cache_size=-16000;")  # 16 MB cache
    cursor.close()


AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def init_db() -> None:
    """Initialize database tables and schemas, adding missing columns if upgrading."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Migration helper for SQLite scheduled_maintenance_windows recurrence columns
        if is_sqlite:
            from sqlalchemy import text

            for col, col_type in [
                ("recurrence_type", "VARCHAR(32) DEFAULT 'none'"),
                ("start_time", "VARCHAR(8)"),
                ("end_time", "VARCHAR(8)"),
                ("days_of_week", "VARCHAR(32)"),
                ("day_of_month", "INTEGER"),
                ("recurrence_end_date", "DATETIME"),
            ]:
                try:
                    await conn.execute(
                        text(
                            f"ALTER TABLE scheduled_maintenance_windows ADD COLUMN {col} {col_type};"
                        )
                    )
                except Exception:
                    pass  # Column already exists

            # Ensure composite indexes exist on observations for ultra-fast queries
            for idx_sql in [
                "CREATE INDEX IF NOT EXISTS ix_obs_device_status_ts ON observations (device_id, status, ts);",
                "CREATE INDEX IF NOT EXISTS ix_obs_device_ts ON observations (device_id, ts);",
            ]:
                try:
                    await conn.execute(text(idx_sql))
                except Exception:
                    pass

    # Sanitize and synchronize unique Vantage Point across existing devices
    async with AsyncSessionLocal() as session:
        try:
            import json

            from app.db.models import Device
            from sqlalchemy import select

            res = await session.execute(select(Device))
            devs = res.scalars().all()
            vp_devs = []
            for d in devs:
                roles = json.loads(d.roles_json) if d.roles_json else []
                if "vantage_point" in roles:
                    vp_devs.append((d, roles))

            if len(vp_devs) > 1:
                chosen = next(
                    (item for item in vp_devs if item[0].id == settings.vantage_point_id),
                    vp_devs[-1],
                )
                for d, r in vp_devs:
                    if d.id != chosen[0].id:
                        clean_roles = [x for x in r if x != "vantage_point"]
                        d.roles_json = json.dumps(clean_roles)
                await session.commit()
                settings.vantage_point_id = chosen[0].id
            elif len(vp_devs) == 1:
                settings.vantage_point_id = vp_devs[0][0].id
        except Exception:
            pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that provides an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
