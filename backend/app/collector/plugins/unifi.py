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
        base_url = (params.get("controller_url") or (f"https://{target_address}" if target_address else "")).strip().rstrip("/")
        username = (params.get("username") or "").strip()
        password = (params.get("password") or "").strip()
        api_key = (params.get("api_key") or "").strip()
        site = (params.get("site") or "default").strip() or "default"
        target_mac = (params.get("mac") or "").lower().strip()
        port_idx = params.get("port_idx")
        verify_ssl = bool(params.get("verify_ssl", False))

        if not base_url:
            result.observations.append(
                CollectorObservation(
                    status="unknown",
                    details={"error": "Nessun indirizzo controller o URL specificato."},
                )
            )
            return result

        try:
            async with httpx.AsyncClient(verify=verify_ssl, timeout=timeout_seconds, follow_redirects=True) as client:
                devices_data: list[dict[str, Any]] | None = None
                clients_data: list[dict[str, Any]] | None = None
                last_status_code: int | None = None
                last_error_detail: str | None = None

                # -------------------------------------------------------------
                # 1. Official UniFi OS Integration API v1 (API Key)
                # -------------------------------------------------------------
                if api_key:
                    headers = {
                        "X-API-KEY": api_key,
                        "X-API-Key": api_key,
                        "Accept": "application/json",
                    }
                    candidate_urls = [
                        # Official UniFi OS Integration API v1
                        f"{base_url}/proxy/network/integration/v1/sites/{site}/devices",
                        f"{base_url}/proxy/network/integration/v1/devices",
                        f"{base_url}/integration/v1/sites/{site}/devices",
                        f"{base_url}/integration/v1/devices",
                        # Fallback for proxies that pass headers to legacy paths
                        f"{base_url}/proxy/network/api/s/{site}/stat/device",
                        f"{base_url}/api/s/{site}/stat/device",
                        # UniFi Cloud / Site Manager API v1 (unifi.ui.com API key)
                        f"{base_url}/v1/devices",
                        "https://api.ui.com/v1/devices",
                    ]

                    for surl in candidate_urls:
                        try:
                            r = await client.get(surl, headers=headers)
                            last_status_code = r.status_code
                            if r.status_code == 200:
                                parsed = r.json()
                                if isinstance(parsed, list):
                                    devices_data = parsed
                                elif isinstance(parsed, dict):
                                    devices_data = parsed.get("data") or parsed.get("devices") or []
                                if devices_data:
                                    break
                            elif r.status_code == 401:
                                last_error_detail = "HTTP 401 Non Autorizzato: API Key non valida o non abilitata per UniFi Network."
                            elif r.status_code == 403:
                                last_error_detail = "HTTP 403 Accesso Negato: l'API Key non ha permessi di lettura dispositivi."
                            elif r.status_code == 404:
                                last_error_detail = f"HTTP 404 Non Trovato: l'endpoint {surl} non esiste sul server."
                        except Exception as exc:
                            logger.debug("Tentativo endpoint API Key %s fallito: %s", surl, exc)
                            continue

                    # Retrieve clients list via API Key
                    clients_candidate_urls = [
                        f"{base_url}/proxy/network/integration/v1/sites/{site}/clients",
                        f"{base_url}/proxy/network/integration/v1/clients",
                        f"{base_url}/integration/v1/sites/{site}/clients",
                        f"{base_url}/integration/v1/clients",
                        f"{base_url}/proxy/network/api/s/{site}/stat/sta",
                        f"{base_url}/api/s/{site}/stat/sta",
                    ]
                    for curl in clients_candidate_urls:
                        try:
                            cr = await client.get(curl, headers=headers)
                            if cr.status_code == 200:
                                c_parsed = cr.json()
                                if isinstance(c_parsed, list):
                                    clients_data = c_parsed
                                elif isinstance(c_parsed, dict):
                                    clients_data = c_parsed.get("data") or c_parsed.get("clients") or []
                                if clients_data is not None:
                                    break
                        except Exception as c_exc:
                            logger.debug("Tentativo recupero clients API Key %s fallito: %s", curl, c_exc)
                            continue

                    # Fallback for UniFi Site Manager API (api.ui.com) when devices list is empty
                    # (Software network-servers aggregate metrics under /v1/sites)
                    if not devices_data:
                        try:
                            r_sites = await client.get("https://api.ui.com/v1/sites", headers=headers)
                            if r_sites.status_code == 200:
                                s_data = r_sites.json().get("data", [])
                                connected_host_ids = set()
                                try:
                                    r_hosts = await client.get("https://api.ui.com/v1/hosts", headers=headers)
                                    if r_hosts.status_code == 200:
                                        connected_host_ids = {
                                            h["id"] for h in r_hosts.json().get("data", [])
                                            if h.get("reportedState", {}).get("state") == "connected"
                                        }
                                except Exception:
                                    pass

                                active_sites = [
                                    s for s in s_data
                                    if (not connected_host_ids or s.get("hostId") in connected_host_ids)
                                    and s.get("statistics", {}).get("counts", {}).get("totalDevice", 0) > 0
                                ] or s_data
                                for s in active_sites:
                                    st = s.get("statistics", {}).get("counts", {})
                                    tot = st.get("totalDevice", 0)
                                    if tot > 0:
                                        site_name = s.get("meta", {}).get("name") or "default"
                                        site_desc = s.get("meta", {}).get("desc") or site_name
                                        wifi_devs = st.get("wifiDevice", 0)
                                        clients = st.get("wifiClient", 0)
                                        offline = st.get("offlineDevice", 0)
                                        dev_entry = {
                                            "name": f"UniFi AP ({site_desc})" if wifi_devs > 0 else f"UniFi ({site_desc})",
                                            "model": "UniFi Access Point" if wifi_devs > 0 else "UniFi Hardware",
                                            "ipAddress": target_address or "",
                                            "macAddress": target_mac or "",
                                            "state": "ONLINE" if offline == 0 else "OFFLINE",
                                            "clientCount": clients,
                                            "num_sta": clients,
                                            "total_devices": tot,
                                            "wifi_devices": wifi_devs,
                                            "offline_devices": offline,
                                        }
                                        if devices_data is None:
                                            devices_data = []
                                        devices_data.append(dev_entry)
                        except Exception as exc:
                            logger.debug("Tentativo fallback api.ui.com/v1/sites: %s", exc)

                # -------------------------------------------------------------
                # 2. Legacy / Session Login with Username & Password
                # (Used if no API key was provided, or if API key attempts failed and credentials exist)
                # -------------------------------------------------------------
                mfa_required = False
                auth_failed = False
                mfa_token = str(params.get("mfa_token") or params.get("token") or params.get("code") or "").strip()

                if devices_data is None and username and password:
                    login_urls = [
                        f"{base_url}/api/auth/login",  # UniFi OS
                        f"{base_url}/api/login",       # Legacy standalone controller
                    ]
                    logged_in = False
                    for lurl in login_urls:
                        try:
                            login_body = {
                                "username": username,
                                "password": password,
                                "rememberMe": True,
                            }
                            login_headers = {
                                "Accept": "application/json",
                            }
                            if mfa_token:
                                login_body["token"] = mfa_token
                                login_headers["X-Ubic-2FA-Token"] = mfa_token
                                login_headers["X-Ubic-2FA-Code"] = mfa_token

                            resp = await client.post(lurl, json=login_body, headers=login_headers)
                            last_status_code = resp.status_code
                            if resp.status_code == 200:
                                logged_in = True
                                break

                            resp_text = resp.text
                            # Detect UniFi 2FA / MFA challenge
                            if (
                                "Ubic2faTokenRequired" in resp_text
                                or "api.err.Ubic2faTokenRequired" in resp_text
                                or "2fa" in resp_text.lower()
                                or "mfa" in resp_text.lower()
                            ):
                                mfa_required = True
                                auth_failed = True
                                last_error_detail = (
                                    "È richiesta l'autenticazione a due fattori (2FA/MFA) di UniFi. "
                                    "Inserisci il codice di sicurezza (OTP) inviato via email o generato dalla tua app Authenticator."
                                )
                                # Stop attempting other login URLs to avoid triggering multiple OTP emails
                                break
                            elif resp.status_code in (400, 401):
                                auth_failed = True
                                if "Invalid2faToken" in resp_text or "invalid token" in resp_text.lower():
                                    mfa_required = True
                                    last_error_detail = "Codice 2FA non valido o scaduto. Verifica il codice e riprova."
                                    break
                                else:
                                    last_error_detail = "HTTP 401 Autenticazione Fallita: username o password non validi su UniFi."
                            elif resp.status_code == 403:
                                auth_failed = True
                                last_error_detail = "HTTP 403 Accesso Negato: utente non autorizzato o account temporaneamente bloccato."
                                break
                        except Exception as exc:
                            logger.debug("Tentativo login UniFi %s fallito: %s", lurl, exc)
                            continue

                    if logged_in:
                        legacy_stat_urls = [
                            f"{base_url}/proxy/network/api/s/{site}/stat/device",
                            f"{base_url}/api/s/{site}/stat/device",
                            f"{base_url}/proxy/network/integration/v1/devices",
                            f"{base_url}/integration/v1/devices",
                        ]
                        for surl in legacy_stat_urls:
                            try:
                                r = await client.get(surl)
                                last_status_code = r.status_code
                                if r.status_code == 200:
                                    parsed = r.json()
                                    if isinstance(parsed, list):
                                        devices_data = parsed
                                    elif isinstance(parsed, dict):
                                        devices_data = parsed.get("data") or parsed.get("devices") or []
                                    break
                                elif r.status_code == 404:
                                    last_error_detail = f"HTTP 404: Site ID '{site}' non trovato sul controller (nota: il Site ID predefinito in UniFi è 'default')."
                            except Exception as exc:
                                logger.debug("Tentativo recupero stat %s fallito: %s", surl, exc)
                                continue

                        # Retrieve clients list via session login
                        legacy_clients_urls = [
                            f"{base_url}/proxy/network/api/s/{site}/stat/sta",
                            f"{base_url}/api/s/{site}/stat/sta",
                            f"{base_url}/proxy/network/integration/v1/clients",
                            f"{base_url}/integration/v1/clients",
                        ]
                        for curl in legacy_clients_urls:
                            try:
                                cr = await client.get(curl)
                                if cr.status_code == 200:
                                    c_parsed = cr.json()
                                    if isinstance(c_parsed, list):
                                        clients_data = c_parsed
                                    elif isinstance(c_parsed, dict):
                                        clients_data = c_parsed.get("data") or c_parsed.get("clients") or []
                                    if clients_data is not None:
                                        break
                            except Exception as c_exc:
                                logger.debug("Tentativo endpoint legacy clients %s fallito: %s", curl, c_exc)
                                continue

                # -------------------------------------------------------------
                # 3. Handle device list failure
                # -------------------------------------------------------------
                if devices_data is None:
                    error_msg = last_error_detail
                    if not error_msg:
                        if last_status_code == 401:
                            error_msg = "HTTP 401 Non Autorizzato: controlla API Key o credenziali UniFi."
                            auth_failed = True
                        elif last_status_code == 404:
                            error_msg = "HTTP 404 Non Trovato: verifica l'URL del controller e il Site ID (usa 'default')."
                        elif last_status_code == 403:
                            error_msg = "HTTP 403 Accesso Negato: permessi insufficienti per leggere la lista apparati."
                            auth_failed = True
                        else:
                            error_msg = f"Impossibile recuperare la lista dispositivi UniFi (HTTP {last_status_code or 'N/D'})."

                    result.observations.append(
                        CollectorObservation(
                            status="warn",
                            details={
                                "error": error_msg,
                                "last_http_code": last_status_code,
                                "mfa_required": mfa_required,
                                "auth_failed": auth_failed,
                            },
                        )
                    )
                    return result

                # -------------------------------------------------------------
                # 4. Find target device or report controller summary
                # -------------------------------------------------------------
                matched_device = None
                for dev in devices_data:
                    dev_mac = (dev.get("macAddress") or dev.get("mac") or "").lower()
                    dev_ip = dev.get("ipAddress") or dev.get("ip") or ""
                    if target_mac and dev_mac == target_mac:
                        matched_device = dev
                        break
                    elif target_address and (dev_ip == target_address or dev_mac == target_address.lower()):
                        matched_device = dev
                        break

                # Normalize and collect all active clients
                all_clients: list[dict[str, Any]] = []
                for c in (clients_data or []):
                    c_mac = (c.get("macAddress") or c.get("mac") or "").lower().strip()
                    if not c_mac:
                        continue
                    c_ip = (c.get("ipAddress") or c.get("ip") or "").strip()
                    c_name = c.get("name") or c.get("hostname") or c.get("oui") or c_ip or c_mac
                    c_hostname = c.get("hostname") or ""
                    c_ap_mac = (c.get("ap_mac") or c.get("apMac") or c.get("uplinkDeviceMac") or "").lower().strip()
                    c_sw_mac = (c.get("sw_mac") or c.get("swMac") or "").lower().strip()
                    c_uplink = (c.get("uplink_mac") or c.get("uplinkDeviceMac") or "").lower().strip()
                    is_wired = bool(c.get("is_wired", False) or str(c.get("type", "")).upper() == "WIRED")
                    essid = c.get("essid") or c.get("network") or ""
                    signal = c.get("signal") or c.get("rssi")

                    all_clients.append({
                        "mac": c_mac,
                        "ip": c_ip,
                        "name": c_name,
                        "hostname": c_hostname,
                        "is_wired": is_wired,
                        "ap_mac": c_ap_mac or None,
                        "sw_mac": c_sw_mac or None,
                        "uplink_mac": c_uplink or None,
                        "essid": essid or None,
                        "signal": signal,
                    })

                if matched_device:
                    raw_state = matched_device.get("state")
                    if isinstance(raw_state, str):
                        s_upper = raw_state.upper()
                        is_connected = s_upper in ["ONLINE", "CONNECTED", "ADOPTED"]
                        is_upgrading = s_upper in ["UPDATING", "UPGRADING"]
                        state_code = 4 if is_upgrading else (1 if is_connected else 0)
                    else:
                        state_code = int(raw_state or 0)
                        is_connected = (state_code == 1)
                        is_upgrading = (state_code == 4)

                    uptime = matched_device.get("uptime") or matched_device.get("uptimeSeconds") or 0
                    model = matched_device.get("model") or ""
                    num_sta = matched_device.get("num_sta") or matched_device.get("clientCount") or matched_device.get("clients") or 0
                    dev_name = matched_device.get("name") or matched_device.get("model") or "Apparato UniFi"
                    dev_mac = matched_device.get("macAddress") or matched_device.get("mac") or ""
                    dev_ip = matched_device.get("ipAddress") or matched_device.get("ip") or ""

                    # Filter clients connected to this specific AP, switch, or router
                    dev_mac_lower = dev_mac.lower().strip()
                    dev_clients = [
                        c for c in all_clients
                        if (c.get("ap_mac") == dev_mac_lower
                            or c.get("sw_mac") == dev_mac_lower
                            or c.get("uplink_mac") == dev_mac_lower)
                    ]
                    dtype = (matched_device.get("type") or "").lower()
                    is_gw_or_router = (
                        dtype in ["ugw", "udm", "gateway"]
                        or "router" in str(matched_device.get("model", "")).lower()
                        or "dream" in str(matched_device.get("model", "")).lower()
                    )
                    if not dev_clients and is_gw_or_router and all_clients:
                        dev_clients = all_clients

                    connected_clients = dev_clients if dev_clients or not all_clients else all_clients
                    effective_client_count = len(connected_clients) if clients_data is not None else num_sta

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
                    if is_upgrading:
                        obs_status = "warn"

                    tot_devs = matched_device.get("total_devices") or (1 if is_connected else 0)
                    details: dict[str, Any] = {
                        "name": dev_name,
                        "mac": dev_mac,
                        "ip": dev_ip,
                        "state_code": state_code,
                        "is_connected": is_connected,
                        "uptime_seconds": uptime,
                        "client_count": effective_client_count,
                        "clients_count": effective_client_count,
                        "num_sta": effective_client_count,
                        "active_clients": effective_client_count,
                        "connected_clients": connected_clients,
                        "total_devices": tot_devs,
                        "devices_found": tot_devs,
                        "wifi_devices": matched_device.get("wifi_devices", 1 if effective_client_count > 0 else 0),
                        "offline_devices": matched_device.get("offline_devices", 0),
                        "model": model,
                    }
                    if port_status_info:
                        details["port"] = port_status_info
                        val = port_status_info["poe_power"]
                    else:
                        val = float(effective_client_count)

                    result.observations.append(
                        CollectorObservation(
                            status=obs_status,
                            value=val,
                            details=details,
                        )
                    )

                    if is_upgrading:
                        result.events.append(
                            CollectorEvent(
                                event_type="firmware_update_detected",
                                severity="warn",
                                title=f"Aggiornamento firmware {model}",
                                message=f"L'apparato {dev_name} è in fase di aggiornamento firmware.",
                                details=details,
                            )
                        )
                else:
                    # If target device was requested but not found in the controller list
                    if target_address or target_mac:
                        sample_names = [
                            f"{d.get('name') or d.get('model')} ({d.get('ipAddress') or d.get('ip')})"
                            for d in devices_data[:4]
                        ]
                        tot_cnt = len(devices_data)
                        tot_cli = len(all_clients) if clients_data is not None else sum(int(d.get("clientCount") or d.get("num_sta") or 0) for d in devices_data)
                        result.observations.append(
                            CollectorObservation(
                                status="ok",
                                value=float(tot_cnt),
                                details={
                                    "controller": base_url,
                                    "warning": f"Apparato target (IP: {target_address or 'N/D'}, MAC: {target_mac or 'N/D'}) non presente nella lista apparati adottati da UniFi.",
                                    "total_devices": tot_cnt,
                                    "devices_found": tot_cnt,
                                    "client_count": tot_cli,
                                    "clients_count": tot_cli,
                                    "num_sta": tot_cli,
                                    "active_clients": tot_cli,
                                    "connected_clients": all_clients,
                                    "sample_devices": sample_names,
                                },
                            )
                        )
                    else:
                        # Controller overall observation
                        online_count = sum(
                            1 for d in devices_data
                            if (d.get("state") == 1 or str(d.get("state")).upper() in ["ONLINE", "CONNECTED"])
                        )
                        total_count = len(devices_data)
                        total_clients = len(all_clients) if clients_data is not None else sum(int(d.get("clientCount") or d.get("num_sta") or 0) for d in devices_data)
                        result.observations.append(
                            CollectorObservation(
                                status="ok" if online_count == total_count else "warn",
                                value=float(online_count),
                                details={
                                    "controller": base_url,
                                    "total_devices": total_count,
                                    "devices_found": total_count,
                                    "online_devices": online_count,
                                    "client_count": total_clients,
                                    "clients_count": total_clients,
                                    "num_sta": total_clients,
                                    "active_clients": total_clients,
                                    "connected_clients": all_clients,
                                },
                            )
                        )

        except httpx.ConnectError as exc:
            err_str = str(exc).lower()
            if "certificate verify failed" in err_str or "self-signed" in err_str or "ssl" in err_str:
                err_msg = "Errore certificato SSL: il controller usa un certificato autofirmato o non valido. Disabilita 'Verifica certificato SSL' o correggi l'hostname."
            else:
                err_msg = f"Connessione rifiutata verso {base_url}: controller non raggiungibile su questo indirizzo o porta."
            result.observations.append(
                CollectorObservation(
                    status="warn",
                    details={"error": err_msg},
                )
            )
        except httpx.TimeoutException:
            result.observations.append(
                CollectorObservation(
                    status="warn",
                    details={"error": f"Timeout di connessione ({timeout_seconds}s) verso {base_url}. Verifica indirizzo o firewall."},
                )
            )
        except Exception as exc:
            result.observations.append(
                CollectorObservation(
                    status="warn",
                    details={"error": f"Errore comunicazione UniFi: {str(exc)}"},
                )
            )

        return result

    async def discover(self, params: dict[str, Any]) -> list[DiscoveredItem]:
        """Discover devices from UniFi network controller."""
        items: list[DiscoveredItem] = []
        base_url = (params.get("controller_url") or "").strip().rstrip("/")
        username = (params.get("username") or "").strip()
        password = (params.get("password") or "").strip()
        api_key = (params.get("api_key") or "").strip()
        site = (params.get("site") or "default").strip() or "default"
        verify_ssl = bool(params.get("verify_ssl", False))

        if not base_url:
            return items

        try:
            async with httpx.AsyncClient(verify=verify_ssl, timeout=10.0, follow_redirects=True) as client:
                devices_data: list[dict[str, Any]] = []

                if api_key:
                    headers = {"X-API-KEY": api_key, "Accept": "application/json"}
                    endpoints = [
                        f"{base_url}/proxy/network/integration/v1/devices",
                        f"{base_url}/integration/v1/devices",
                        f"{base_url}/proxy/network/integration/v1/sites/{site}/devices",
                        f"{base_url}/integration/v1/sites/{site}/devices",
                        f"{base_url}/proxy/network/api/s/{site}/stat/device",
                        f"{base_url}/api/s/{site}/stat/device",
                    ]
                    for ep in endpoints:
                        try:
                            r = await client.get(ep, headers=headers)
                            if r.status_code == 200:
                                parsed = r.json()
                                if isinstance(parsed, list):
                                    devices_data = parsed
                                elif isinstance(parsed, dict):
                                    devices_data = parsed.get("data") or parsed.get("devices") or []
                                break
                        except Exception:
                            continue

                if not devices_data and username and password:
                    for lurl in [f"{base_url}/api/auth/login", f"{base_url}/api/login"]:
                        try:
                            resp = await client.post(lurl, json={"username": username, "password": password})
                            if resp.status_code == 200:
                                break
                        except Exception:
                            pass

                    for ep in [
                        f"{base_url}/proxy/network/api/s/{site}/stat/device",
                        f"{base_url}/api/s/{site}/stat/device",
                    ]:
                        try:
                            r = await client.get(ep)
                            if r.status_code == 200:
                                parsed = r.json()
                                devices_data = parsed.get("data", []) if isinstance(parsed, dict) else parsed
                                break
                        except Exception:
                            continue

                for d in devices_data:
                    mac = d.get("macAddress") or d.get("mac") or ""
                    name = d.get("name") or d.get("model") or mac
                    ip = d.get("ipAddress") or d.get("ip") or ""
                    dtype = (d.get("type") or "").lower()

                    kind = "custom"
                    if dtype in ["uap", "ap"] or "ap" in str(d.get("model", "")).lower():
                        kind = "access_point"
                    elif dtype in ["usw", "switch"] or "switch" in str(d.get("model", "")).lower():
                        kind = "switch"
                    elif dtype in ["ugw", "udm"] or "udm" in str(d.get("model", "")).lower():
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
