"""Devices REST API endpoints."""

import json

from app.db.models import Check, Device, Observation, utcnow
from app.db.session import get_db
from app.schemas.entities import DeviceCreate, DeviceRead, DeviceUpdate, InterfaceBase
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter(prefix="/devices", tags=["Devices"])


async def ensure_device_checks(
    db: AsyncSession,
    device_id: str,
    name: str,
    addresses_dict: dict,
    roles_list: list,
) -> None:
    """Ensure baseline ping check and role-specific checks are configured and scheduled."""
    ip = (addresses_dict.get("ip") or addresses_dict.get("hostname") or "").strip()
    if not ip:
        return

    # Baseline ping check
    check_id = f"chk-ping-{device_id}"
    chk = await db.get(Check, check_id)
    if not chk:
        chk = Check(
            id=check_id,
            device_id=device_id,
            type="ping",
            name=f"Ping {name}",
            params_json=json.dumps({"target": ip, "count": 2, "timeout_seconds": 2.0}),
            interval_seconds=15,
            timeout_seconds=3.0,
            current_status="unknown",
            status_since=utcnow(),
            next_run_at=utcnow(),
            enabled=True,
        )
        db.add(chk)
    else:
        chk.name = f"Ping {name}"
        chk.params_json = json.dumps({"target": ip, "count": 2, "timeout_seconds": 2.0})
        chk.enabled = True
        chk.next_run_at = utcnow()

    # DNS check if role is dns_resolver
    dns_check_id = f"chk-dns-{device_id}"
    dns_chk = await db.get(Check, dns_check_id)
    if "dns_resolver" in roles_list:
        if not dns_chk:
            dns_chk = Check(
                id=dns_check_id,
                device_id=device_id,
                type="dns",
                name=f"DNS {name}",
                params_json=json.dumps({"target": ip, "query": "google.com"}),
                interval_seconds=30,
                timeout_seconds=4.0,
                current_status="unknown",
                status_since=utcnow(),
                next_run_at=utcnow(),
                enabled=True,
            )
            db.add(dns_chk)
        else:
            dns_chk.params_json = json.dumps({"target": ip, "query": "google.com"})
            dns_chk.enabled = True
            dns_chk.next_run_at = utcnow()
    elif dns_chk:
        dns_chk.enabled = False


def _to_device_read(device: Device, rtt_ms: float | None = None) -> DeviceRead:
    """Helper converting Device DB model to Pydantic DeviceRead."""
    addresses = json.loads(device.addresses_json) if device.addresses_json else {}
    tags = json.loads(device.tags_json) if device.tags_json else []
    roles = json.loads(device.roles_json) if device.roles_json else []

    interfaces = [
        InterfaceBase(
            id=i.id,
            name=i.name,
            type=i.type,
            expected_speed=i.expected_speed,
            mac_address=i.mac_address,
            notes=i.notes,
        )
        for i in (device.interfaces or [])
    ]

    return DeviceRead(
        id=device.id,
        name=device.name,
        kind=device.kind,
        location=device.location,
        criticality=device.criticality,
        addresses=addresses,
        tags=tags,
        roles=roles,
        notes=device.notes,
        status=device.status,
        status_since=device.status_since,
        last_seen=device.last_seen,
        rtt_ms=rtt_ms,
        interfaces=interfaces,
    )


