import json
import logging
from typing import Any

from app.config import settings
from app.db.models import (
    CanvasLayout,
    Check,
    Dependency,
    Device,
    Incident,
    Link,
    Observation,
    utcnow,
)
from app.db.session import get_db
from app.scheduler.engine import scheduler
from app.schemas.entities import (
    DeviceBatchDeleteRequest,
    DeviceCreate,
    DeviceIntegrationRead,
    DeviceRead,
    DeviceUpdate,
    InterfaceBase,
)
from app.topology.deduction import deduce_dependencies_from_topology
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = logging.getLogger("netsentinel.api.devices")

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


INTEGRATION_CHECK_TYPES = {
    "unifi",
    "adguard_home",
    "home_assistant",
    "synology_dsm",
    "fritzbox",
    "omada",
    "mikrotik",
    "snmp_bridge",
    "opnsense",
    "pfsense",
    "asuswrt",
    "netgear",
}


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

    integrations = [
        DeviceIntegrationRead(
            id=c.id,
            type=c.type,
            name=c.name,
            status=c.current_status,
            enabled=c.enabled,
            last_run_at=c.last_run_at,
            params={
                k: v
                for k, v in (json.loads(c.params_json) if c.params_json else {}).items()
                if k not in ["password", "token", "api_key", "secret", "access_token"]
            },
            details=scheduler.get_latest_check_details(c.id),
        )
        for c in (getattr(device, "checks", None) or [])
        if c.type in INTEGRATION_CHECK_TYPES
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
        integrations=integrations,
    )


@router.get("", response_model=list[DeviceRead], summary="Elenco di tutti gli apparati")
async def list_devices(
    kind: str | None = None,
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[DeviceRead]:
    """Retrieve all monitored devices with optional filters and latest RTT."""
    stmt = select(Device).options(selectinload(Device.interfaces), selectinload(Device.checks))
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
            .where(
                Observation.device_id == d.id,
                Observation.status == "ok",
                Observation.value.isnot(None),
            )
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
        .where(
            Observation.device_id == device.id,
            Observation.status == "ok",
            Observation.value.isnot(None),
        )
        .order_by(desc(Observation.ts))
        .limit(1)
    )
    val = obs_res.scalar_one_or_none()
    rtt = round(val, 1) if val is not None else None

    return _to_device_read(device, rtt_ms=rtt)


@router.post(
    "",
    response_model=DeviceRead,
    status_code=status.HTTP_201_CREATED,
    summary="Aggiungi nuovo apparato",
)
async def create_device(payload: DeviceCreate, db: AsyncSession = Depends(get_db)) -> DeviceRead:
    """Create a new device and provision its active checks."""
    existing = await db.get(Device, payload.id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="ID apparato già esistente."
        )

    new_ip = payload.addresses.ip.strip() if payload.addresses and payload.addresses.ip else None
    if new_ip:
        all_devs = (await db.execute(select(Device))).scalars().all()
        for d in all_devs:
            addrs = json.loads(d.addresses_json) if d.addresses_json else {}
            if addrs.get("ip") == new_ip:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"L'indirizzo IP '{new_ip}' è già assegnato all'apparato '{d.name}' ({d.id}).",
                )

    if payload.roles:
        single_roles = {"dns_resolver", "dhcp_server", "vantage_point"}
        if any(r in single_roles for r in payload.roles):
            all_devs_roles = (await db.execute(select(Device))).scalars().all()
            for od in all_devs_roles:
                od_roles = json.loads(od.roles_json) if od.roles_json else []
                new_od_roles = [
                    r
                    for r in od_roles
                    if not (r == "dns_resolver" and "dns_resolver" in payload.roles)
                    and not (r == "dhcp_server" and "dhcp_server" in payload.roles)
                    and not (r == "vantage_point" and "vantage_point" in payload.roles)
                ]
                if len(new_od_roles) != len(od_roles):
                    od.roles_json = json.dumps(new_od_roles)
            if "vantage_point" in payload.roles:
                settings.vantage_point_id = payload.id

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

    new_ip = payload.addresses.ip.strip() if payload.addresses and payload.addresses.ip else None
    if new_ip:
        all_devs = (await db.execute(select(Device).where(Device.id != device_id))).scalars().all()
        for d in all_devs:
            addrs = json.loads(d.addresses_json) if d.addresses_json else {}
            if addrs.get("ip") == new_ip:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"L'indirizzo IP '{new_ip}' è già assegnato all'apparato '{d.name}' ({d.id}).",
                )

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
    vp_changed = False
    if payload.roles is not None:
        single_roles = {"dns_resolver", "dhcp_server", "vantage_point"}
        old_roles = json.loads(device.roles_json) if device.roles_json else []
        had_vp = "vantage_point" in old_roles
        has_vp = "vantage_point" in payload.roles
        if had_vp != has_vp:
            vp_changed = True

        if any(r in single_roles for r in payload.roles):
            other_devs = (
                (await db.execute(select(Device).where(Device.id != device_id))).scalars().all()
            )
            for od in other_devs:
                od_roles = json.loads(od.roles_json) if od.roles_json else []
                new_od_roles = [
                    r
                    for r in od_roles
                    if not (r == "dns_resolver" and "dns_resolver" in payload.roles)
                    and not (r == "dhcp_server" and "dhcp_server" in payload.roles)
                    and not (r == "vantage_point" and "vantage_point" in payload.roles)
                ]
                if len(new_od_roles) != len(od_roles):
                    od.roles_json = json.dumps(new_od_roles)

        device.roles_json = json.dumps(payload.roles)
        if has_vp:
            settings.vantage_point_id = device_id
        elif had_vp and settings.vantage_point_id == device_id:
            other_vp = (
                (await db.execute(select(Device).where(Device.id != device_id))).scalars().all()
            )
            fallback_vp = None
            for od in other_vp:
                od_roles = json.loads(od.roles_json) if od.roles_json else []
                if "vantage_point" in od_roles:
                    fallback_vp = od.id
                    break
            settings.vantage_point_id = fallback_vp

    if payload.notes is not None:
        device.notes = payload.notes

    addrs = json.loads(device.addresses_json) if device.addresses_json else {}
    roles = json.loads(device.roles_json) if device.roles_json else []
    await ensure_device_checks(db, device.id, device.name, addrs, roles)

    if vp_changed:
        dev_res = await db.execute(select(Device))
        all_d = dev_res.scalars().all()
        link_res = await db.execute(select(Link))
        all_l = link_res.scalars().all()
        vp_target = settings.vantage_point_id or (all_d[0].id if all_d else None)
        if vp_target:
            deduced = deduce_dependencies_from_topology(
                devices=all_d,
                links=all_l,
                vantage_point_id=vp_target,
            )
            curr_deps = await db.execute(select(Dependency))
            for cd in curr_deps.scalars().all():
                await db.delete(cd)
            await db.flush()
            for dep_create in deduced:
                db.add(
                    Dependency(
                        id=dep_create.id,
                        dependent_id=dep_create.dependent_id,
                        provider_id=dep_create.provider_id,
                        kind=dep_create.kind,
                        strength=dep_create.strength,
                        source=dep_create.source,
                        reason=dep_create.reason,
                    )
                )

    await db.commit()

    stmt = select(Device).options(selectinload(Device.interfaces)).where(Device.id == device_id)
    res = await db.execute(stmt)
    updated_device = res.scalar_one()

    obs_res = await db.execute(
        select(Observation.value)
        .where(
            Observation.device_id == device.id,
            Observation.status == "ok",
            Observation.value.isnot(None),
        )
        .order_by(desc(Observation.ts))
        .limit(1)
    )
    val = obs_res.scalar_one_or_none()
    rtt = round(val, 1) if val is not None else None

    return _to_device_read(updated_device, rtt_ms=rtt)


