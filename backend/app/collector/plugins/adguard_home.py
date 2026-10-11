"""AdGuard Home collector plugin for NetSentinel."""

import logging
from typing import Any

import httpx
from app.collector.base import (
    BaseCollector,
    CollectorObservation,
    CollectorResult,
    DiscoveredItem,
)

logger = logging.getLogger("netsentinel.collector.adguard_home")


class AdGuardHomeCollector(BaseCollector):
    """Collector for AdGuard Home DNS sinkhole and filtering statistics."""

    name = "adguard_home"
    description = "Interroga le statistiche di risoluzione DNS, filtri attivi e latenza upstream di AdGuard Home"
    capabilities = ["dns_health", "query_stats", "upstream_latency", "discovery"]

    async def collect(
        self,
        target_address: str | None,
        params: dict[str, Any],
        timeout_seconds: float = 5.0,
    ) -> CollectorResult:
        result = CollectorResult()
        base_url = params.get("adguard_url", f"http://{target_address}:3000" if target_address else "")
        username = params.get("username", "")
        password = params.get("password", "")

        if not base_url:
            result.observations.append(
                CollectorObservation(
                    status="unknown",
                    details={"error": "Nessun URL per AdGuard Home specificato."},
                )
            )
            return result

        auth = (username, password) if username and password else None

        try:
            async with httpx.AsyncClient(auth=auth, timeout=timeout_seconds) as client:
                # Query status
                r_status = await client.get(f"{base_url.rstrip('/')}/control/status")
                if r_status.status_code != 200:
                    result.observations.append(
                        CollectorObservation(
                            status="crit",
                            details={"error": f"AdGuard Home status ha restituito HTTP {r_status.status_code}"},
                        )
                    )
                    return result

                status_data = r_status.json()
                protection_enabled = status_data.get("protection_enabled", True)
                dns_addresses = status_data.get("dns_addresses", [])

                # Query stats
                r_stats = await client.get(f"{base_url.rstrip('/')}/control/stats")
                stats_data = r_stats.json() if r_stats.status_code == 200 else {}

                num_queries = stats_data.get("num_dns_queries", 0)
                num_blocked = stats_data.get("num_blocked_filtering", 0)
                avg_processing_time = stats_data.get("avg_processing_time", 0.0)

                obs_status = "ok"
                if not protection_enabled:
                    obs_status = "warn"
                elif avg_processing_time > 0.15:  # > 150ms
                    obs_status = "warn"

                details = {
                    "protection_enabled": protection_enabled,
                    "num_dns_queries": num_queries,
                    "num_blocked_filtering": num_blocked,
                    "avg_processing_time_ms": round(avg_processing_time * 1000, 2),
                    "dns_addresses": dns_addresses,
                    "version": status_data.get("version", ""),
                }

                result.observations.append(
                    CollectorObservation(
                        status=obs_status,
                        value=round(avg_processing_time * 1000, 2),
                        details=details,
                    )
                )

        except httpx.TimeoutException:
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Timeout connessione ad AdGuard Home ({timeout_seconds}s)."},
                )
            )
        except Exception as exc:
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Errore comunicazione AdGuard Home: {str(exc)}"},
                )
            )

        return result

    async def discover(self, params: dict[str, Any]) -> list[DiscoveredItem]:
        """Discover AdGuard Home service."""
        items: list[DiscoveredItem] = []
        base_url = params.get("adguard_url", "")
        if not base_url:
            return items

        items.append(
            DiscoveredItem(
                id="adguard-home",
                name="AdGuard Home DNS",
                kind="service",
                suggested_checks=[
                    {"type": "adguard_home", "name": "Statistiche DNS AdGuard", "params": {"adguard_url": base_url}},
                    {"type": "dns", "name": "Risoluzione DNS locale", "params": {"query_name": "google.com"}},
                ],
            )
        )
        return items
