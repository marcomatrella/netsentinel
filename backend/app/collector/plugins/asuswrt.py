"""ASUSWRT / ASUS Router collector plugin for NetSentinel."""

import base64
import logging
from typing import Any

import httpx
from app.collector.base import (
    BaseCollector,
    CollectorObservation,
    CollectorResult,
)

logger = logging.getLogger("netsentinel.collector.asuswrt")


class AsusWrtCollector(BaseCollector):
    """Collector for ASUS routers running ASUSWRT / Asuswrt-Merlin firmware."""

    name = "asuswrt"
    description = "Interroga router ASUS (ASUSWRT / Merlin) per client cablati/Wi-Fi connessi e segnale"
    capabilities = ["device_status", "connected_clients", "wifi_status", "wan_status"]

    async def collect(
        self,
        target_address: str | None,
        params: dict[str, Any],
        timeout_seconds: float = 6.0,
    ) -> CollectorResult:
        result = CollectorResult()
        host = (params.get("host") or (target_address if target_address else "")).strip().rstrip("/")
        username = (params.get("username") or "admin").strip()
        password = (params.get("password") or "").strip()
        use_https = bool(params.get("https", False))
        verify_ssl = bool(params.get("verify_ssl", False))

        if not host:
            result.observations.append(
                CollectorObservation(
                    status="unknown",
                    details={"error": "Nessun indirizzo IP specificato per il router ASUS."},
                )
            )
            return result

        scheme = "https" if use_https else "http"
        base_url = f"{scheme}://{host}"
        auth = (username, password) if (username and password) else None

        connected_clients: list[dict[str, Any]] = []

        try:
            async with httpx.AsyncClient(verify=verify_ssl, timeout=timeout_seconds, auth=auth) as client:
                # 1. First attempt session login if needed
                login_headers = {}
                if username and password:
                    auth_base64 = base64.b64encode(f"{username}:{password}".encode()).decode("utf-8")
                    try:
                        r_login = await client.post(
                            f"{base_url}/login.cgi",
                            data={"login_authorization": auth_base64},
                            headers={"Referer": f"{base_url}/Main_Login.asp"},
                        )
                        if "asus_token" in r_login.cookies:
                            login_headers["Cookie"] = f"asus_token={r_login.cookies['asus_token']}"
                    except Exception:
                        pass

                # 2. Query Client List (/appGet.cgi?hook=get_clientlist() or /ajax_core.asp)
                client_endpoints = [
                    f"{base_url}/appGet.cgi?hook=get_clientlist()",
                    f"{base_url}/ajax_core.asp",
                    f"{base_url}/update.cgi?output=netool&service=get_clientlist",
                ]

                raw_clients_dict: dict[str, Any] = {}
                for ep in client_endpoints:
                    try:
                        r = await client.get(ep, headers=login_headers)
                        if r.status_code == 200:
                            data = r.json()
                            if "get_clientlist" in data:
                                raw_clients_dict = data["get_clientlist"]
                                break
                            elif isinstance(data, dict):
                                raw_clients_dict = data
                                break
                    except Exception:
                        pass

                # Parse ASUSWRT client dictionary
                for key, val in raw_clients_dict.items():
                    if isinstance(val, dict):
                        c_mac = (val.get("mac") or key).strip().lower()
                        c_ip = (val.get("ip") or "").strip()
                        c_name = (val.get("name") or val.get("nickName") or "").strip()
                        is_wl = bool(val.get("isWL", 0) != 0 or val.get("isWireless", False))
                        rssi = val.get("rssi")
                        ssid = val.get("ssid")
                        if c_mac and len(c_mac) >= 12:
                            connected_clients.append({
                                "mac": c_mac,
                                "ip": c_ip,
                                "name": c_name or c_ip or c_mac,
                                "hostname": c_name,
                                "is_wired": not is_wl,
                                "essid": ssid,
                                "signal": int(rssi) if rssi is not None else None,
                            })

            details = {
                "model": "ASUS Router (ASUSWRT)",
                "clients_count": len(connected_clients),
                "connected_clients": connected_clients,
                "message": f"ASUSWRT: {len(connected_clients)} client attivi rilevati via web hook.",
            }

            result.observations.append(
                CollectorObservation(
                    status="ok",
                    value=len(connected_clients),
                    details=details,
                )
            )

        except Exception as exc:
            logger.warning("Connessione router ASUS %s fallita: %s", base_url, exc)
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Impossibile comunicare con il router ASUS ({base_url}): {exc}"},
                )
            )

        return result

