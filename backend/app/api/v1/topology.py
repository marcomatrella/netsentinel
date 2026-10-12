"""Topology and Canvas Layout API endpoints."""

import json
from typing import Any

from app.api.v1.devices import _to_device_read, ensure_device_checks
from app.config import settings
from app.db.models import CanvasLayout, ConfigVersion, Dependency, Device, Link, Observation, utcnow
from app.db.session import get_db
from app.schemas.config_yaml import NetSentinelConfigYaml
from app.schemas.entities import (
    CanvasLayoutRead,
    CanvasLayoutSave,
    DependencyCreate,
    DependencyRead,
    DeviceRead,
    LinkRead,
)
from app.topology.deduction import deduce_dependencies_from_topology
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter(prefix="/topology", tags=["Topology"])


class TopologyFullResponse(BaseModel):
    vantage_point_id: str | None
    devices: list[DeviceRead]
    links: list[LinkRead]
    dependencies: list[DependencyRead]
    layout: CanvasLayoutRead | None


class TopologyDeduceRequest(BaseModel):
    vantage_point_id: str
    devices: list[dict[str, Any]]
    links: list[dict[str, Any]]


class TopologyApplyRequest(BaseModel):
    vantage_point_id: str
    description: str = "Aggiornamento topologia da tela grafica"
    devices: list[dict[str, Any]]
    links: list[dict[str, Any]]
    dependencies: list[dict[str, Any]]
    layout: CanvasLayoutSave


class AssignNetworkRolesRequest(BaseModel):
    dns_server_id: str | None = None
    dhcp_server_id: str | None = None
    gateway_id: str | None = None
    vantage_point_id: str | None = None


@router.get("", response_model=TopologyFullResponse, summary="Ottieni la topologia completa e il layout della tela")
async def get_full_topology(db: AsyncSession = Depends(get_db)) -> TopologyFullResponse:
    """Retrieve all devices with latest RTT, dynamically deduced links, and dependencies."""
    dev_res = await db.execute(select(Device).options(selectinload(Device.interfaces)))
    db_devices = dev_res.scalars().all()

    # Query latest observation RTT for each device
    rtt_map: dict[str, float] = {}
    for d in db_devices:
        obs_res = await db.execute(
            select(Observation.value)
            .where(Observation.device_id == d.id, Observation.status == "ok", Observation.value.isnot(None))
            .order_by(desc(Observation.ts))
            .limit(1)
        )
        val = obs_res.scalar_one_or_none()
        if val is not None:
            rtt_map[d.id] = round(val, 1)

    devices = [_to_device_read(d, rtt_ms=rtt_map.get(d.id)) for d in db_devices]
    dev_status_map = {d.id: d.status for d in db_devices}

    link_res = await db.execute(select(Link))
    links: list[LinkRead] = []
    for lnk in link_res.scalars().all():
        src_status = dev_status_map.get(lnk.from_device_id, "unknown")
        dst_status = dev_status_map.get(lnk.to_device_id, "unknown")

        # Dynamically deduce live link status based on endpoint health
        if src_status == "down" or dst_status == "down":
            live_status = "down"
            live_source = "endpoint_down"
        elif src_status == "unreachable" or dst_status == "unreachable":
            live_status = "unreachable"
            live_source = "endpoint_unreachable"
        elif src_status in ["degraded", "flapping"] or dst_status in ["degraded", "flapping"]:
            live_status = "degraded"
            live_source = "endpoint_degraded"
        elif src_status == "ok" and dst_status == "ok":
            live_status = "ok"
            live_source = "ping_verified"
        else:
            live_status = "unverified"
            live_source = "awaiting_verification"

        links.append(
            LinkRead(
                id=lnk.id,
                from_device_id=lnk.from_device_id,
                from_port=lnk.from_port,
                to_device_id=lnk.to_device_id,
                to_port=lnk.to_port,
                medium=lnk.medium,
                poe=lnk.poe,
                cable_notes=lnk.cable_notes,
                status=live_status,
                status_source=live_source,
                throughput_bps=lnk.throughput_bps,
                updated_at=lnk.updated_at,
            )
        )

    dep_res = await db.execute(select(Dependency))
    dependencies = [
        DependencyRead(
            id=dp.id,
            dependent_id=dp.dependent_id,
            provider_id=dp.provider_id,
            kind=dp.kind,
            strength=dp.strength,
            source=dp.source,
            reason=dp.reason,
        )
        for dp in dep_res.scalars().all()
    ]

    layout_record = await db.get(CanvasLayout, "default")
    layout = None
    if layout_record:
        layout = CanvasLayoutRead(
            id=layout_record.id,
            nodes=json.loads(layout_record.nodes_json) if layout_record.nodes_json else [],
            edges=json.loads(layout_record.edges_json) if layout_record.edges_json else [],
            groups=json.loads(layout_record.groups_json) if layout_record.groups_json else [],
            updated_at=layout_record.updated_at,
        )

    # Find vantage point
    vp_id = settings.vantage_point_id
    if not vp_id:
        for d in devices:
            if "vantage_point" in d.roles:
                vp_id = d.id
                break

    return TopologyFullResponse(
        vantage_point_id=vp_id,
        devices=devices,
        links=links,
        dependencies=dependencies,
        layout=layout,
    )


