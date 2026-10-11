"""UniFi Network Application collector plugin for NetSentinel."""

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

logger = logging.getLogger("netsentinel.collector.unifi")


class UniFiCollector(BaseCollector):
    """Collector for Ubiquiti UniFi Network controller (UDM, Cloud Key, Self-hosted)."""

    name = "unifi"
    description = "Raccoglie stato apparati, consumo PoE porte, client e allarmi da UniFi Network"
    capabilities = ["device_status", "poe_status", "port_status", "discovery", "events"]

    async def collect(
        self,
        target_address: str | None,
        params: dict[str, Any],
        timeout_seconds: float = 5.0,
    ) -> CollectorResult:
        """Query UniFi controller for device status, switch port PoE, or system metrics."""
        result = CollectorResult()
        base_url = params.get("controller_url", f"https://{target_address}" if target_address else "")
        username = params.get("username", "")
        password = params.get("password", "")
        api_key = params.get("api_key", "")
        site = params.get("site", "default")
        target_mac = (params.get("mac") or "").lower()
        port_idx = params.get("port_idx")
        verify_ssl = params.get("verify_ssl", False)

        if not base_url:
            result.observations.append(
                CollectorObservation(
                    status="unknown",
                    details={"error": "Nessun indirizzo controller o URL specificato."},
                )
            )
            return result

        try:
            async with httpx.AsyncClient(verify=verify_ssl, timeout=timeout_seconds) as client:
                headers = {}
                if api_key:
                    headers["X-API-KEY"] = api_key
                else:
                    # Authenticate via session cookie
                    login_urls = [
                        f"{base_url.rstrip('/')}/api/auth/login",  # UniFi OS
                        f"{base_url.rstrip('/')}/api/login",  # Legacy UniFi controller
                    ]
                    logged_in = False
                    for lurl in login_urls:
                        try:
                            resp = await client.post(lurl, json={"username": username, "password": password})
                            if resp.status_code == 200:
                                logged_in = True
                                break
                        except Exception:
                            continue

                    if not logged_in and not api_key:
                        result.observations.append(
                            CollectorObservation(
                                status="crit",
                                details={"error": "Autenticazione al controller UniFi fallita."},
                            )
                        )
                        return result

                # Query devices endpoint
                stat_urls = [
                    f"{base_url.rstrip('/')}/proxy/network/api/s/{site}/stat/device",
                    f"{base_url.rstrip('/')}/api/s/{site}/stat/device",
                ]
                devices_data = None
                for surl in stat_urls:
                    try:
                        r = await client.get(surl, headers=headers)
                        if r.status_code == 200:
                            data = r.json()
                            devices_data = data.get("data", [])
                            break
                    except Exception:
                        continue

                if devices_data is None:
                    result.observations.append(
                        CollectorObservation(
                            status="warn",
                            details={"error": "Impossibile recuperare la lista dispositivi UniFi."},
                        )
                    )
                    return result

                # Find target device if MAC specified, or evaluate controller health
                matched_device = None
                for dev in devices_data:
                    dev_mac = dev.get("mac", "").lower()
                    dev_ip = dev.get("ip", "")
                    if target_mac and dev_mac == target_mac:
                        matched_device = dev
                        break
                    elif target_address and (dev_ip == target_address or dev_mac == target_address.lower()):
                        matched_device = dev
                        break

                if matched_device:
                    state = matched_device.get("state", 0)  # 1: connected, 0: disconnected, 4: upgrading
                    is_connected = (state == 1)
                    uptime = matched_device.get("uptime", 0)
                    model = matched_device.get("model", "")
                    num_sta = matched_device.get("num_sta", 0)

                    # Check switch port PoE if port_idx requested
                    port_status_info = None
                    if port_idx is not None and "port_table" in matched_device:
                        for p in matched_device["port_table"]:
                            if p.get("port_idx") == int(port_idx):
                                port_status_info = {
                                    "port_idx": port_idx,
                                    "up": p.get("up", False),
                                    "poe_power": float(p.get("poe_power", 0.0)),
                                    "poe_current": float(p.get("poe_current", 0.0)),
                                    "speed": p.get("speed", 0),
                                }
                                break

                    obs_status = "ok" if is_connected else "crit"
                    if state == 4:
                        obs_status = "warn"  # upgrading

                    details: dict[str, Any] = {
                        "name": matched_device.get("name") or matched_device.get("model"),
                        "mac": matched_device.get("mac"),
                        "state_code": state,
                        "is_connected": is_connected,
                        "uptime_seconds": uptime,
                        "client_count": num_sta,
                        "model": model,
                    }
                    if port_status_info:
                        details["port"] = port_status_info
                        val = port_status_info["poe_power"]
                    else:
                        val = float(num_sta)

                    result.observations.append(
                        CollectorObservation(
                            status=obs_status,
                            value=val,
                            details=details,
                        )
                    )

                    if state == 4:
                        result.events.append(
                            CollectorEvent(
                                event_type="firmware_update_detected",
                                severity="warn",
                                title=f"Aggiornamento firmware {model}",
                                message=f"L'apparato {details['name']} è in fase di aggiornamento firmware.",
                                details=details,
                            )
                        )
                else:
                    # Controller overall observation
                    online_count = sum(1 for d in devices_data if d.get("state") == 1)
                    total_count = len(devices_data)
                    result.observations.append(
                        CollectorObservation(
                            status="ok" if online_count == total_count else "warn",
                            value=float(online_count),
                            details={
                                "controller": base_url,
                                "total_devices": total_count,
                                "online_devices": online_count,
                            },
                        )
                    )

        except httpx.TimeoutException:
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Timeout connessione al controller UniFi ({timeout_seconds}s)."},
                )
            )
        except Exception as exc:
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Errore comunicazione UniFi: {str(exc)}"},
                )
            )

        return result

    async def discover(self, params: dict[str, Any]) -> list[DiscoveredItem]:
        """Discover devices from UniFi network controller."""
        items: list[DiscoveredItem] = []
        base_url = params.get("controller_url", "")
        username = params.get("username", "")
        password = params.get("password", "")
        api_key = params.get("api_key", "")
        site = params.get("site", "default")
        verify_ssl = params.get("verify_ssl", False)

        if not base_url:
            return items

        try:
            async with httpx.AsyncClient(verify=verify_ssl, timeout=10.0) as client:
                headers = {}
                if api_key:
                    headers["X-API-KEY"] = api_key
                else:
                    login_urls = [
                        f"{base_url.rstrip('/')}/api/auth/login",
                        f"{base_url.rstrip('/')}/api/login",
                    ]
                    for lurl in login_urls:
                        try:
                            resp = await client.post(lurl, json={"username": username, "password": password})
                            if resp.status_code == 200:
                                break
                        except Exception:
                            pass

                stat_urls = [
                    f"{base_url.rstrip('/')}/proxy/network/api/s/{site}/stat/device",
                    f"{base_url.rstrip('/')}/api/s/{site}/stat/device",
                ]
                devices_data = []
                for surl in stat_urls:
                    try:
                        r = await client.get(surl, headers=headers)
                        if r.status_code == 200:
                            devices_data = r.json().get("data", [])
                            break
                    except Exception:
                        continue

                for d in devices_data:
                    mac = d.get("mac", "")
                    name = d.get("name") or d.get("model") or mac
                    ip = d.get("ip", "")
                    dtype = d.get("type", "")

                    kind = "custom"
                    if dtype in ["uap", "ap"]:
                        kind = "access_point"
                    elif dtype in ["usw", "switch"]:
                        kind = "switch"
                    elif dtype in ["ugw", "udm"]:
                        kind = "router"

                    uplink_mac = d.get("uplink", {}).get("uplink_mac")
                    uplink_port = d.get("uplink", {}).get("uplink_remote_port")

                    suggested_links = []
                    if uplink_mac:
                        suggested_links.append({
                            "provider_mac": uplink_mac,
                            "provider_port": str(uplink_port) if uplink_port else None,
                            "medium": "poe" if kind == "access_point" else "ethernet",
                        })

                    items.append(
                        DiscoveredItem(
                            id=f"unifi-{mac.replace(':', '').lower()}",
                            name=name,
                            kind=kind,
                            addresses={"ip": ip, "mac": mac},
                            suggested_links=suggested_links,
                            suggested_checks=[
                                {
                                    "type": "unifi",
                                    "name": f"UniFi Status {name}",
                                    "params": {"mac": mac, "controller_url": base_url},
                                }
                            ],
                            raw_data=d,
                        )
                    )
        except Exception as exc:
            logger.warning("Errore discovery UniFi: %s", exc)

        return items
