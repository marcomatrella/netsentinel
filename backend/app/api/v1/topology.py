"""Topology and Canvas Layout API endpoints."""

import json
from typing import Any

from app.api.v1.devices import _to_device_read
from app.config import settings
from app.db.models import CanvasLayout, ConfigVersion, Dependency, Device, Link, utcnow
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
from sqlalchemy import select
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


@router.get("", response_model=TopologyFullResponse, summary="Ottieni la topologia completa e il layout della tela")
async def get_full_topology(db: AsyncSession = Depends(get_db)) -> TopologyFullResponse:
    """Retrieve all devices, links, dependencies, and persisted canvas layout."""
    dev_res = await db.execute(select(Device).options(selectinload(Device.interfaces)))
    devices = [_to_device_read(d) for d in dev_res.scalars().all()]

    link_res = await db.execute(select(Link))
    links = [
        LinkRead(
            id=lnk.id,
            from_device_id=lnk.from_device_id,
            from_port=lnk.from_port,
            to_device_id=lnk.to_device_id,
            to_port=lnk.to_port,
            medium=lnk.medium,
            poe=lnk.poe,
            cable_notes=lnk.cable_notes,
            status=lnk.status,
            status_source=lnk.status_source,
            throughput_bps=lnk.throughput_bps,
            updated_at=lnk.updated_at,
        )
        for lnk in link_res.scalars().all()
    ]

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
    """Apply updated devices, links, dependencies and canvas layout, recording a rollback snapshot."""
    # 1. Update devices
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