@router.post("/deduce", response_model=list[DependencyCreate], summary="Deduci relazioni dal disegno (Sez. 4.6)")
async def deduce_dependencies(payload: TopologyDeduceRequest) -> list[DependencyCreate]:
    """Execute deduction engine on submitted nodes and links, returning inferred dependencies."""
    devices_mock = [
        Device(
            id=d["id"],
            name=d.get("name", d["id"]),
            kind=d.get("kind", "custom"),
            roles_json=json.dumps(d.get("roles", [])),
        )
        for d in payload.devices
    ]

    links_mock = [
        Link(
            id=lnk.get("id", f"link-{lnk.get('from')}-{lnk.get('to')}"),
            from_device_id=lnk.get("from") or lnk.get("from_device_id"),
            to_device_id=lnk.get("to") or lnk.get("to_device_id"),
            medium=lnk.get("medium", "ethernet"),
            poe=lnk.get("poe", False),
        )
        for lnk in payload.links
    ]

    return deduce_dependencies_from_topology(
        devices=devices_mock,
        links=links_mock,
        vantage_point_id=payload.vantage_point_id,
    )


@router.post("/apply", summary="Applica e salva modifiche alla topologia con snapshot di versione")
async def apply_topology(payload: TopologyApplyRequest, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    # Check duplicate IP addresses among submitted devices
    ip_map: dict[str, str] = {}
    for d_data in payload.devices:
        addrs = d_data.get("addresses", {})
        ip = addrs.get("ip") if isinstance(addrs, dict) else None
        if ip and ip.strip():
            ip_clean = ip.strip()
            if ip_clean in ip_map:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"L'indirizzo IP '{ip_clean}' è assegnato a più apparati ('{ip_map[ip_clean]}' e '{d_data.get('name', d_data['id'])}'). Gli indirizzi IP devono essere univoci.",
                )
            ip_map[ip_clean] = d_data.get("name", d_data["id"])

    # 1. Update devices and delete removed devices
    submitted_ids = {d["id"] for d in payload.devices}
    existing_dev_records = (await db.execute(select(Device))).scalars().all()
    for ed in existing_dev_records:
        if ed.id not in submitted_ids:
            await db.delete(ed)
    await db.flush()

    for d_data in payload.devices:
        dev = await db.get(Device, d_data["id"])
        if not dev:
            dev = Device(id=d_data["id"], name=d_data.get("name", d_data["id"]), kind=d_data.get("kind", "custom"))
            db.add(dev)
        dev.name = d_data.get("name", dev.name)
        dev.kind = d_data.get("kind", dev.kind)
        dev.location = d_data.get("location", dev.location)
        dev.criticality = d_data.get("criticality", dev.criticality)
        if "addresses" in d_data:
            dev.addresses_json = json.dumps(d_data["addresses"])
        if "roles" in d_data:
            dev.roles_json = json.dumps(d_data["roles"])
        if "tags" in d_data:
            dev.tags_json = json.dumps(d_data["tags"])

    await db.flush()


    # 2. Recreate links
    curr_links = await db.execute(select(Link))
    for cl in curr_links.scalars().all():
        await db.delete(cl)
    await db.flush()

    for l_data in payload.links:
        link = Link(
            id=l_data.get("id", f"link-{l_data.get('from')}-{l_data.get('to')}"),
            from_device_id=l_data.get("from") or l_data.get("from_device_id"),
            from_port=l_data.get("from_port"),
            to_device_id=l_data.get("to") or l_data.get("to_device_id"),
            to_port=l_data.get("to_port"),
            medium=l_data.get("medium", "ethernet"),
            poe=l_data.get("poe", False),
            cable_notes=l_data.get("cable_notes"),
            status="ok",
        )
        db.add(link)

    await db.flush()

    # 3. Recreate dependencies
    curr_deps = await db.execute(select(Dependency))
    for cd in curr_deps.scalars().all():
        await db.delete(cd)
    await db.flush()

    for dep_data in payload.dependencies:
        dep_dependent = dep_data.get("dependent_id") or dep_data.get("dependent")
        dep_provider = dep_data.get("provider_id") or dep_data.get("provider")
        dep_kind = dep_data["kind"]
        dep_id = dep_data.get("id") or f"dep-{dep_dependent}-{dep_provider}-{dep_kind}"

        dep = Dependency(
            id=dep_id,
            dependent_id=dep_dependent,
            provider_id=dep_provider,
            kind=dep_kind,
            strength=dep_data.get("strength", "hard"),
            source=dep_data.get("source", "inferred"),
            reason=dep_data.get("reason"),
        )
        db.add(dep)

    # 4. Save canvas layout
    layout_record = await db.get(CanvasLayout, "default")
    if not layout_record:
        layout_record = CanvasLayout(id="default")
        db.add(layout_record)
    layout_record.nodes_json = json.dumps(payload.layout.nodes)
    layout_record.edges_json = json.dumps(payload.layout.edges)
    layout_record.groups_json = json.dumps(payload.layout.groups)
    layout_record.updated_at = utcnow()

    # 4b. Ensure active checks are provisioned for all devices
    for d_data in payload.devices:
        addrs = d_data.get("addresses") or {}
        roles = d_data.get("roles") or []
        await ensure_device_checks(
            db,
            d_data["id"],
            d_data.get("name", d_data["id"]),
            addrs,
            roles,
        )

    # 5. Record version snapshot
    snapshot_yaml = NetSentinelConfigYaml(
        vantage_point=payload.vantage_point_id,
        devices=[
            {
                "id": d["id"],
                "name": d.get("name", d["id"]),
                "kind": d.get("kind", "custom"),
                "criticality": d.get("criticality", 3),
                "roles": d.get("roles", []),
            }
            for d in payload.devices
        ],
        links=[
            {
                "id": lnk.get("id", f"l-{idx}"),
                "from": lnk.get("from") or lnk.get("from_device_id"),
                "to": lnk.get("to") or lnk.get("to_device_id"),
                "medium": lnk.get("medium", "ethernet"),
                "poe": lnk.get("poe", False),
            }
            for idx, lnk in enumerate(payload.links)
        ],
        dependencies=[
            {
                "id": dp.get("id", f"d-{idx}"),
                "dependent": dp.get("dependent_id") or dp.get("dependent"),
                "provider": dp.get("provider_id") or dp.get("provider"),
                "kind": dp["kind"],
            }
            for idx, dp in enumerate(payload.dependencies)
        ],
    ).to_yaml()

    version_record = ConfigVersion(
        created_at=utcnow(),
        description=payload.description,
        yaml_content=snapshot_yaml,
        created_by="user",
    )
    db.add(version_record)

    await db.commit()
    return {"status": "applied", "version_id": version_record.id, "message": "Topologia applicata e salvata."}