@router.post("/batch-delete", summary="Elimina apparati multipli")
async def batch_delete_devices(
    payload: DeviceBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Delete multiple devices in one atomic transaction, cascade deleting links, checks and canvas layout positions."""
    if not payload.device_ids:
        return {"deleted_count": 0, "deleted_ids": []}

    deleted_ids: list[str] = []
    to_delete_set = set(payload.device_ids)

    # 1. Fetch devices to delete
    res = await db.execute(select(Device).where(Device.id.in_(to_delete_set)))
    devices = res.scalars().all()
    for dev in devices:
        deleted_ids.append(dev.id)
        await db.delete(dev)

    # 2. Cleanup CanvasLayout nodes and edges
    layout = await db.get(CanvasLayout, "default")
    if layout:
        try:
            nodes = json.loads(layout.nodes_json) if layout.nodes_json else []
            edges = json.loads(layout.edges_json) if layout.edges_json else []
            new_nodes = [n for n in nodes if n.get("id") not in to_delete_set]
            new_edges = [
                e
                for e in edges
                if e.get("source") not in to_delete_set and e.get("target") not in to_delete_set
            ]
            layout.nodes_json = json.dumps(new_nodes)
            layout.edges_json = json.dumps(new_edges)
            layout.updated_at = utcnow()
        except Exception:
            pass

    # 3. Resolve any active incidents targeting these deleted devices
    from app.correlation.incident_manager import incident_manager

    inc_res = await db.execute(
        select(Incident).where(
            Incident.status.in_(["open", "monitoring"]),
            Incident.root_cause_device_id.in_(to_delete_set),
        )
    )
    for inc in inc_res.scalars().all():
        await incident_manager.resolve_incident(db, inc.id)

    await db.commit()

    # Trigger correlation cycle to update status of remaining devices and clear incident state
    try:
        from app.correlation.engine import correlation_engine

        await correlation_engine.run_correlation_cycle(db)
    except Exception as e:
        logger.warning("Errore correlazione post-batch-delete: %s", e)

    return {"deleted_count": len(deleted_ids), "deleted_ids": deleted_ids}


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Elimina apparato")
async def delete_device(device_id: str, db: AsyncSession = Depends(get_db)) -> None:
    """Delete a device and cascade delete its checks, interfaces, dependencies and layout node."""
    device = await db.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Apparato non trovato.")

    # Cleanup CanvasLayout
    layout = await db.get(CanvasLayout, "default")
    if layout:
        try:
            nodes = json.loads(layout.nodes_json) if layout.nodes_json else []
            edges = json.loads(layout.edges_json) if layout.edges_json else []
            new_nodes = [n for n in nodes if n.get("id") != device_id]
            new_edges = [
                e for e in edges if e.get("source") != device_id and e.get("target") != device_id
            ]
            layout.nodes_json = json.dumps(new_nodes)
            layout.edges_json = json.dumps(new_edges)
            layout.updated_at = utcnow()
        except Exception:
            pass

    # Resolve any incident for this device
    from app.correlation.incident_manager import incident_manager

    inc_res = await db.execute(
        select(Incident).where(
            Incident.status.in_(["open", "monitoring"]),
            Incident.root_cause_device_id == device_id,
        )
    )
    for inc in inc_res.scalars().all():
        await incident_manager.resolve_incident(db, inc.id)

    await db.delete(device)
    await db.commit()

    # Trigger correlation cycle to update status of remaining devices and clear incident state
    try:
        from app.correlation.engine import correlation_engine

        await correlation_engine.run_correlation_cycle(db)
    except Exception as e:
        logger.warning("Errore correlazione post-delete: %s", e)
