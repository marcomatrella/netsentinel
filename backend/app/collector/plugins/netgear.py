"""Netgear Consumer & Orbi Mesh router collector plugin for NetSentinel (SOAP API)."""

import logging
import re
import xml.etree.ElementTree as ET
from typing import Any

import httpx
from app.collector.base import (
    BaseCollector,
    CollectorObservation,
    CollectorResult,
)

logger = logging.getLogger("netsentinel.collector.netgear")


class NetgearCollector(BaseCollector):
    """Collector for Netgear Nighthawk and Orbi mesh routers via local SOAP API."""

    name = "netgear"
    description = "Interroga router e sistemi mesh Netgear (Nighthawk, Orbi) via SOAP per client connessi e satelliti"
    capabilities = ["device_status", "connected_clients", "wan_status"]

    async def collect(
        self,
        target_address: str | None,
        params: dict[str, Any],
        timeout_seconds: float = 6.0,
    ) -> CollectorResult:
        result = CollectorResult()
        host = (params.get("host") or (target_address if target_address else "")).strip().rstrip("/")
        port = int(params.get("port") or 5000)
        username = (params.get("username") or "admin").strip()
        password = (params.get("password") or "").strip()

        if not host:
            result.observations.append(
                CollectorObservation(
                    status="unknown",
                    details={"error": "Nessun indirizzo IP specificato per il router Netgear."},
                )
            )
            return result

        auth = (username, password) if (username and password) else None

        connected_clients: list[dict[str, Any]] = []
        model_name = "Netgear Router"

        try:
            async with httpx.AsyncClient(timeout=timeout_seconds, auth=auth) as client:
                # 1. Check if target is a Netgear Plus Switch (e.g. MS308E, GS108E, GS316EP)
                is_switch = False
                try:
                    r_switch = await client.get(f"http://{host}/api/login_page")
                    if r_switch.status_code == 200 and "switchName" in r_switch.text:
                        is_switch = True
                        sw_info = r_switch.json().get("status", {})
                        sw_name = sw_info.get("switchName", "Plus Switch")
                        model_name = f"Netgear {sw_name} Switch"

                        if password:
                            login_r = await client.patch(
                                f"http://{host}/api/system/login",
                                json={"password": password},
                                headers={"Content-Type": "application/json"},
                            )
                            if login_r.status_code == 200:
                                token = login_r.json().get("token")
                                auth_headers = {"Authorization": f"Bearer {token}"}

                                # Get system status info
                                try:
                                    sys_r = await client.get(f"http://{host}/api/system/status", headers=auth_headers)
                                    if sys_r.status_code == 200:
                                        s_data = sys_r.json().get("status", {})
                                        if s_data.get("firmwareVersion"):
                                            model_name += f" (FW {s_data.get('firmwareVersion')})"
                                except Exception:
                                    pass

                                # Get ports
                                try:
                                    ports_r = await client.get(f"http://{host}/api/ports", headers=auth_headers)
                                    if ports_r.status_code == 200:
                                        p_json = ports_r.json()
                                        ports_list = (
                                            p_json.get("ports", [])
                                            if isinstance(p_json, dict)
                                            else (p_json if isinstance(p_json, list) else [])
                                        )
                                        for p in ports_list:
                                            if isinstance(p, dict):
                                                pid = p.get("port") or p.get("portIndex") or p.get("id") or p.get("portID")
                                                spd = p.get("speed") or p.get("linkSpeed") or p.get("status") or "Down"
                                                spd_str = str(spd)
                                                if spd_str.lower() not in ["0", "down", "off", "none", "null", ""]:
                                                    connected_clients.append({
                                                        "ip": f"{host}#p{pid}",
                                                        "mac": p.get("mac", ""),
                                                        "name": f"Porta {pid} ({spd_str})",
                                                        "hostname": f"Port {pid}",
                                                        "is_wired": True,
                                                        "port": f"Port {pid}",
                                                        "link_speed": spd_str,
                                                    })
                                except Exception:
                                    pass

                                # Logout cleanly
                                try:
                                    await client.patch(f"http://{host}/api/system/logout", headers=auth_headers)
                                except Exception:
                                    pass
                            elif login_r.status_code == 401:
                                result.observations.append(
                                    CollectorObservation(
                                        status="crit",
                                        details={
                                            "error": f"Password non corretta per lo switch Netgear {sw_name}. Inserisci la password dell'interfaccia web.",
                                            "model": model_name,
                                        },
                                    )
                                )
                                return result
                        else:
                            details = {
                                "model": model_name,
                                "clients_count": 0,
                                "connected_clients": [],
                                "message": f"Rilevato switch Netgear {sw_name}. Inserisci la password amministratore per leggere le porte attive.",
                            }
                            result.observations.append(
                                CollectorObservation(status="ok", value=0, details=details)
                            )
                            return result
                except Exception:
                    pass

                # 2. Query AttachDevice2 SOAP Action for Netgear Consumer Routers (Nighthawk / Orbi)
                if not is_switch:
                    soap_body = (
                        '<?xml version="1.0" encoding="utf-8"?>'
                        '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">'
                        '<SOAP-ENV:Header>'
                        '<SessionID xsi:type="xsd:string" xmlns:xsi="http://www.w3.org/1999/XMLSchema-instance">None</SessionID>'
                        '</SOAP-ENV:Header>'
                        '<SOAP-ENV:Body>'
                        '<M1:GetAttachDevice2 xmlns:M1="urn:NETGEAR-ROUTER:service:DeviceInfo:1"/>'
                        '</SOAP-ENV:Body>'
                        '</SOAP-ENV:Envelope>'
                    )

                    candidate_endpoints = [
                        (f"http://{host}:{port}/soap/server_sa/", "urn:NETGEAR-ROUTER:service:DeviceInfo:1#GetAttachDevice2"),
                        (f"http://{host}:80/soap/server_sa/", "urn:NETGEAR-ROUTER:service:DeviceInfo:1#GetAttachDevice2"),
                        (f"http://{host}:{port}/soap/server_sa/", "urn:NETGEAR-ROUTER:service:DeviceInfo:1#GetAttachDevice"),
                    ]

                    raw_resp_text = None
                    for ep_url, soap_action in candidate_endpoints:
                        try:
                            r = await client.post(
                                ep_url,
                                headers={
                                    "Content-Type": 'text/xml; charset="utf-8"',
                                    "SOAPAction": soap_action,
                                },
                                content=soap_body,
                            )
                            text_clean = r.text.strip().lower()
                            if r.status_code == 200 and not text_clean.startswith("<!doctype") and not text_clean.startswith("<html"):
                                if "AttachDevice" in r.text or "Device" in r.text:
                                    raw_resp_text = r.text
                                    break
                        except Exception:
                            pass

                    if not raw_resp_text:
                        result.observations.append(
                            CollectorObservation(
                                status="crit",
                                details={"error": f"Nessuna risposta SOAP dal router Netgear ({host}). Se si tratta di uno switch, inserisci la password dell'interfaccia web."},
                            )
                        )
                        return result

                    # Format A: XML <Device><IP>...</IP><MAC>...</MAC>...</Device>
                    if "<Device>" in raw_resp_text:
                        try:
                            match = re.search(r"<NewAttachDevice>(.*?)</NewAttachDevice>", raw_resp_text, re.DOTALL)
                            inner = match.group(1) if match else raw_resp_text
                            inner = inner.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
                            root = ET.fromstring(f"<root>{inner}</root>")
                            for d in root.findall(".//Device"):
                                ip = (d.findtext("IP") or d.findtext("IPAddress") or "").strip()
                                mac = (d.findtext("MAC") or d.findtext("MACAddress") or "").strip().lower()
                                name = (d.findtext("Name") or "").strip()
                                conn_type = (d.findtext("ConnectionType") or "").strip().lower()
                                is_wired = ("wireless" not in conn_type and "wifi" not in conn_type)
                                if mac and ip:
                                    connected_clients.append({
                                        "ip": ip,
                                        "mac": mac,
                                        "name": name or ip or mac,
                                        "hostname": name,
                                        "is_wired": is_wired,
                                        "interface": conn_type or ("LAN" if is_wired else "Wi-Fi"),
                                    })
                        except Exception:
                            pass

                    # Format B: Delimited string e.g. 5@1@192.168.1.2@AA:BB:CC:DD:EE:01@Device1@wired@...
                    if not connected_clients:
                        lines = raw_resp_text.split("@")
                        for i in range(len(lines)):
                            chunk = lines[i]
                            if re.match(r"^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$", chunk):
                                mac = chunk.lower()
                                ip = lines[i - 1] if i > 0 and re.match(r"^\d+\.\d+\.\d+\.\d+$", lines[i - 1]) else ""
                                name = lines[i + 1] if i + 1 < len(lines) else ""
                                conn = lines[i + 2].lower() if i + 2 < len(lines) else "wired"
                                is_wired = ("wireless" not in conn and "wifi" not in conn and "2.4" not in conn and "5g" not in conn)
                                if mac and ip:
                                    connected_clients.append({
                                        "ip": ip,
                                        "mac": mac,
                                        "name": name or ip or mac,
                                        "hostname": name,
                                        "is_wired": is_wired,
                                        "interface": conn,
                                    })

            details = {
                "model": model_name,
                "clients_count": len(connected_clients),
                "connected_clients": connected_clients,
                "message": f"Netgear: {len(connected_clients)} client attivi rilevati via SOAP API.",
            }

            result.observations.append(
                CollectorObservation(
                    status="ok",
                    value=len(connected_clients),
                    details=details,
                )
            )

        except Exception as exc:
            logger.warning("Connessione router Netgear %s fallita: %s", host, exc)
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Impossibile comunicare con il router Netgear ({host}): {exc}"},
                )
            )

        return result

