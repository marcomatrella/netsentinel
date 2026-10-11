"""Pytest configuration and global fixtures."""

import pytest
from app.db.base import Base
from app.db.session import engine


@pytest.fixture(autouse=True)
async def reset_database():
    """Ensure clean database tables for each test."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
