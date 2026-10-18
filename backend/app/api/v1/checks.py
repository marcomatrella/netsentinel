"""Checks REST API endpoints."""

import json
from datetime import datetime
from typing import Any

from app.collector.plugins import registry
from app.crypto import decrypt_secret, encrypt_secret
from app.db.models import Check, Device
from app.db.session import get_db
from app.scheduler.engine import scheduler
from app.schemas.entities import CheckCreate, CheckRead, CheckTestPayload, CheckUpdate
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/checks", tags=["Checks"])


def _to_check_read(chk: Check) -> CheckRead:
    """Convert Check model to CheckRead."""
    params = json.loads(chk.params_json) if chk.params_json else {}
    # Decrypt any encrypted fields for authorized read
    for k in ["password", "token", "api_key", "secret", "access_token"]:
        if k in params and isinstance(params[k], str):
            params[k] = decrypt_secret(params[k])

    thresholds = json.loads(chk.thresholds_json) if chk.thresholds_json else {}
    f_policy = json.loads(chk.failure_policy_json) if chk.failure_policy_json else {}
    r_policy = json.loads(chk.recovery_policy_json) if chk.recovery_policy_json else {}

    return CheckRead(
        id=chk.id,
        device_id=chk.device_id,
        type=chk.type,
        name=chk.name,
        params=params,
        interval_seconds=chk.interval_seconds,
        timeout_seconds=chk.timeout_seconds,
        thresholds=thresholds,
        failure_policy=f_policy,
        recovery_policy=r_policy,
        enabled=chk.enabled,
        current_status=chk.current_status,
        status_since=chk.status_since,
        last_run_at=chk.last_run_at,
        next_run_at=chk.next_run_at,
    )


@router.get("", response_model=list[CheckRead], summary="Elenco dei controlli")
async def list_checks(
    device_id: str | None = None,
    check_type: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[CheckRead]:
    """Retrieve all checks optionally filtered by device or type."""
    stmt = select(Check)
    if device_id:
        stmt = stmt.where(Check.device_id == device_id)
    if check_type:
        stmt = stmt.where(Check.type == check_type)

    res = await db.execute(stmt)
    checks = res.scalars().all()
    return [_to_check_read(c) for c in checks]


@router.get("/{check_id}", response_model=CheckRead, summary="Dettaglio controllo")
async def get_check(check_id: str, db: AsyncSession = Depends(get_db)) -> CheckRead:
    """Retrieve single check by ID."""
    chk = await db.get(Check, check_id)
    if not chk:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Controllo non trovato.")
    return _to_check_read(chk)


@router.post("", response_model=CheckRead, status_code=status.HTTP_201_CREATED, summary="Aggiungi nuovo controllo")
async def create_check(payload: CheckCreate, db: AsyncSession = Depends(get_db)) -> CheckRead:
    """Register a new check on a device."""
    device = await db.get(Device, payload.device_id)
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Apparato specificato non trovato.")

    existing = await db.get(Check, payload.id)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="ID controllo già esistente.")

    # Encrypt sensitive params
    params = payload.params.copy()
    for k in ["password", "token", "api_key", "secret", "access_token"]:
        if k in params and isinstance(params[k], str):
            params[k] = encrypt_secret(params[k])

    chk = Check(
        id=payload.id,
        device_id=payload.device_id,
        type=payload.type,
        name=payload.name,
        params_json=json.dumps(params),
        interval_seconds=payload.interval_seconds,
        timeout_seconds=payload.timeout_seconds,
        thresholds_json=json.dumps(payload.thresholds),
        failure_policy_json=json.dumps(payload.failure_policy.model_dump()),
        recovery_policy_json=json.dumps(payload.recovery_policy.model_dump()),
        enabled=payload.enabled,
        current_status="unknown",
        next_run_at=datetime.utcnow(),
    )
    db.add(chk)
    await db.commit()
    await db.refresh(chk)
    return _to_check_read(chk)