@router.post("/assign-roles", response_model=TopologyFullResponse, summary="Riassegna ruoli di rete chiave (DNS, DHCP, Gateway, Vantage Point)")
async def assign_network_roles(
    payload: AssignNetworkRolesRequest,
    db: AsyncSession = Depends(get_db),
) -> TopologyFullResponse:
    """Assign or re-delegate core network roles (DNS resolver, DHCP server, Gateway, Vantage Point)."""
    dev_res = await db.execute(select(Device).options(selectinload(Device.interfaces)))
    devices = dev_res.scalars().all()

    for dev in devices:
        roles = json.loads(dev.roles_json) if dev.roles_json else []
        modified = False

        # DNS resolver role
        if payload.dns_server_id is not None:
            if dev.id == payload.dns_server_id and "dns_resolver" not in roles:
                roles.append("dns_resolver")
                modified = True
            elif dev.id != payload.dns_server_id and "dns_resolver" in roles:
                roles.remove("dns_resolver")
                modified = True

        # DHCP server role
        if payload.dhcp_server_id is not None:
            if dev.id == payload.dhcp_server_id and "dhcp_server" not in roles:
                roles.append("dhcp_server")
                modified = True
            elif dev.id != payload.dhcp_server_id and "dhcp_server" in roles:
                roles.remove("dhcp_server")
                modified = True

        # Gateway role
        if payload.gateway_id is not None:
            if dev.id == payload.gateway_id and "gateway" not in roles:
                roles.append("gateway")
                modified = True
            elif dev.id != payload.gateway_id and "gateway" in roles:
                roles.remove("gateway")
                modified = True

        # Vantage Point role
        if payload.vantage_point_id is not None:
            if dev.id == payload.vantage_point_id and "vantage_point" not in roles:
                roles.append("vantage_point")
                modified = True
            elif dev.id != payload.vantage_point_id and "vantage_point" in roles:
                roles.remove("vantage_point")
                modified = True

        if modified:
            dev.roles_json = json.dumps(roles)
            addrs = json.loads(dev.addresses_json) if dev.addresses_json else {}
            await ensure_device_checks(db, dev.id, dev.name, addrs, roles)

    await db.flush()

    # Re-deduce dependencies with updated roles
    link_res = await db.execute(select(Link))
    links = link_res.scalars().all()
    vp = payload.vantage_point_id or settings.vantage_point_id or (devices[0].id if devices else "vp")

    deduced = deduce_dependencies_from_topology(
        devices=devices,
        links=links,
        vantage_point_id=vp,
    )

    curr_deps = await db.execute(select(Dependency))
    for cd in curr_deps.scalars().all():
        await db.delete(cd)
    await db.flush()

    for dep_create in deduced:
        dep = Dependency(
            id=dep_create.id,
            dependent_id=dep_create.dependent_id,
            provider_id=dep_create.provider_id,
            kind=dep_create.kind,
            strength=dep_create.strength,
            source=dep_create.source,
            reason=dep_create.reason,
        )
        db.add(dep)

    await db.commit()
    return await get_full_topology(db)


