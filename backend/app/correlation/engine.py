"""Root-cause correlation engine implementing Algorithm 6.3."""

import json
import logging
from typing import Any

from app.correlation.incident_manager import incident_manager
from app.correlation.rules.rule_evaluator import RuleEvaluator
from app.db.models import Dependency, Device, Incident, Link, to_utc_iso, utcnow
from app.topology.graph import TopologyGraph
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("netsentinel.correlation.engine")


class CorrelationEngine:
    """Evaluates topology dependencies and isolates root cause incidents."""

    def __init__(self, rule_evaluator: RuleEvaluator | None = None) -> None:
        self.rule_evaluator = rule_evaluator or RuleEvaluator()
        self.topology = TopologyGraph()

    async def run_correlation_cycle(self, session: AsyncSession) -> list[Incident]:
        """Execute one full correlation evaluation cycle."""
        # 1. Load entities
        dev_res = await session.execute(select(Device))
        devices = list(dev_res.scalars().all())

        link_res = await session.execute(select(Link))
        links = list(link_res.scalars().all())

        dep_res = await session.execute(select(Dependency))
        dependencies = list(dep_res.scalars().all())

        # Determine vantage point
        vp_id = None
        for d in devices:
            roles = json.loads(d.roles_json) if d.roles_json else []
            if "vantage_point" in roles:
                vp_id = d.id
                break

        self.topology.load_from_db_entities(devices, links, dependencies, vantage_point_id=vp_id)

        # 2. Identify unhealthy devices
        dev_map = {d.id: d for d in devices}
        unhealthy_statuses = {"down", "flapping", "degraded", "unknown"}
        unhealthy_nodes = [d for d in devices if d.status in unhealthy_statuses]

        if not unhealthy_nodes:
            # Check if any active incidents need to be resolved
            active_stmt = select(Incident).where(Incident.status.in_(["open", "monitoring"]))
            active_res = await session.execute(active_stmt)
            open_incs = active_res.scalars().all()
            for inc in open_incs:
                await incident_manager.resolve_incident(session, inc.id)
            return []

        # 3. Check for Vantage Point Isolation (Rule 11)
        # If vantage point is configured and cannot reach its own switch/gateway
        is_vp_isolated = False
        if vp_id and vp_id in dev_map:
            vp_providers = self.topology.get_upstream_providers(vp_id)
            if vp_providers and all(dev_map[p].status in ["down", "unknown"] for p in vp_providers if p in dev_map):
                is_vp_isolated = True

        # 4. Root cause candidate isolation
        candidates: list[Device] = []
        symptoms: dict[str, str] = {}  # device_id -> symptom_type ("unreachable" or "affected")

        unhealthy_ids = {d.id for d in unhealthy_nodes}

        def is_passive(d: Device) -> bool:
            if d.kind in ["client", "smart_plug", "sensor"]:
                return True
            r = json.loads(d.roles_json) if d.roles_json else []
            return "passive_tracking" in r

        for dev in unhealthy_nodes:
            # Passive clients/devices are only tracked inventory, not monitored infrastructure
            if is_passive(dev):
                continue

            # Look for unhealthy upstream providers
            providers = self.topology.get_upstream_providers(dev.id)
            unhealthy_providers = [p for p in providers if p in unhealthy_ids]

            if unhealthy_providers:
                # Upstream failure found -> this node is a symptom!
                # If dependency kind is power or service -> "affected", else "unreachable"
                dep_kinds = [
                    self.topology.dep_graph.edges[dev.id, p].get("kind", "l2_path")
                    for p in unhealthy_providers
                    if (dev.id, p) in self.topology.dep_graph.edges
                ]
                symptom_type = "affected" if any(k in ["power", "service"] for k in dep_kinds) else "unreachable"
                symptoms[dev.id] = symptom_type

                # Update device status to reflect honesty on knowledge (symptom, not primary DOWN)
                if dev.status != symptom_type:
                    dev.status = symptom_type
                    dev.status_since = utcnow()
            else:
                # No unhealthy upstream provider -> candidate root cause!
                candidates.append(dev)

        if not candidates and unhealthy_nodes:
            # Cycle or mutual dependency: select non-passive node closest to vantage point
            non_passive_unhealthy = [d for d in unhealthy_nodes if not is_passive(d)]
            if non_passive_unhealthy:
                candidates = sorted(
                    non_passive_unhealthy,
                    key=lambda d: self.topology.get_distance_from_vantage_point(d.id),
                )[:1]

        # 5. Build/Update Incidents for each candidate (skip candidates under planned maintenance)
        from app.state.maintenance import maintenance_tracker

        resulting_incidents: list[Incident] = []

        for candidate in candidates:
            # If the candidate device itself is under planned maintenance, suppress alert generation!
            is_maint, maint_win = await maintenance_tracker.is_device_in_maintenance(session, candidate.id)
            if is_maint:
                logger.info(
                    "⏸️ [MANUTENZIONE ATTIVA] Soppressione generazione incidente per '%s' (Slot: %s)",
                    candidate.name,
                    maint_win.title if maint_win else "Manutenzione globale",
                )
                continue

            # Gathers all downstream impacted devices
            impacted = list(self.topology.get_all_downstream_impacted(candidate.id))

            # Collect positive and negative evidence
            evidence: list[dict[str, Any]] = [
                {
                    "device_id": candidate.id,
                    "status": candidate.status,
                    "ts": to_utc_iso(candidate.status_since),
                    "message": f"Apparato '{candidate.name}' in stato {candidate.status.upper()}.",
                    "positive": True,
                }
            ]

            # Neighbor evidence: check if parent/neighbors are UP (positive evidence supporting candidate)
            parents = self.topology.get_upstream_providers(candidate.id)
            for p_id in parents:
                if p_id in dev_map and dev_map[p_id].status == "ok":
                    evidence.append({
                        "device_id": p_id,
                        "status": "ok",
                        "ts": to_utc_iso(dev_map[p_id].status_since),
                        "message": f"Il nodo a monte '{dev_map[p_id].name}' è regolarmente attivo (esclude guasto a monte).",
                        "positive": True,
                    })

            # Evaluate diagnostic rule
            diag = self.rule_evaluator.evaluate_candidate(
                candidate_device=candidate,
                evidences=evidence,
                downstream_impacted_count=len(impacted),
                is_vantage_point_isolated=is_vp_isolated,
            )

            # Create or update incident
            all_impacted_ids = list(set([candidate.id] + impacted))
            inc = await incident_manager.create_or_update_incident(
                session=session,
                root_cause_device_id=candidate.id,
                root_cause_category=diag.category,
                confidence=diag.confidence,
                summary=diag.title + " — " + diag.summary,
                evidence=evidence,
                impacted=all_impacted_ids,
                recommendations=diag.recommendations,
                alternative_hypotheses=diag.alternative_hypotheses,
            )
            resulting_incidents.append(inc)

        # 6. Automatically resolve any active incidents that are no longer candidates
        resulting_candidate_ids = {c.id for c in candidates}
        active_stmt = select(Incident).where(Incident.status.in_(["open", "monitoring"]))
        active_res = await session.execute(active_stmt)
        for open_inc in active_res.scalars().all():
            if open_inc.root_cause_device_id not in resulting_candidate_ids:
                logger.info(
                    "✅ [AUTO-RESOLVE] Risoluzione automatica incidente %s: root cause %s non è più guasta o rimossa.",
                    open_inc.id,
                    open_inc.root_cause_device_id,
                )
                await incident_manager.resolve_incident(session, open_inc.id)

        await session.commit()
        return resulting_incidents


# Singleton correlation engine
correlation_engine = CorrelationEngine()
