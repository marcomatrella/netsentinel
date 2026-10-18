"""MikroTik RouterOS collector plugin for NetSentinel (REST API v7+)."""

import logging
from typing import Any

import httpx
from app.collector.base import (
    BaseCollector,
    CollectorObservation,
    CollectorResult,
)

logger = logging.getLogger("netsentinel.collector.mikrotik")


class MikroTikCollector(BaseCollector):
    """Collector for MikroTik RouterOS devices (Routers, Switches, APs) via native REST API."""

    name = "mikrotik"
    description = "Interroga apparati MikroTik RouterOS (v7+) per client connessi, tabella bridge e stato CPU/RAM"
    capabilities = ["device_status", "connected_clients", "bridge_hosts", "dhcp_leases"]

    async def collect(
        self,
        target_address: str | None,
        params: dict[str, Any],
        timeout_seconds: float = 6.0,
    ) -> CollectorResult:
        result = CollectorResult()
        host = (params.get("host") or target_address or "").strip()
        port = int(params.get("port") or 443)
        username = (params.get("username") or "admin").strip()
        password = (params.get("password") or "").strip()
        use_https = bool(params.get("https", port == 443))
        verify_ssl = bool(params.get("verify_ssl", False))

        if not host:
            result.observations.append(
                CollectorObservation(
                    status="unknown",
                    details={"error": "Nessun host o IP specificato per l'apparato MikroTik."},
                )
            )
            return result

        scheme = "https" if use_https else "http"
        base_url = f"{scheme}://{host}:{port}/rest"
        auth = (username, password)

        connected_clients: list[dict[str, Any]] = []
        sys_resource: dict[str, Any] = {}

        try:
            async with httpx.AsyncClient(verify=verify_ssl, timeout=timeout_seconds, auth=auth) as client:
                # 1. System Resource (Model, CPU, RAM, Uptime)
                try:
                    r_sys = await client.get(f"{base_url}/system/resource")
                    if r_sys.status_code == 200:
                        sys_resource = r_sys.json()
                        if isinstance(sys_resource, list) and sys_resource:
                            sys_resource = sys_resource[0]
                except Exception as exc:
                    logger.debug("Recupero system/resource MikroTik fallito: %s", exc)

                # 2. DHCP Server Leases
                leases_map: dict[str, dict[str, Any]] = {}
                try:
                    r_leases = await client.get(f"{base_url}/ip/dhcp-server/lease")
                    if r_leases.status_code == 200:
                        raw_leases = r_leases.json()
                        if isinstance(raw_leases, list):
                            for lease in raw_leases:
                                mac = (lease.get("mac-address") or "").strip().lower()
                                ip = (lease.get("address") or lease.get("active-address") or "").strip()
                                host_name = (lease.get("host-name") or lease.get("comment") or "").strip()
                                status = lease.get("status", "bound")
                                if mac and status == "bound":
                                    leases_map[mac] = {
                                        "ip": ip,
                                        "name": host_name,
                                        "mac": mac,
                                    }
                except Exception as exc:
                    logger.debug("Recupero DHCP leases MikroTik fallito: %s", exc)

                # 3. ARP Table (supplementary mapping for static IPs)
                arp_map: dict[str, str] = {}
                try:
                    r_arp = await client.get(f"{base_url}/ip/arp")
                    if r_arp.status_code == 200:
                        raw_arp = r_arp.json()
                        if isinstance(raw_arp, list):
                            for a in raw_arp:
                                mac = (a.get("mac-address") or "").strip().lower()
                                ip = (a.get("address") or "").strip()
                                if mac and ip:
                                    arp_map[mac] = ip
                except Exception as exc:
                    logger.debug("Recupero ARP MikroTik fallito: %s", exc)

                # 4. Wireless Registration Table (Wi-Fi clients)
                wifi_macs: set[str] = set()
                wifi_endpoints = [
                    f"{base_url}/interface/wireless/registration-table",
                    f"{base_url}/interface/wifi/registration",
                ]
                for w_url in wifi_endpoints:
                    try:
                        r_wifi = await client.get(w_url)
                        if r_wifi.status_code == 200:
                            raw_wifi = r_wifi.json()
                            if isinstance(raw_wifi, list):
                                for w in raw_wifi:
                                    w_mac = (w.get("mac-address") or "").strip().lower()
                                    if not w_mac:
                                        continue
                                    wifi_macs.add(w_mac)
                                    lease_info = leases_map.get(w_mac, {})
                                    ip = lease_info.get("ip") or arp_map.get(w_mac) or ""
                                    name = lease_info.get("name") or w.get("comment") or ip or w_mac
                                    sig = w.get("signal-strength")
                                    signal_val = None
                                    if sig:
                                        try:
                                            signal_val = int(str(sig).split("@")[0].replace("dBm", "").strip())
                                        except Exception:
                                            pass
                                    connected_clients.append({
                                        "mac": w_mac,
                                        "ip": ip,
                                        "name": name,
                                        "hostname": lease_info.get("name"),
                                        "is_wired": False,
                                        "interface": w.get("interface"),
                                        "signal": signal_val,
                                    })
                    except Exception:
                        pass

                # 5. Bridge Hosts (Learned MACs per Ethernet port)
                try:
                    r_bridge = await client.get(f"{base_url}/interface/bridge/host")
                    if r_bridge.status_code == 200:
                        raw_bridge = r_bridge.json()
                        if isinstance(raw_bridge, list):
                            seen_bridge_macs = set()
                            for b in raw_bridge:
                                b_mac = (b.get("mac-address") or "").strip().lower()
                                is_local = bool(b.get("local", False))
                                if not b_mac or is_local or b_mac in wifi_macs or b_mac in seen_bridge_macs:
                                    continue
                                seen_bridge_macs.add(b_mac)
                                on_iface = b.get("on-interface") or b.get("interface") or "ether"
                                is_wired = not any(w in str(on_iface).lower() for w in ["wlan", "wifi"])
                                lease_info = leases_map.get(b_mac, {})
                                ip = lease_info.get("ip") or arp_map.get(b_mac) or ""
                                name = lease_info.get("name") or ip or b_mac
                                connected_clients.append({
                                    "mac": b_mac,
                                    "ip": ip,
                                    "name": name,
                                    "hostname": lease_info.get("name"),
                                    "is_wired": is_wired,
                                    "port": on_iface,
                                    "interface": on_iface,
                                })
                except Exception as exc:
                    logger.debug("Recupero bridge hosts MikroTik fallito: %s", exc)

                # Fallback: if no bridge hosts (e.g. standard router without bridge), add from leases
                existing_macs = {c["mac"] for c in connected_clients}
                for l_mac, l_info in leases_map.items():
                    if l_mac not in existing_macs:
                        connected_clients.append({
                            "mac": l_mac,
                            "ip": l_info.get("ip") or "",
                            "name": l_info.get("name") or l_info.get("ip") or l_mac,
                            "hostname": l_info.get("name"),
                            "is_wired": True,
                        })

            model_name = sys_resource.get("board-name") or sys_resource.get("platform") or "MikroTik RouterOS"
            cpu_load = sys_resource.get("cpu-load")
            free_mem = sys_resource.get("free-memory")
            total_mem = sys_resource.get("total-memory")

            details = {
                "model": model_name,
                "version": sys_resource.get("version"),
                "uptime": sys_resource.get("uptime"),
                "cpu_load_pct": int(cpu_load) if cpu_load is not None else None,
                "free_memory_bytes": int(free_mem) if free_mem is not None else None,
                "total_memory_bytes": int(total_mem) if total_mem is not None else None,
                "clients_count": len(connected_clients),
                "connected_clients": connected_clients,
                "message": f"{model_name}: {len(connected_clients)} client attivi rilevati via REST API RouterOS.",
            }

            result.observations.append(
                CollectorObservation(
                    status="ok",
                    value=len(connected_clients),
                    details=details,
                )
            )

        except Exception as exc:
            logger.warning("Connessione MikroTik %s fallita: %s", base_url, exc)
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Impossibile comunicare con l'apparato MikroTik ({base_url}): {exc}"},
                )
            )

        return result