@router.get("", response_model=list[DeviceRead], summary="Elenco di tutti gli apparati")
async def list_devices(
    kind: str | None = None,
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[DeviceRead]:
    """Retrieve all monitored devices with optional filters and latest RTT."""
    stmt = select(Device).options(selectinload(Device.interfaces))
    if kind:
        stmt = stmt.where(Device.kind == kind)
    if status_filter:
        stmt = stmt.where(Device.status == status_filter)

    res = await db.execute(stmt)
    devices = res.scalars().all()

    # Retrieve latest ping RTT observation for each device
    rtt_map: dict[str, float] = {}
    for d in devices:
        obs_res = await db.execute(
            select(Observation.value)
            .where(Observation.device_id == d.id, Observation.status == "ok", Observation.value.isnot(None))
            .order_by(desc(Observation.ts))
            .limit(1)
        )
        val = obs_res.scalar_one_or_none()
        if val is not None:
            rtt_map[d.id] = round(val, 1)

    return [_to_device_read(d, rtt_ms=rtt_map.get(d.id)) for d in devices]


@router.get("/{device_id}", response_model=DeviceRead, summary="Dettaglio singolo apparato")
async def get_device(device_id: str, db: AsyncSession = Depends(get_db)) -> DeviceRead:
    """Get device by ID."""
    stmt = select(Device).options(selectinload(Device.interfaces)).where(Device.id == device_id)
    res = await db.execute(stmt)
    device = res.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Apparato non trovato.")

    obs_res = await db.execute(
        select(Observation.value)
        .where(Observation.device_id == device.id, Observation.status == "ok", Observation.value.isnot(None))
        .order_by(desc(Observation.ts))
        .limit(1)
    )
    val = obs_res.scalar_one_or_none()
    rtt = round(val, 1) if val is not None else None

    return _to_device_read(device, rtt_ms=rtt)


@router.post("", response_model=DeviceRead, status_code=status.HTTP_201_CREATED, summary="Aggiungi nuovo apparato")
async def create_device(payload: DeviceCreate, db: AsyncSession = Depends(get_db)) -> DeviceRead:
    """Create a new device and provision its active checks."""
    existing = await db.get(Device, payload.id)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="ID apparato già esistente.")

    device = Device(
        id=payload.id,
        name=payload.name,
        kind=payload.kind,
        location=payload.location,
        criticality=payload.criticality,
        addresses_json=json.dumps(payload.addresses.model_dump()),
        tags_json=json.dumps(payload.tags),
        roles_json=json.dumps(payload.roles),
        notes=payload.notes,
        status="unknown",
    )
    db.add(device)
    await db.flush()

    await ensure_device_checks(
        db,
        device.id,
        device.name,
        payload.addresses.model_dump(),
        payload.roles,
    )
    await db.commit()

    stmt = select(Device).options(selectinload(Device.interfaces)).where(Device.id == payload.id)
    res = await db.execute(stmt)
    created_device = res.scalar_one()
    return _to_device_read(created_device)


@router.patch("/{device_id}", response_model=DeviceRead, summary="Aggiorna dati apparato")
async def update_device(
    device_id: str,
    payload: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
) -> DeviceRead:
    """Update device attributes and update active checks."""
    stmt = select(Device).options(selectinload(Device.interfaces)).where(Device.id == device_id)
    res = await db.execute(stmt)
    device = res.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Apparato non trovato.")

    if payload.name is not None:
        device.name = payload.name
    if payload.kind is not None:
        device.kind = payload.kind
    if payload.location is not None:
        device.location = payload.location
    if payload.criticality is not None:
        device.criticality = payload.criticality
    if payload.addresses is not None:
        device.addresses_json = json.dumps(payload.addresses.model_dump())
    if payload.tags is not None:
        device.tags_json = json.dumps(payload.tags)
    if payload.roles is not None:
        device.roles_json = json.dumps(payload.roles)
    if payload.notes is not None:
        device.notes = payload.notes

    addrs = json.loads(device.addresses_json) if device.addresses_json else {}
    roles = json.loads(device.roles_json) if device.roles_json else []
    await ensure_device_checks(db, device.id, device.name, addrs, roles)

    await db.commit()

    stmt = select(Device).options(selectinload(Device.interfaces)).where(Device.id == device_id)
    res = await db.execute(stmt)
    updated_device = res.scalar_one()

    obs_res = await db.execute(
        select(Observation.value)
        .where(Observation.device_id == device.id, Observation.status == "ok", Observation.value.isnot(None))
        .order_by(desc(Observation.ts))
        .limit(1)
    )
    val = obs_res.scalar_one_or_none()
    rtt = round(val, 1) if val is not None else None

    return _to_device_read(updated_device, rtt_ms=rtt)


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Elimina apparato")
async def delete_device(device_id: str, db: AsyncSession = Depends(get_db)) -> None:
    """Delete a device and cascade delete its checks, interfaces and dependencies."""
    device = await db.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Apparato non trovato.")
    await db.delete(device)
    await db.commit()
