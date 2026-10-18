"""TP-Link Omada SDN Controller collector plugin for NetSentinel."""

import logging
from typing import Any

import httpx
from app.collector.base import (
    BaseCollector,
    CollectorObservation,
    CollectorResult,
)

logger = logging.getLogger("netsentinel.collector.omada")


class OmadaCollector(BaseCollector):
    """Collector for TP-Link Omada SDN controller (Hardware OC200/OC300, Software, Cloud)."""

    name = "omada"
    description = "Interroga controller TP-Link Omada per stato apparati, switch PoE e client attivi"
    capabilities = ["device_status", "poe_status", "port_status", "connected_clients"]

    async def collect(
        self,
        target_address: str | None,
        params: dict[str, Any],
        timeout_seconds: float = 6.0,
    ) -> CollectorResult:
        result = CollectorResult()
        base_url = (params.get("controller_url") or (f"https://{target_address}:8043" if target_address else "")).strip().rstrip("/")
        username = (params.get("username") or "").strip()
        password = (params.get("password") or "").strip()
        api_token = (params.get("token") or params.get("api_key") or "").strip()
        site = (params.get("site") or "Default").strip() or "Default"
        target_mac = (params.get("mac") or "").lower().strip()
        verify_ssl = bool(params.get("verify_ssl", False))

        if not base_url:
            result.observations.append(
                CollectorObservation(
                    status="unknown",
                    details={"error": "Nessun indirizzo controller o URL specificato per TP-Link Omada."},
                )
            )
            return result

        if not base_url.startswith("http://") and not base_url.startswith("https://"):
            base_url = f"https://{base_url}:8043"

        token = api_token
        connected_clients: list[dict[str, Any]] = []
        matched_device: dict[str, Any] | None = None
        devices_list: list[dict[str, Any]] = []
        omada_detected = False

        try:
            async with httpx.AsyncClient(verify=verify_ssl, timeout=timeout_seconds, follow_redirects=True) as client:
                # 1. Login if no token provided
                if not token and username and password:
                    login_urls = [
                        f"{base_url}/api/v2/login",
                        f"{base_url}/api/v1/login",
                    ]
                    for l_url in login_urls:
                        try:
                            resp = await client.post(l_url, json={"username": username, "password": password})
                            if resp.status_code == 200:
                                data = resp.json()
                                if data.get("errorCode") == 0 and data.get("result", {}).get("token"):
                                    token = data["result"]["token"]
                                    omada_detected = True
                                    break
                        except Exception as l_exc:
                            logger.debug("Tentativo login Omada %s fallito: %s", l_url, l_exc)

                    if not token:
                        result.observations.append(
                            CollectorObservation(
                                status="crit",
                                details={
                                    "error": f"Autenticazione TP-Link Omada fallita su {base_url}. Credenziali non valide o l'apparato non risponde all'API Omada SDN Controller (porta tipica 8043)."
                                },
                            )
                        )
                        return result

                headers = {}
                if token:
                    headers["Csrf-Token"] = token
                    headers["Authorization"] = f"AccessToken={token}"

                # 2. Query Devices List
                dev_urls = [
                    f"{base_url}/api/v2/sites/{site}/devices",
                    f"{base_url}/api/v2/devices",
                ]
                for d_url in dev_urls:
                    try:
                        r_dev = await client.get(d_url, headers=headers)
                        if r_dev.status_code == 200:
                            d_json = r_dev.json()
                            if isinstance(d_json, dict) and ("errorCode" in d_json or "result" in d_json):
                                omada_detected = True
                                d_items = d_json.get("result", {}).get("data") or d_json.get("result") or []
                                if isinstance(d_items, list):
                                    devices_list = d_items
                                    break
                    except Exception:
                        pass

                # If target_mac specified, find matching device
                if target_mac and devices_list:
                    for d in devices_list:
                        d_mac = (d.get("mac") or "").lower().strip()
                        if d_mac == target_mac:
                            matched_device = d
                            break

                # 3. Query Active Clients List
                client_urls = [
                    f"{base_url}/api/v2/sites/{site}/clients?currentPage=1&currentPageSize=1000",
                    f"{base_url}/api/v2/clients",
                ]
                all_clients_raw: list[dict[str, Any]] = []
                for c_url in client_urls:
                    try:
                        r_cli = await client.get(c_url, headers=headers)
                        if r_cli.status_code == 200:
                            c_json = r_cli.json()
                            if isinstance(c_json, dict) and ("errorCode" in c_json or "result" in c_json):
                                omada_detected = True
                                c_items = c_json.get("result", {}).get("data") or c_json.get("result") or []
                                if isinstance(c_items, list):
                                    all_clients_raw = c_items
                                    break
                    except Exception:
                        pass

                if not omada_detected:
                    result.observations.append(
                        CollectorObservation(
                            status="crit",
                            details={
                                "error": f"Nessuna risposta valida ricevuta dal controller TP-Link Omada su {base_url}. Verifica l'indirizzo, la porta (es. 8043) e che il controller Omada SDN sia raggiungibile."
                            },
                        )
                    )
                    return result

                # Normalize clients
                for c in all_clients_raw:
                    c_mac = (c.get("mac") or "").strip().lower()
                    c_ip = (c.get("ip") or "").strip()
                    c_name = (c.get("name") or c.get("hostName") or "").strip()
                    is_wireless = bool(c.get("wireless", False))
                    ap_mac = (c.get("apMac") or "").strip().lower()
                    sw_mac = (c.get("switchMac") or "").strip().lower()
                    port = c.get("port")
                    ssid = c.get("ssid")
                    rssi = c.get("rssi")

                    # If filtering by target device MAC
                    if target_mac:
                        if is_wireless and ap_mac and ap_mac != target_mac:
                            continue
                        if not is_wireless and sw_mac and sw_mac != target_mac:
                            continue

                    connected_clients.append({
                        "mac": c_mac,
                        "ip": c_ip,
                        "name": c_name or c_ip or c_mac,
                        "hostname": c.get("hostName") or c_name,
                        "is_wired": not is_wireless,
                        "port": port,
                        "ap_mac": ap_mac or None,
                        "sw_mac": sw_mac or None,
                        "essid": ssid or None,
                        "signal": rssi,
                    })

            status = "ok"
            model = (matched_device.get("model") or matched_device.get("name") or "TP-Link Omada") if matched_device else "TP-Link Omada Controller"

            details = {
                "model": model,
                "clients_count": len(connected_clients),
                "connected_clients": connected_clients,
                "total_controller_devices": len(devices_list),
                "message": f"{model}: {len(connected_clients)} client attivi rilevati via Omada SDN.",
            }

            result.observations.append(
                CollectorObservation(
                    status=status,
                    value=len(connected_clients),
                    details=details,
                )
            )

        except Exception as exc:
            logger.warning("Connessione Omada Controller %s fallita: %s", base_url, exc)
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Impossibile comunicare con il controller TP-Link Omada ({base_url}): {exc}"},
                )
            )

        return result

