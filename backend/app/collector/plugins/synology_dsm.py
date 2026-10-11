"""Synology DSM collector plugin for NetSentinel."""

import logging
from typing import Any

import httpx
from app.collector.base import (
    BaseCollector,
    CollectorEvent,
    CollectorObservation,
    CollectorResult,
    DiscoveredItem,
)

logger = logging.getLogger("netsentinel.collector.synology_dsm")


class SynologyDsmCollector(BaseCollector):
    """Collector for Synology DSM NAS (storage pools, S.M.A.R.T., CPU/RAM, system services)."""

    name = "synology_dsm"
    description = "Raccoglie stato salute volumi RAID, dischi, CPU, memoria e servizi attivi su Synology DSM"
    capabilities = ["system_status", "storage_status", "services", "discovery"]

    async def collect(
        self,
        target_address: str | None,
        params: dict[str, Any],
        timeout_seconds: float = 5.0,
    ) -> CollectorResult:
        result = CollectorResult()
        dsm_url = params.get("dsm_url", f"https://{target_address}:5001" if target_address else "")
        username = params.get("username", "")
        password = params.get("password", "")
        otp_code = params.get("otp_code", "")
        verify_ssl = params.get("verify_ssl", False)

        if not dsm_url:
            result.observations.append(
                CollectorObservation(
                    status="unknown",
                    details={"error": "Nessun indirizzo DSM o URL specificato."},
                )
            )
            return result

        try:
            async with httpx.AsyncClient(verify=verify_ssl, timeout=timeout_seconds) as client:
                # Login if credentials provided
                sid = params.get("sid", "")
                if not sid and username and password:
                    login_url = f"{dsm_url.rstrip('/')}/webapi/auth.cgi"
                    login_params = {
                        "api": "SYNO.API.Auth",
                        "version": "6",
                        "method": "login",
                        "account": username,
                        "passwd": password,
                        "session": "NetSentinel",
                        "format": "sid",
                    }
                    if otp_code:
                        login_params["otp_code"] = otp_code

                    r_login = await client.get(login_url, params=login_params)
                    if r_login.status_code == 200 and r_login.json().get("success"):
                        sid = r_login.json()["data"]["sid"]
                    else:
                        result.observations.append(
                            CollectorObservation(
                                status="crit",
                                details={"error": "Autenticazione a Synology DSM fallita."},
                            )
                        )
                        return result

                # Query System Status
                sys_url = f"{dsm_url.rstrip('/')}/webapi/entry.cgi"
                sys_params = {
                    "api": "SYNO.Core.System.Status",
                    "version": "1",
                    "method": "get",
                    "_sid": sid,
                }
                r_sys = await client.get(sys_url, params=sys_params)
                sys_data = r_sys.json() if r_sys.status_code == 200 and r_sys.json().get("success") else {}

                # Query Storage info
                storage_params = {
                    "api": "SYNO.Storage.CGI.Storage",
                    "version": "1",
                    "method": "load_info",
                    "_sid": sid,
                }
                r_storage = await client.get(sys_url, params=storage_params)
                storage_data = r_storage.json() if r_storage.status_code == 200 and r_storage.json().get("success") else {}

                # Evaluate volume health
                volumes = storage_data.get("data", {}).get("volumes", [])
                pools = storage_data.get("data", {}).get("storagePools", [])
                disks = storage_data.get("data", {}).get("disks", [])

                has_crashed = False
                has_degraded = False
                degraded_reason = ""

                for p in pools:
                    status = p.get("status", "normal").lower()
                    if status in ["crashed", "danger"]:
                        has_crashed = True
                        degraded_reason = f"Pool {p.get('name')} in stato {status}"
                    elif status in ["degraded", "warning", "attention"]:
                        has_degraded = True
                        degraded_reason = f"Pool {p.get('name')} in stato {status}"

                for v in volumes:
                    v_status = v.get("status", "normal").lower()
                    if v_status in ["crashed", "read_only"]:
                        has_crashed = True
                        degraded_reason = f"Volume {v.get('name')} in stato {v_status}"
                    elif v_status in ["degraded", "warning"]:
                        has_degraded = True
                        degraded_reason = f"Volume {v.get('name')} in stato {v_status}"

                # Disks S.M.A.R.T. check
                smart_errors = []
                for d in disks:
                    d_status = d.get("status", "normal").lower()
                    smart_status = d.get("smart_status", "normal").lower()
                    if d_status not in ["normal", "initialized"] or smart_status not in ["normal", "safe"]:
                        smart_errors.append(f"Disco {d.get('name')}: {d_status} (S.M.A.R.T.: {smart_status})")

                obs_status = "ok"
                if has_crashed:
                    obs_status = "crit"
                elif has_degraded or smart_errors:
                    obs_status = "warn"

                details = {
                    "model": sys_data.get("data", {}).get("model", "Synology NAS"),
                    "dsm_version": sys_data.get("data", {}).get("version_details", {}).get("smallupdate", ""),
                    "temperature": sys_data.get("data", {}).get("temperature", 0),
                    "storage_healthy": not (has_crashed or has_degraded),
                    "pools_count": len(pools),
                    "volumes_count": len(volumes),
                    "smart_errors": smart_errors,
                }
                if degraded_reason:
                    details["degraded_reason"] = degraded_reason

                result.observations.append(
                    CollectorObservation(
                        status=obs_status,
                        value=float(details["temperature"]),
                        details=details,
                    )
                )

                if has_degraded or smart_errors:
                    result.events.append(
                        CollectorEvent(
                            event_type="storage_degraded",
                            severity="warn" if not has_crashed else "crit",
                            title="Degrado Storage Synology NAS",
                            message=degraded_reason or "; ".join(smart_errors),
                            details=details,
                        )
                    )

        except httpx.TimeoutException:
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Timeout connessione al NAS Synology ({timeout_seconds}s)."},
                )
            )
        except Exception as exc:
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Errore comunicazione Synology DSM: {str(exc)}"},
                )
            )

        return result

    async def discover(self, params: dict[str, Any]) -> list[DiscoveredItem]:
        """Discover volumes and services hosted on Synology NAS."""
        items: list[DiscoveredItem] = []
        dsm_url = params.get("dsm_url", "")
        if not dsm_url:
            return items

        items.append(
            DiscoveredItem(
                id="synology-nas",
                name="Synology NAS",
                kind="nas",
                suggested_checks=[
                    {"type": "synology_dsm", "name": "Salute Sistema & Storage", "params": {"dsm_url": dsm_url}},
                    {"type": "ping", "name": "Ping NAS", "params": {}},
                ],
            )
        )
        return items
