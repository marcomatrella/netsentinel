"""Dry-run network failure simulation API (Section 4.1 step 7)."""

import json

from app.config import settings
from app.correlation.rules.rule_evaluator import RuleEvaluator
from app.db.models import Dependency, Device, Link, NotificationChannel
from app.db.session import get_db
from app.topology.graph import TopologyGraph
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/simulate", tags=["Simulation"])


class SimulationRequest(BaseModel):
    failed_device_ids: list[str] = Field(default_factory=list)
    failed_link_ids: list[str] = Field(default_factory=list)


class SimulatedNotification(BaseModel):
    channel_name: str
    channel_type: str
    recipient: str
    subject: str
    body_preview: str


class SimulationResponse(BaseModel):
    root_cause_device_id: str | None
    root_cause_category: str
    confidence: float
    diagnosis_title: str
    diagnosis_summary: str
    recommendations: list[str] = Field(default_factory=list)
    impacted_devices: list[str] = Field(default_factory=list)
    symptoms: dict[str, str] = Field(
        default_factory=dict
    )  # device_id -> 'unreachable' | 'affected'
    fault_path: list[str] = Field(default_factory=list)
    simulated_notifications: list[SimulatedNotification] = Field(default_factory=list)


@router.post(
    "/failure", response_model=SimulationResponse, summary="Simula guasto in modalità Dry-Run"
)
async def simulate_failure(
    payload: SimulationRequest,
    db: AsyncSession = Depends(get_db),
) -> SimulationResponse:
    """Simulate device or link failure on canvas without mutating live DB or sending notifications."""
    # 1. Fetch current topology
    dev_res = await db.execute(select(Device))
    devices = list(dev_res.scalars().all())

    link_res = await db.execute(select(Link))
    links = list(link_res.scalars().all())

    dep_res = await db.execute(select(Dependency))
    dependencies = list(dep_res.scalars().all())

    chan_res = await db.execute(
        select(NotificationChannel).where(NotificationChannel.enabled.is_(True))
    )
    channels = list(chan_res.scalars().all())

    # Build topology graph
    vp_id = None
    for d in devices:
        roles = json.loads(d.roles_json) if d.roles_json else []
        if "vantage_point" in roles:
            vp_id = d.id
            break
    if not vp_id:
        vp_id = settings.vantage_point_id
    if vp_id:
        settings.vantage_point_id = vp_id

    topo = TopologyGraph(vantage_point_id=vp_id)
    topo.load_from_db_entities(devices, links, dependencies, vantage_point_id=vp_id)

    # 2. Apply simulated failures in-memory
    simulated_down = set(payload.failed_device_ids)

    # If a link failed, mark the farther device down
    for link_id in payload.failed_link_ids:
        lnk = next((item for item in links if item.id == link_id), None)
        if lnk:
            d_from = topo.get_distance_from_vantage_point(lnk.from_device_id)
            d_to = topo.get_distance_from_vantage_point(lnk.to_device_id)
            target = lnk.to_device_id if d_to > d_from else lnk.from_device_id
            simulated_down.add(target)

    if not simulated_down:
        return SimulationResponse(
            root_cause_device_id=None,
            root_cause_category="none",
            confidence=1.0,
            diagnosis_title="Rete in stato nominale",
            diagnosis_summary="Nessun guasto simulato attivo. Tutti i nodi sono operativi.",
            recommendations=[
                "Seleziona uno o più apparati o link sulla tela per simulare un guasto."
            ],
            impacted_devices=[],
            symptoms={},
            fault_path=[],
            simulated_notifications=[],
        )

    # 3. Determine root cause candidate vs symptoms
    candidates: list[str] = []
    symptoms: dict[str, str] = {}

    for dev_id in simulated_down:
        providers = topo.get_upstream_providers(dev_id)
        down_providers = [p for p in providers if p in simulated_down]
        if down_providers:
            symptoms[dev_id] = "unreachable"
        else:
            candidates.append(dev_id)

    if not candidates and simulated_down:
        candidates = list(simulated_down)[:1]

    root_cause_id = candidates[0] if candidates else None
    root_dev = topo.get_device(root_cause_id) if root_cause_id else None

    # Compute all downstream impacted devices
    downstream_impacted = (
        list(topo.get_all_downstream_impacted(root_cause_id)) if root_cause_id else []
    )
    for d_imp in downstream_impacted:
        symptoms[d_imp] = "unreachable"

    all_impacted = list(set(([root_cause_id] if root_cause_id else []) + downstream_impacted))

    # Fault path from vantage point
    fault_path = topo.get_path_from_vantage_point(root_cause_id) if root_cause_id else []

    # 4. Evaluate diagnosis
    evaluator = RuleEvaluator()
    diag = evaluator.evaluate_candidate(
        candidate_device=root_dev
        if root_dev
        else Device(id="unknown", name="Sconosciuto", kind="custom"),
        evidences=[],
        downstream_impacted_count=len(all_impacted),
    )

    # 5. Build would-be notification previews
    simulated_notifs = []
    subject = f"[{'CRITICO' if diag.confidence >= 0.9 else 'AVVISO'}] {diag.title}"
    body = (
        f"NetSentinel Simulation Preview:\n\nCausa radice: {root_dev.name if root_dev else 'N/A'}\nConfidenza: {diag.confidence * 100}%\nApparati impattati: {len(all_impacted)}\n\nAzioni consigliate:\n"
        + "\n".join(f"- {r}" for r in diag.recommendations)
    )

    for ch in channels:
        simulated_notifs.append(
            SimulatedNotification(
                channel_name=ch.name,
                channel_type=ch.type,
                recipient=ch.name,
                subject=subject,
                body_preview=body,
            )
        )

    return SimulationResponse(
        root_cause_device_id=root_cause_id,
        root_cause_category=diag.category,
        confidence=diag.confidence,
        diagnosis_title=diag.title,
        diagnosis_summary=diag.summary,
        recommendations=diag.recommendations,
        impacted_devices=all_impacted,
        symptoms=symptoms,
        fault_path=fault_path,
        simulated_notifications=simulated_notifs,
    )
