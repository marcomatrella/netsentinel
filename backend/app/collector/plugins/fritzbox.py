"""AVM FRITZ!Box collector plugin for NetSentinel (TR-064 / UPnP SOAP)."""

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

logger = logging.getLogger("netsentinel.collector.fritzbox")


class FritzBoxCollector(BaseCollector):
    """Collector for AVM FRITZ!Box router and Mesh repeaters via TR-064 protocol."""

    name = "fritzbox"
    description = "Interroga host attivi, topologia Mesh Wi-Fi e stato connessione WAN di AVM FRITZ!Box tramite TR-064"
    capabilities = ["device_status", "connected_clients", "wan_status", "mesh_topology"]

    async def collect(
        self,
        target_address: str | None,
        params: dict[str, Any],
        timeout_seconds: float = 6.0,
    ) -> CollectorResult:
        result = CollectorResult()
        base_url = (params.get("fritz_url") or (f"http://{target_address}:49000" if target_address else "")).strip().rstrip("/")
        username = (params.get("username") or "").strip()
        password = (params.get("password") or "").strip()
        verify_ssl = bool(params.get("verify_ssl", False))

        if not base_url:
            result.observations.append(
                CollectorObservation(
                    status="unknown",
                    details={"error": "Nessun indirizzo IP o URL specificato per il FRITZ!Box."},
                )
            )
            return result

        # Ensure scheme is present
        if not base_url.startswith("http://") and not base_url.startswith("https://"):
            base_url = f"http://{base_url}:49000"

        auth = (username, password) if (username or password) else None

        connected_clients: list[dict[str, Any]] = []
        wan_info: dict[str, Any] = {}
        router_model = "AVM FRITZ!Box"
        uptime_sec = 0

        try:
            async with httpx.AsyncClient(verify=verify_ssl, timeout=timeout_seconds, auth=auth) as client:
                # 1. Query Device Info / Model name
                try:
                    dev_info_soap = (
                        '<?xml version="1.0" encoding="utf-8"?>'
                        '<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">'
                        '<s:Body>'
                        '<u:GetInfo xmlns:u="urn:dslforum-org:service:DeviceInfo:1"/>'
                        '</s:Body>'
                        '</s:Envelope>'
                    )
                    r_info = await client.post(
                        f"{base_url}/upnp/control/deviceinfo",
                        headers={
                            "Content-Type": 'text/xml; charset="utf-8"',
                            "SoapAction": "urn:dslforum-org:service:DeviceInfo:1#GetInfo",
                        },
                        content=dev_info_soap,
                    )
                    if r_info.status_code == 200:
                        root = ET.fromstring(r_info.text)
                        for elem in root.iter():
                            tag = elem.tag.split("}")[-1]
                            if tag == "NewModelName" and elem.text:
                                router_model = f"FRITZ!Box {elem.text}"
                            elif tag == "NewUpTime" and elem.text:
                                try:
                                    uptime_sec = int(elem.text)
                                except ValueError:
                                    pass
                except Exception as exc:
                    logger.debug("Recupero DeviceInfo FRITZ!Box fallito: %s", exc)

                # 2. Query Connected Hosts List (X_AVM-DE_GetHostList)
                try:
                    host_list_soap = (
                        '<?xml version="1.0" encoding="utf-8"?>'
                        '<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">'
                        '<s:Body>'
                        '<u:X_AVM-DE_GetHostList xmlns:u="urn:dslforum-org:service:Hosts:1"/>'
                        '</s:Body>'
                        '</s:Envelope>'
                    )
                    r_hosts = await client.post(
                        f"{base_url}/upnp/control/hosts",
                        headers={
                            "Content-Type": 'text/xml; charset="utf-8"',
                            "SoapAction": "urn:dslforum-org:service:Hosts:1#X_AVM-DE_GetHostList",
                        },
                        content=host_list_soap,
                    )

                    if r_hosts.status_code == 200:
                        raw_xml = r_hosts.text
                        # Extract inner XML payload from <NewX_AVM-DE_HostList>
                        match = re.search(r"<NewX_AVM-DE_HostList>(.*?)</NewX_AVM-DE_HostList>", raw_xml, re.DOTALL)
                        inner_xml = match.group(1) if match else raw_xml
                        # Unescape if HTML entities present
                        inner_xml = inner_xml.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")

                        try:
                            hosts_root = ET.fromstring(f"<root>{inner_xml}</root>")
                            for item in hosts_root.findall(".//Item"):
                                ip = (item.findtext("IPAddress") or "").strip()
                                mac = (item.findtext("MACAddress") or "").strip().lower()
                                name = (item.findtext("HostName") or "").strip()
                                active = (item.findtext("Active") or "0").strip()
                                iface_type = (item.findtext("InterfaceType") or "").strip()
                                speed = item.findtext("X_AVM-DE_Speed")

                                if active in ("1", "true", "True") and (ip or mac):
                                    is_wired = (iface_type.lower() != "802.11" and "wlan" not in iface_type.lower())
                                    connected_clients.append({
                                        "ip": ip,
                                        "mac": mac,
                                        "name": name or ip or mac,
                                        "hostname": name,
                                        "is_wired": is_wired,
                                        "link_speed": f"{speed} Mbps" if speed else None,
                                        "interface": iface_type or ("LAN" if is_wired else "Wi-Fi"),
                                    })
                        except Exception as parse_exc:
                            logger.debug("Parsing XML HostList FRITZ!Box fallito: %s", parse_exc)
                    elif r_hosts.status_code in (401, 500):
                        # Fallback for FritzOS older / alternative: query host by index loop (up to 16 devices)
                        try:
                            for idx in range(16):
                                get_generic = (
                                    '<?xml version="1.0" encoding="utf-8"?>'
                                    '<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">'
                                    '<s:Body>'
                                    '<u:GetGenericHostEntry xmlns:u="urn:dslforum-org:service:Hosts:1">'
                                    f'<NewIndex>{idx}</NewIndex>'
                                    '</u:GetGenericHostEntry>'
                                    '</s:Body>'
                                    '</s:Envelope>'
                                )
                                r_entry = await client.post(
                                    f"{base_url}/upnp/control/hosts",
                                    headers={
                                        "Content-Type": 'text/xml; charset="utf-8"',
                                        "SoapAction": "urn:dslforum-org:service:Hosts:1#GetGenericHostEntry",
                                    },
                                    content=get_generic,
                                )
                                if r_entry.status_code != 200:
                                    break
                                e_root = ET.fromstring(r_entry.text)
                                e_ip = (e_root.findtext(".//NewIPAddress") or "").strip()
                                e_mac = (e_root.findtext(".//NewMACAddress") or "").strip().lower()
                                e_name = (e_root.findtext(".//NewHostName") or "").strip()
                                e_active = (e_root.findtext(".//NewActive") or "0").strip()
                                e_iface = (e_root.findtext(".//NewInterfaceType") or "").strip()
                                if e_active in ("1", "true") and (e_ip or e_mac):
                                    is_wired = ("802.11" not in e_iface.lower() and "wlan" not in e_iface.lower())
                                    connected_clients.append({
                                        "ip": e_ip,
                                        "mac": e_mac,
                                        "name": e_name or e_ip or e_mac,
                                        "hostname": e_name,
                                        "is_wired": is_wired,
                                        "interface": e_iface,
                                    })
                        except Exception:
                            pass
                except Exception as exc:
                    logger.debug("Chiamata Hosts FRITZ!Box fallita: %s", exc)

                # 3. Query WAN IP Connection
                try:
                    wan_soap = (
                        '<?xml version="1.0" encoding="utf-8"?>'
                        '<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">'
                        '<s:Body>'
                        '<u:GetInfo xmlns:u="urn:dslforum-org:service:WANIPConnection:1"/>'
                        '</s:Body>'
                        '</s:Envelope>'
                    )
                    r_wan = await client.post(
                        f"{base_url}/upnp/control/wanipconnection1",
                        headers={
                            "Content-Type": 'text/xml; charset="utf-8"',
                            "SoapAction": "urn:dslforum-org:service:WANIPConnection:1#GetInfo",
                        },
                        content=wan_soap,
                    )
                    if r_wan.status_code == 200:
                        wan_root = ET.fromstring(r_wan.text)
                        wan_info["external_ip"] = wan_root.findtext(".//NewExternalIPAddress") or None
                        wan_info["connection_status"] = wan_root.findtext(".//NewConnectionStatus") or "Connected"
                        wan_info["uptime"] = int(wan_root.findtext(".//NewUptime") or 0)
                except Exception as exc:
                    logger.debug("Chiamata WANIPConnection FRITZ!Box fallita: %s", exc)

            # Assemble observation
            details = {
                "model": router_model,
                "uptime": uptime_sec,
                "clients_count": len(connected_clients),
                "connected_clients": connected_clients,
                "wan": wan_info,
                "message": f"{router_model} online con {len(connected_clients)} client attivi rilevati via TR-064.",
            }

            result.observations.append(
                CollectorObservation(
                    status="ok",
                    value=len(connected_clients),
                    details=details,
                )
            )

        except Exception as exc:
            logger.warning("Connessione FRITZ!Box %s non riuscita: %s", base_url, exc)
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Impossibile comunicare con il FRITZ!Box ({base_url}): {exc}"},
                )
            )

        return result

