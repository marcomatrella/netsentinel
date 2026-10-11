"""Application system settings and retention policy REST API endpoints."""

import json
from typing import Any

from app.db.models import UserSettings
from app.db.session import get_db
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/settings", tags=["Settings"])


class RetentionSettingsPayload(BaseModel):
    """Payload to update data retention policy."""

    retention_period: str = Field(
        default="24h",
        description="Allowed options: 24h, 48h, 5d, 10d, 30d",
    )


DEFAULT_SETTINGS = {
    "retention_period": "24h",  # Options: 24h, 48h, 5d, 10d, 30d
}


@router.get("", response_model=dict[str, Any])
async def get_settings(db: AsyncSession = Depends(get_db)):
    """Retrieve all saved user settings with fallbacks."""
    res = await db.execute(select(UserSettings))
    records = res.scalars().all()
    result = dict(DEFAULT_SETTINGS)
    for r in records:
        try:
            val = json.loads(r.value_json)
            result[r.key] = val
        except Exception:
            result[r.key] = r.value_json
    return result


@router.post("/retention", response_model=dict[str, Any])
async def update_retention_setting(
    payload: RetentionSettingsPayload,
    db: AsyncSession = Depends(get_db),
):
    """Update timeline / data retention policy (24h, 48h, 5d, 10d, 30d)."""
    valid_options = ["24h", "48h", "5d", "10d", "30d"]
    period = payload.retention_period if payload.retention_period in valid_options else "24h"

    setting = await db.get(UserSettings, "retention_period")
    if not setting:
        setting = UserSettings(key="retention_period", value_json=json.dumps(period))
        db.add(setting)
    else:
        setting.value_json = json.dumps(period)

    await db.commit()
    return {"status": "ok", "retention_period": period}
