"""Incidents REST API endpoints."""

import json
from datetime import datetime

from app.db.models import Incident, to_utc_iso, utcnow
from app.db.session import get_db
from app.schemas.entities import (
    IncidentAcknowledge,
    IncidentEvidence,
    IncidentHypothesis,
    IncidentRead,
    IncidentTimelineItem,
)
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/incidents", tags=["Incidents"])


def _to_incident_read(inc: Incident) -> IncidentRead:
    """Convert Incident DB model to Pydantic IncidentRead."""
    evidence_raw = json.loads(inc.evidence_json) if inc.evidence_json else []
    impacted_raw = json.loads(inc.impacted_json) if inc.impacted_json else []
    timeline_raw = json.loads(inc.timeline_json) if inc.timeline_json else []
    recommendations_raw = json.loads(inc.recommendations_json) if inc.recommendations_json else []
    hypotheses_raw = json.loads(inc.alternative_hypotheses_json) if inc.alternative_hypotheses_json else []

    evidence = [
        IncidentEvidence(
            check_id=e.get("check_id"),
            device_id=e.get("device_id"),
            status=e.get("status", "unknown"),
            ts=datetime.fromisoformat(e["ts"]) if "ts" in e else utcnow(),
            message=e.get("message", ""),
            positive=e.get("positive", True),
        )
        for e in evidence_raw
    ]

    timeline = [
        IncidentTimelineItem(
            ts=datetime.fromisoformat(t["ts"]) if "ts" in t else utcnow(),
            event_type=t.get("event_type", "event"),
            message=t.get("message", ""),
            device_id=t.get("device_id"),
        )
        for t in timeline_raw
    ]

    hypotheses = [
        IncidentHypothesis(
            category=h.get("category", "unknown"),
            description=h.get("description", ""),
            confidence=float(h.get("confidence", 0.0)),
            missing_evidence=h.get("missing_evidence", []),
            suggested_checks=h.get("suggested_checks", []),
        )
        for h in hypotheses_raw
    ]

    return IncidentRead(
        id=inc.id,
        status=inc.status,
        started_at=inc.started_at,
        resolved_at=inc.resolved_at,
        root_cause_device_id=inc.root_cause_device_id,
        root_cause_category=inc.root_cause_category,
        confidence=inc.confidence,
        summary=inc.summary,
        evidence=evidence,
        impacted=impacted_raw,
        timeline=timeline,
        recommendations=recommendations_raw,
        alternative_hypotheses=hypotheses,
        acknowledged_by=inc.acknowledged_by,
        acknowledged_at=inc.acknowledged_at,
    )


@router.get("", response_model=list[IncidentRead], summary="Elenco degli incidenti")
async def list_incidents(
    status_filter: str | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
) -> list[IncidentRead]:
    """Retrieve incidents optionally filtered by status (open, monitoring, resolved)."""
    stmt = select(Incident).order_by(desc(Incident.started_at)).limit(min(limit, 200))
    if status_filter:
        stmt = stmt.where(Incident.status == status_filter)

    res = await db.execute(stmt)
    incidents = res.scalars().all()
    return [_to_incident_read(inc) for inc in incidents]


@router.get("/{incident_id}", response_model=IncidentRead, summary="Dettaglio singolo incidente")
async def get_incident(incident_id: str, db: AsyncSession = Depends(get_db)) -> IncidentRead:
    """Retrieve full details, evidence and recommendations for an incident."""
    inc = await db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incidente non trovato.")
    return _to_incident_read(inc)


@router.post("/{incident_id}/acknowledge", response_model=IncidentRead, summary="Riconosci incidente (Acknowledge)")
async def acknowledge_incident(
    incident_id: str,
    payload: IncidentAcknowledge,
    db: AsyncSession = Depends(get_db),
) -> IncidentRead:
    """Acknowledge an incident, recording username and timestamp."""
    inc = await db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incidente non trovato.")

    inc.acknowledged_by = payload.acknowledged_by
    inc.acknowledged_at = utcnow()
    if inc.status == "open":
        inc.status = "monitoring"

    timeline = json.loads(inc.timeline_json) if inc.timeline_json else []
    timeline.append({
        "ts": to_utc_iso(utcnow()),
        "event_type": "incident_acknowledged",
        "message": f"Incidente preso in carico da '{payload.acknowledged_by}'.",
    })
    inc.timeline_json = json.dumps(timeline)

    await db.commit()
    await db.refresh(inc)
    return _to_incident_read(inc)