@router.get("/export/yaml", summary="Esporta la topologia in formato netsentinel.yaml")
async def export_topology_yaml(db: AsyncSession = Depends(get_db)) -> Response:
    """Download the current live topology as netsentinel.yaml."""
    topo_res = await get_full_topology(db)
    if not topo_res.vantage_point_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vantage point non configurato.")

    config_yaml = NetSentinelConfigYaml(
        vantage_point=topo_res.vantage_point_id,
        devices=[
            {
                "id": d.id,
                "name": d.name,
                "kind": d.kind,
                "location": d.location,
                "criticality": d.criticality,
                "roles": d.roles,
                "tags": d.tags,
            }
            for d in topo_res.devices
        ],
        links=[
            {
                "id": lnk.id,
                "from": lnk.from_device_id,
                "to": lnk.to_device_id,
                "medium": lnk.medium,
                "poe": lnk.poe,
                "cable_notes": lnk.cable_notes,
            }
            for lnk in topo_res.links
        ],
        dependencies=[
            {
                "id": dp.id,
                "dependent": dp.dependent_id,
                "provider": dp.provider_id,
                "kind": dp.kind,
                "strength": dp.strength,
                "source": dp.source,
                "reason": dp.reason,
            }
            for dp in topo_res.dependencies
        ],
    )
    yaml_text = config_yaml.to_yaml()
    return Response(
        content=yaml_text,
        media_type="application/x-yaml",
        headers={"Content-Disposition": "attachment; filename=netsentinel.yaml"},
    )


class TopologyJsonBackup(BaseModel):
    version: str = "1.0"
    exported_at: str
    vantage_point_id: str | None = None
    devices: list[dict[str, Any]]
    links: list[dict[str, Any]]
    dependencies: list[dict[str, Any]]
    layout: dict[str, Any] | None = None


