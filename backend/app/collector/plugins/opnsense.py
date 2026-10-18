"""OPNsense Firewall & Router collector plugin for NetSentinel (REST API)."""

import logging
from typing import Any

import httpx
from app.collector.base import (
    BaseCollector,
    CollectorObservation,
    CollectorResult,
)

logger = logging.getLogger("netsentinel.collector.opnsense")


class OpnsenseCollector(BaseCollector):
    """Collector for OPNsense firewalls via official REST API."""

    name = "opnsense"
    description = "Interroga OPNsense per tabella ARP, lease DHCP, stato gateway WAN e apparati connessi"
    capabilities = ["device_status", "connected_clients", "dhcp_leases", "arp_table", "gateways"]

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
        verify_ssl = bool(params.get("verify_ssl", False))

        if not base_url:
            result.observations.append(
                CollectorObservation(
                    status="unknown",
                    details={"error": "Nessun indirizzo IP o URL specificato per OPNsense."},
                )
            )
            return result

        if not base_url.startswith("http://") and not base_url.startswith("https://"):
            base_url = f"https://{base_url}"

        auth = (api_key, api_secret) if (api_key and api_secret) else None
        connected_clients: list[dict[str, Any]] = []
        gateways_list: list[dict[str, Any]] = []

        try:
            async with httpx.AsyncClient(verify=verify_ssl, timeout=timeout_seconds, auth=auth) as client:
                # 1. Query ARP Table (/api/diagnostics/interface/getArpTable)
                try:
                    r_arp = await client.get(f"{base_url}/api/diagnostics/interface/getArpTable")
                    if r_arp.status_code == 200:
                        arp_data = r_arp.json()
                        items = arp_data if isinstance(arp_data, list) else arp_data.get("rows", [])
                        for a in items:
                            ip = (a.get("ip") or "").strip()
                            mac = (a.get("mac") or "").strip().lower()
                            hostname = (a.get("hostname") or "").strip()
                            intf = a.get("intf_description") or a.get("intf") or "LAN"
                            if mac and ip and not mac.startswith("ff:ff"):
                                connected_clients.append({
                                    "ip": ip,
                                    "mac": mac,
                                    "name": hostname or ip or mac,
                                    "hostname": hostname,
                                    "is_wired": True,
                                    "interface": str(intf),
                                })
                except Exception as exc:
                    logger.debug("Recupero ARP OPNsense fallito: %s", exc)

                # 2. Query DHCP Leases (/api/dhcpv4/leases/searchLease)
                try:
                    r_dhcp = await client.post(f"{base_url}/api/dhcpv4/leases/searchLease", json={})
                    if r_dhcp.status_code == 200:
                        dhcp_data = r_dhcp.json()
                        d_rows = dhcp_data.get("rows", [])
                        existing_macs = {c["mac"] for c in connected_clients}
                        for d in d_rows:
                            d_mac = (d.get("mac") or "").strip().lower()
                            d_ip = (d.get("address") or "").strip()
                            d_name = (d.get("hostname") or "").strip()
                            if d_mac and d_mac not in existing_macs:
                                connected_clients.append({
                                    "ip": d_ip,
                                    "mac": d_mac,
                                    "name": d_name or d_ip or d_mac,
                                    "hostname": d_name,
                                    "is_wired": True,
                                    "interface": d.get("if_descr", "LAN"),
                                })
                except Exception as exc:
                    logger.debug("Recupero DHCP Leases OPNsense fallito: %s", exc)

                # 3. Query Gateways status
                try:
                    r_gw = await client.get(f"{base_url}/api/routes/gateway/status")
                    if r_gw.status_code == 200:
                        gw_data = r_gw.json()
                        gateways_list = gw_data.get("items", [])
                except Exception:
                    pass

            details = {
                "model": "OPNsense Firewall",
                "clients_count": len(connected_clients),
                "connected_clients": connected_clients,
                "gateways": gateways_list,
                "message": f"OPNsense: {len(connected_clients)} client attivi rilevati via REST API.",
            }

            result.observations.append(
                CollectorObservation(
                    status="ok",
                    value=len(connected_clients),
                    details=details,
                )
            )

        except Exception as exc:
            logger.warning("Connessione OPNsense %s fallita: %s", base_url, exc)
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Impossibile comunicare con OPNsense ({base_url}): {exc}"},
                )
            )

        return result

