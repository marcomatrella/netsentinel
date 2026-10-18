"""pfSense Firewall & Router collector plugin for NetSentinel."""

import hashlib
import logging
import time
from typing import Any

import httpx
from app.collector.base import (
    BaseCollector,
    CollectorObservation,
    CollectorResult,
)

logger = logging.getLogger("netsentinel.collector.pfsense")


class PfSenseCollector(BaseCollector):
    """Collector for pfSense firewalls via FauxAPI, REST API plugin, or status endpoints."""

    name = "pfsense"
    description = "Interroga pfSense per lease DHCP attivi, tabella ARP e dispositivi di rete connessi"
    capabilities = ["device_status", "connected_clients", "dhcp_leases", "arp_table"]

    async def collect(
        self,
        target_address: str | None,
        params: dict[str, Any],
        timeout_seconds: float = 6.0,
    ) -> CollectorResult:
        result = CollectorResult()
        base_url = (params.get("url") or (f"https://{target_address}" if target_address else "")).strip().rstrip("/")
        api_key = (params.get("api_key") or "").strip()
        api_secret = (params.get("api_secret") or "").strip()
        username = (params.get("username") or "").strip()
        password = (params.get("password") or "").strip()
        verify_ssl = bool(params.get("verify_ssl", False))

        if not base_url:
            result.observations.append(
                CollectorObservation(
                    status="unknown",
                    details={"error": "Nessun indirizzo IP o URL specificato per pfSense."},
                )
            )
            return result

        if not base_url.startswith("http://") and not base_url.startswith("https://"):
            base_url = f"https://{base_url}"

        connected_clients: list[dict[str, Any]] = []

        try:
            headers = {}
            # Check if FauxAPI credentials provided
            if api_key and api_secret:
                ts = time.strftime("%Y%m%dZ%H%M%S")
                nonce = "12345678"
                auth_str = f"{api_secret}{ts}{nonce}"
                hashed = hashlib.sha256(auth_str.encode("utf-8")).hexdigest()
                headers["fauxapi-auth"] = f"{api_key}:{ts}:{nonce}:{hashed}"

            auth = (username, password) if (username and password and not api_key) else None

            async with httpx.AsyncClient(verify=verify_ssl, timeout=timeout_seconds, auth=auth, headers=headers) as client:
                # 1. Try pfSense REST API package (/api/v1/diagnostics/arp & /api/v1/services/dhcpd/lease)
                endpoints_to_try = [
                    f"{base_url}/api/v1/diagnostics/arp",
                    f"{base_url}/api/v1/services/dhcpd/lease",
                    f"{base_url}/fauxapi/v1/?action=system_stats",
                ]

                for ep in endpoints_to_try:
                    try:
                        r = await client.get(ep)
                        if r.status_code == 200:
                            data = r.json()
                            items = data.get("data") if isinstance(data, dict) else data
                            if isinstance(items, list):
                                for item in items:
                                    ip = (item.get("ip") or item.get("address") or "").strip()
                                    mac = (item.get("mac") or item.get("mac-address") or "").strip().lower()
                                    hostname = (item.get("hostname") or item.get("host-name") or "").strip()
                                    if mac and ip and not mac.startswith("ff:ff"):
                                        connected_clients.append({
                                            "ip": ip,
                                            "mac": mac,
                                            "name": hostname or ip or mac,
                                            "hostname": hostname,
                                            "is_wired": True,
                                            "interface": item.get("interface", "LAN"),
                                        })
                    except Exception:
                        pass

                # If FauxAPI returns config / leases
                if not connected_clients and api_key and api_secret:
                    try:
                        r_faux = await client.get(f"{base_url}/fauxapi/v1/?action=gateway_status")
                        if r_faux.status_code == 200:
                            # FauxAPI works, query DHCP status via function_call
                            r_leases = await client.post(
                                f"{base_url}/fauxapi/v1/?action=function_call",
                                json={"function": "system_get_dhcpleases"},
                            )
                            if r_leases.status_code == 200:
                                l_data = r_leases.json().get("data", {}).get("return", [])
                                for lease in l_data:
                                    ip = (lease.get("ip") or "").strip()
                                    mac = (lease.get("mac") or "").strip().lower()
                                    name = (lease.get("hostname") or "").strip()
                                    if mac and ip:
                                        connected_clients.append({
                                            "ip": ip,
                                            "mac": mac,
                                            "name": name or ip or mac,
                                            "hostname": name,
                                            "is_wired": True,
                                        })
                    except Exception:
                        pass

            details = {
                "model": "pfSense Firewall",
                "clients_count": len(connected_clients),
                "connected_clients": connected_clients,
                "message": f"pfSense: {len(connected_clients)} client attivi rilevati via API/FauxAPI.",
            }

            result.observations.append(
                CollectorObservation(
                    status="ok",
                    value=len(connected_clients),
                    details=details,
                )
            )

        except Exception as exc:
            logger.warning("Connessione pfSense %s fallita: %s", base_url, exc)
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Impossibile comunicare con pfSense ({base_url}): {exc}"},
                )
            )

        return result