@router.get("/export/json", summary="Esporta il backup completo della plancia in formato JSON")
async def export_topology_json(db: AsyncSession = Depends(get_db)) -> TopologyJsonBackup:
    """Download full snapshot of devices, links, dependencies and canvas layout as JSON."""
    topo_res = await get_full_topology(db)
    layout_data = None
    if topo_res.layout:
        layout_data = {
            "id": topo_res.layout.id,
            "nodes": topo_res.layout.nodes,
            "edges": topo_res.layout.edges,
            "groups": topo_res.layout.groups,
        }

    return TopologyJsonBackup(
        version="1.0",
        exported_at=utcnow().isoformat(),
        vantage_point_id=topo_res.vantage_point_id,
        devices=[
            {
                "id": d.id,
                "name": d.name,
                "kind": d.kind,
                "location": d.location,
                "criticality": d.criticality,
                "addresses": {"ip": d.addresses.ip, "mac": d.addresses.mac, "hostname": d.addresses.hostname},
                "roles": d.roles,
                "tags": d.tags,
                "notes": d.notes,
            }
            for d in topo_res.devices
        ],
        links=[
            {
                "id": lnk.id,
                "from_device_id": lnk.from_device_id,
                "to_device_id": lnk.to_device_id,
                "from_port": lnk.from_port,
                "to_port": lnk.to_port,
                "medium": lnk.medium,
                "poe": lnk.poe,
                "cable_notes": lnk.cable_notes,
            }
            for lnk in topo_res.links
        ],
        dependencies=[
            {
                "id": dp.id,
                "dependent_id": dp.dependent_id,
                "provider_id": dp.provider_id,
                "kind": dp.kind,
                "strength": dp.strength,
                "source": dp.source,
                "reason": dp.reason,
            }
            for dp in topo_res.dependencies
        ],
        layout=layout_data,
    )


@router.post("/import/json", summary="Ripristina la plancia da backup JSON")
async def import_topology_json(
    payload: TopologyJsonBackup,
    db: AsyncSession = Depends(get_db),
) -> TopologyFullResponse:
    """Restores full devices, links, dependencies and canvas layout from a JSON backup."""
    vp_id = payload.vantage_point_id or (payload.devices[0]["id"] if payload.devices else "vp")

    layout_save = CanvasLayoutSave(
        nodes=payload.layout.get("nodes", []) if payload.layout else [],
        edges=payload.layout.get("edges", []) if payload.layout else [],
        groups=payload.layout.get("groups", []) if payload.layout else [],
    )

    apply_req = TopologyApplyRequest(
        vantage_point_id=vp_id,
        description="Ripristino da file di backup JSON",
        devices=payload.devices,
        links=payload.links,
        dependencies=payload.dependencies,
        layout=layout_save,
    )

    await apply_topology(apply_req, db)
    return await get_full_topology(db)