@router.post("/test", summary="Test parametri controllo senza salvare")
async def test_check_params(payload: CheckTestPayload) -> dict[str, Any]:
    """Test check parameters and connectivity on-the-fly before saving."""
    collector = registry.get(payload.type)
    if not collector:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Collector '{payload.type}' non disponibile.",
        )

    res = await collector.collect(
        target_address=payload.target_address,
        params=payload.params,
        timeout_seconds=payload.timeout_seconds,
    )
    obs = res.observations[0] if res.observations else None
    return {
        "status": obs.status if obs else "unknown",
        "value": obs.value if obs else None,
        "details": obs.details if obs else {},
    }


@router.post("/{check_id}/execute", summary="Esegui controllo immediatamente")
async def execute_check_now(check_id: str, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Manually trigger immediate execution of a check (for UI 'Esegui ora' button)."""
    chk = await db.get(Check, check_id)
    if not chk:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Controllo non trovato.")

    device = await db.get(Device, chk.device_id)
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Apparato non trovato.")

    collector = registry.get(chk.type)
    if not collector:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Collector '{chk.type}' non disponibile.")

    params = json.loads(chk.params_json) if chk.params_json else {}
    for k in ["password", "token", "api_key", "secret", "access_token"]:
        if k in params and isinstance(params[k], str):
            params[k] = decrypt_secret(params[k])

    target = params.get("target")
    if not target and device.addresses_json:
        try:
            addrs = json.loads(device.addresses_json)
            target = addrs.get("ip") or addrs.get("hostname")
        except Exception:
            pass

    res = await collector.collect(target_address=target, params=params, timeout_seconds=chk.timeout_seconds)
    obs = res.observations[0] if res.observations else None
    if obs:
        chk.current_status = obs.status
        chk.last_run_at = datetime.utcnow()
        if obs.details:
            scheduler.set_latest_check_details(check_id, obs.details)
        await db.commit()

    return {
        "check_id": check_id,
        "device_id": chk.device_id,
        "status": obs.status if obs else "unknown",
        "value": obs.value if obs else None,
        "details": obs.details if obs else {},
    }


@router.patch("/{check_id}", response_model=CheckRead, summary="Modifica controllo")
async def update_check(
    check_id: str,
    payload: CheckUpdate,
    db: AsyncSession = Depends(get_db),
) -> CheckRead:
    """Update check thresholds, policies or execution interval."""
    chk = await db.get(Check, check_id)
    if not chk:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Controllo non trovato.")

    if payload.name is not None:
        chk.name = payload.name
    if payload.params is not None:
        params = payload.params.copy()
        for k in ["password", "token", "api_key", "secret", "access_token"]:
            if k in params and isinstance(params[k], str):
                params[k] = encrypt_secret(params[k])
        chk.params_json = json.dumps(params)
    if payload.interval_seconds is not None:
        chk.interval_seconds = payload.interval_seconds
    if payload.timeout_seconds is not None:
        chk.timeout_seconds = payload.timeout_seconds
    if payload.thresholds is not None:
        chk.thresholds_json = json.dumps(payload.thresholds)
    if payload.failure_policy is not None:
        chk.failure_policy_json = json.dumps(payload.failure_policy.model_dump())
    if payload.recovery_policy is not None:
        chk.recovery_policy_json = json.dumps(payload.recovery_policy.model_dump())
    if payload.enabled is not None:
        chk.enabled = payload.enabled

    if payload.params is not None or payload.enabled is True:
        chk.next_run_at = datetime.utcnow()

    await db.commit()
    await db.refresh(chk)
    return _to_check_read(chk)


@router.delete("/{check_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Elimina controllo")
async def delete_check(check_id: str, db: AsyncSession = Depends(get_db)) -> None:
    """Delete a check."""
    chk = await db.get(Check, check_id)
    if not chk:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Controllo non trovato.")
    await db.delete(chk)
    await db.commit()
