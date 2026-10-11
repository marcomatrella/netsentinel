"""Home Assistant collector plugin for NetSentinel."""

import logging
from typing import Any

import httpx
from app.collector.base import (
    BaseCollector,
    CollectorObservation,
    CollectorResult,
    DiscoveredItem,
)

logger = logging.getLogger("netsentinel.collector.home_assistant")


class HomeAssistantCollector(BaseCollector):
    """Collector for Home Assistant entities (smart plugs, sensors, Zigbee/Z-Wave coordinators)."""

    name = "home_assistant"
    description = "Interroga lo stato di entità, sensori di potenza e smart plug da Home Assistant REST API"
    capabilities = ["entity_status", "power_metrics", "discovery"]

    async def collect(
        self,
        target_address: str | None,
        params: dict[str, Any],
        timeout_seconds: float = 5.0,
    ) -> CollectorResult:
        result = CollectorResult()
        base_url = params.get("ha_url", f"http://{target_address}:8123" if target_address else "")
        token = params.get("access_token", "")
        entity_id = params.get("entity_id", "")

        if not base_url:
            result.observations.append(
                CollectorObservation(
                    status="unknown",
                    details={"error": "Nessun URL Home Assistant specificato."},
                )
            )
            return result

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(headers=headers, timeout=timeout_seconds) as client:
                endpoint = f"{base_url.rstrip('/')}/api/states/{entity_id}" if entity_id else f"{base_url.rstrip('/')}/api/"
                resp = await client.get(endpoint)

                if resp.status_code == 401:
                    result.observations.append(
                        CollectorObservation(
                            status="crit",
                            details={"error": "Token di accesso Home Assistant non valido (401 Unauthorized)."},
                        )
                    )
                    return result

                if resp.status_code != 200:
                    result.observations.append(
                        CollectorObservation(
                            status="crit",
                            details={"error": f"Home Assistant ha risposto con HTTP {resp.status_code}"},
                        )
                    )
                    return result

                data = resp.json()
                if entity_id:
                    state = str(data.get("state", "unknown")).lower()
                    attributes = data.get("attributes", {})
                    friendly_name = attributes.get("friendly_name", entity_id)

                    obs_status = "ok"
                    if state in ["unavailable", "unknown"]:
                        obs_status = "crit"
                    elif state in ["off", "dead"]:
                        obs_status = "warn"

                    # Numeric value if available (e.g. Watts or percentage)
                    val = None
                    try:
                        val = float(state)
                    except ValueError:
                        pass

                    result.observations.append(
                        CollectorObservation(
                            status=obs_status,
                            value=val,
                            details={
                                "entity_id": entity_id,
                                "friendly_name": friendly_name,
                                "state": state,
                                "attributes": attributes,
                            },
                        )
                    )
                else:
                    # General API alive check
                    msg = data.get("message", "API running.")
                    result.observations.append(
                        CollectorObservation(
                            status="ok",
                            value=1.0,
                            details={"message": msg, "ha_url": base_url},
                        )
                    )

        except httpx.TimeoutException:
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Timeout connessione a Home Assistant ({timeout_seconds}s)."},
                )
            )
        except Exception as exc:
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Errore comunicazione Home Assistant: {str(exc)}"},
                )
            )

        return result

    async def discover(self, params: dict[str, Any]) -> list[DiscoveredItem]:
        """Discover smart plugs and coordinator devices from Home Assistant."""
        items: list[DiscoveredItem] = []
        base_url = params.get("ha_url", "")
        token = params.get("access_token", "")
        if not base_url or not token:
            return items

        try:
            headers = {"Authorization": f"Bearer {token}"}
            async with httpx.AsyncClient(headers=headers, timeout=5.0) as client:
                r = await client.get(f"{base_url.rstrip('/')}/api/states")
                if r.status_code == 200:
                    states = r.json()
                    for s in states:
                        eid = s.get("entity_id", "")
                        if eid.startswith("switch.") or eid.startswith("sensor.") and "power" in eid:
                            attrs = s.get("attributes", {})
                            name = attrs.get("friendly_name", eid)
                            items.append(
                                DiscoveredItem(
                                    id=f"ha-{eid.replace('.', '-')}",
                                    name=f"Presa/Sensore: {name}",
                                    kind="custom",
                                    suggested_checks=[
                                        {
                                            "type": "home_assistant",
                                            "name": f"Stato {name}",
                                            "params": {"ha_url": base_url, "access_token": token, "entity_id": eid},
                                        }
                                    ],
                                )
                            )
        except Exception:
            pass

        return items