@router.get("/templates", summary="Restituisce modelli di topologia di rete preconfigurati")
async def get_topology_templates() -> list[dict[str, Any]]:
    """Return preconfigured general-purpose network topology templates."""
    return [
        {
            "id": "homelab",
            "name": "Home Lab Completo",
            "description": "Topologia tipica per home lab avanzato: Internet WAN, Router Firewall, Switch Core PoE, AP Wi-Fi, NAS con UPS, Server Hypervisor e domotica.",
            "vantage_point_id": "nas-synology",
            "devices": [
                {"id": "wan-fiber", "name": "Gateway WAN Fibra", "kind": "wan_gateway", "roles": ["wan_provider"], "addresses": {"ip": "192.168.1.1"}, "location": "Ingresso"},
                {"id": "router-core", "name": "Router Firewall", "kind": "router", "roles": ["dhcp_server", "dns_resolver"], "addresses": {"ip": "192.168.1.254"}, "location": "Rack Salotto"},
                {"id": "switch-poe-24p", "name": "Switch Core PoE 24P", "kind": "switch", "roles": [], "addresses": {"ip": "192.168.1.2"}, "location": "Rack Salotto"},
                {"id": "ups-nut", "name": "UPS Gruppo Continuità", "kind": "ups", "roles": ["power_provider"], "addresses": {"ip": "192.168.1.10"}, "location": "Rack Salotto"},
                {"id": "ap-livingroom", "name": "Access Point Salotto", "kind": "access_point", "roles": [], "addresses": {"ip": "192.168.1.20"}, "location": "Salotto"},
                {"id": "ap-studio", "name": "Access Point Studio", "kind": "access_point", "roles": [], "addresses": {"ip": "192.168.1.21"}, "location": "Studio"},
                {"id": "nas-synology", "name": "NAS Storage Synology", "kind": "nas", "roles": ["vantage_point"], "addresses": {"ip": "192.168.1.50"}, "location": "Rack Salotto"},
                {"id": "srv-proxmox", "name": "Server Proxmox VE", "kind": "server", "roles": [], "addresses": {"ip": "192.168.1.60"}, "location": "Rack Salotto"},
                {"id": "home-assistant", "name": "Home Assistant Hub", "kind": "smart_hub", "roles": [], "addresses": {"ip": "192.168.1.70"}, "location": "Rack Salotto"},
                {"id": "pc-workstation", "name": "PC Workstation", "kind": "client", "roles": [], "addresses": {"ip": "192.168.1.100"}, "location": "Studio"},
            ],
            "links": [
                {"id": "lnk-wan-router", "from_device_id": "wan-fiber", "to_device_id": "router-core", "medium": "wan"},
                {"id": "lnk-router-switch", "from_device_id": "router-core", "to_device_id": "switch-poe-24p", "medium": "ethernet", "from_port": "LAN1", "to_port": "P24"},
                {"id": "lnk-switch-ap1", "from_device_id": "switch-poe-24p", "to_device_id": "ap-livingroom", "medium": "poe", "poe": True, "from_port": "P1", "to_port": "Eth0"},
                {"id": "lnk-switch-ap2", "from_device_id": "switch-poe-24p", "to_device_id": "ap-studio", "medium": "poe", "poe": True, "from_port": "P2", "to_port": "Eth0"},
                {"id": "lnk-switch-nas", "from_device_id": "switch-poe-24p", "to_device_id": "nas-synology", "medium": "ethernet", "from_port": "P5", "to_port": "LAN1"},
                {"id": "lnk-switch-srv", "from_device_id": "switch-poe-24p", "to_device_id": "srv-proxmox", "medium": "ethernet", "from_port": "P6", "to_port": "eno1"},
                {"id": "lnk-switch-pc", "from_device_id": "switch-poe-24p", "to_device_id": "pc-workstation", "medium": "ethernet", "from_port": "P7", "to_port": "Eth0"},
                {"id": "lnk-ups-nas", "from_device_id": "ups-nut", "to_device_id": "nas-synology", "medium": "power"},
                {"id": "lnk-ups-srv", "from_device_id": "ups-nut", "to_device_id": "srv-proxmox", "medium": "power"},
                {"id": "lnk-srv-ha", "from_device_id": "srv-proxmox", "to_device_id": "home-assistant", "medium": "logical"},
            ],
        },
        {
            "id": "simple_home",
            "name": "Rete Domestica Semplice",
            "description": "Modem router Wi-Fi principale collegato a uno switch, con NAS, Access Point mesh e client.",
            "vantage_point_id": "nas-home",
            "devices": [
                {"id": "wan-modem", "name": "Linea Internet Fibra", "kind": "wan_gateway", "roles": ["wan_provider"], "addresses": {"ip": "192.168.1.1"}, "location": "Salotto"},
                {"id": "router-wifi", "name": "Modem Router Wi-Fi", "kind": "router", "roles": ["dhcp_server", "dns_resolver"], "addresses": {"ip": "192.168.1.1"}, "location": "Salotto"},
                {"id": "switch-lan", "name": "Switch Gigabit 8P", "kind": "switch", "roles": [], "addresses": {"ip": "192.168.1.2"}, "location": "Salotto"},
                {"id": "ap-mesh", "name": "Ripetitore Wi-Fi Mesh", "kind": "access_point", "roles": [], "addresses": {"ip": "192.168.1.15"}, "location": "Corridoio"},
                {"id": "nas-home", "name": "NAS Domestico", "kind": "nas", "roles": ["vantage_point"], "addresses": {"ip": "192.168.1.30"}, "location": "Studio"},
                {"id": "smart-tv", "name": "Smart TV 4K", "kind": "client", "roles": [], "addresses": {"ip": "192.168.1.80"}, "location": "Salotto"},
                {"id": "pc-desktop", "name": "PC Studio", "kind": "client", "roles": [], "addresses": {"ip": "192.168.1.101"}, "location": "Studio"},
            ],
            "links": [
                {"id": "lnk-wan-modem", "from_device_id": "wan-modem", "to_device_id": "router-wifi", "medium": "wan"},
                {"id": "lnk-router-switch", "from_device_id": "router-wifi", "to_device_id": "switch-lan", "medium": "ethernet"},
                {"id": "lnk-switch-ap", "from_device_id": "switch-lan", "to_device_id": "ap-mesh", "medium": "ethernet"},
                {"id": "lnk-switch-nas", "from_device_id": "switch-lan", "to_device_id": "nas-home", "medium": "ethernet"},
                {"id": "lnk-ap-tv", "from_device_id": "ap-mesh", "to_device_id": "smart-tv", "medium": "wifi"},
                {"id": "lnk-switch-pc", "from_device_id": "switch-lan", "to_device_id": "pc-desktop", "medium": "ethernet"},
            ],
        },
        {
            "id": "office",
            "name": "Piccolo Ufficio / Studio",
            "description": "Gateway di sicurezza, Switch PoE per AP e telecamere, Server backup protetto da UPS e stampante.",
            "vantage_point_id": "srv-storage",
            "devices": [
                {"id": "wan-fiber", "name": "Fibra Ottica Ufficio", "kind": "wan_gateway", "roles": ["wan_provider"], "addresses": {"ip": "10.0.0.1"}, "location": "Ingresso"},
                {"id": "router-security", "name": "Security Gateway UDM", "kind": "router", "roles": ["dhcp_server", "dns_resolver"], "addresses": {"ip": "10.0.0.254"}, "location": "Armadio Rack"},
                {"id": "switch-poe-16p", "name": "Switch PoE 16 Porte", "kind": "switch", "roles": [], "addresses": {"ip": "10.0.0.2"}, "location": "Armadio Rack"},
                {"id": "ups-office", "name": "UPS Gruppo Continuità", "kind": "ups", "roles": ["power_provider"], "addresses": {"ip": "10.0.0.15"}, "location": "Armadio Rack"},
                {"id": "ap-office", "name": "Access Point PoE Ufficio", "kind": "access_point", "roles": [], "addresses": {"ip": "10.0.0.20"}, "location": "Open Space"},
                {"id": "srv-storage", "name": "Server File & Backup", "kind": "nas", "roles": ["vantage_point"], "addresses": {"ip": "10.0.0.50"}, "location": "Armadio Rack"},
                {"id": "cam-entry", "name": "Telecamera PoE Ingresso", "kind": "client", "roles": [], "addresses": {"ip": "10.0.0.120"}, "location": "Ingresso"},
                {"id": "printer-net", "name": "Stampante di Rete", "kind": "client", "roles": [], "addresses": {"ip": "10.0.0.90"}, "location": "Open Space"},
            ],
            "links": [
                {"id": "lnk-wan-gw", "from_device_id": "wan-fiber", "to_device_id": "router-security", "medium": "wan"},
                {"id": "lnk-gw-sw", "from_device_id": "router-security", "to_device_id": "switch-poe-16p", "medium": "ethernet"},
                {"id": "lnk-sw-ap", "from_device_id": "switch-poe-16p", "to_device_id": "ap-office", "medium": "poe", "poe": True},
                {"id": "lnk-sw-cam", "from_device_id": "switch-poe-16p", "to_device_id": "cam-entry", "medium": "poe", "poe": True},
                {"id": "lnk-sw-srv", "from_device_id": "switch-poe-16p", "to_device_id": "srv-storage", "medium": "ethernet"},
                {"id": "lnk-sw-prt", "from_device_id": "switch-poe-16p", "to_device_id": "printer-net", "medium": "ethernet"},
                {"id": "lnk-ups-srv", "from_device_id": "ups-office", "to_device_id": "srv-storage", "medium": "power"},
            ],
        },
    ]

