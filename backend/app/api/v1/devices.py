"""Devices REST API endpoints."""

import json

from app.db.models import Device
from app.db.session import get_db
from app.schemas.entities import DeviceCreate, DeviceRead, DeviceUpdate, InterfaceBase
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter(prefix="/devices", tags=["Devices"])


def _to_device_read(device: Device) -> DeviceRead:
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
        interfaces=interfaces,
    )


@router.get("", response_model=list[DeviceRead], summary="Elenco di tutti gli apparati")
async def list_devices(
    kind: str | None = None,
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[DeviceRead]:
    """Retrieve all monitored devices with optional filters."""
    stmt = select(Device).options(selectinload(Device.interfaces))
    if kind:
        stmt = stmt.where(Device.kind == kind)
    if status_filter:
        stmt = stmt.where(Device.status == status_filter)

    res = await db.execute(stmt)
    devices = res.scalars().all()
    return [_to_device_read(d) for d in devices]


@router.get("/{device_id}", response_model=DeviceRead, summary="Dettaglio singolo apparato")
async def get_device(device_id: str, db: AsyncSession = Depends(get_db)) -> DeviceRead:
    """Get device by ID."""
    stmt = select(Device).options(selectinload(Device.interfaces)).where(Device.id == device_id)
    res = await db.execute(stmt)
    device = res.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Apparato non trovato.")
    return _to_device_read(device)


@router.post("", response_model=DeviceRead, status_code=status.HTTP_201_CREATED, summary="Aggiungi nuovo apparato")
async def create_device(payload: DeviceCreate, db: AsyncSession = Depends(get_db)) -> DeviceRead:
    """Create a new device."""
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
    """Update device attributes."""
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

    await db.commit()

    stmt = select(Device).options(selectinload(Device.interfaces)).where(Device.id == device_id)
    res = await db.execute(stmt)
    updated_device = res.scalar_one()
    return _to_device_read(updated_device)


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Elimina apparato")
async def delete_device(device_id: str, db: AsyncSession = Depends(get_db)) -> None:
    """Delete a device and cascade delete its checks, interfaces and dependencies."""
    device = await db.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Apparato non trovato.")
    await db.delete(device)
    await db.commit()
