"""Pytest configuration and global fixtures."""

import os

# Set dedicated isolated test database before importing app modules
os.environ["NETSENTINEL_DATABASE_URL"] = "sqlite+aiosqlite:///./data/netsentinel_test.db"

import app.db.models  # noqa: F401
import pytest
from app.db.base import Base
from app.db.session import engine


@pytest.fixture(autouse=True)
async def reset_database():
    """Ensure clean database tables for each test in isolated test database."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
