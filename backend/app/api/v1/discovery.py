"""Network discovery and fast device reachability probing."""

import asyncio
import logging
import platform
import re
import socket
import struct
import subprocess

from app.collector.plugins.ping import PingCollector
from app.config import settings
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/discovery", tags=["Discovery"])
logger = logging.getLogger("netsentinel.discovery")


class PingProbeRequest(BaseModel):
    target: str = Field(..., description="IP address or hostname to probe")
    timeout_seconds: float = Field(default=1.5, ge=0.2, le=5.0)


class PingProbeResponse(BaseModel):
    target: str
    reachable: bool
    rtt_ms: float | None = None
    message: str | None = None


class DiscoveredDevice(BaseModel):
    id: str
    name: str
    kind: str
    ip: str
    mac: str | None = None
    roles: list[str] = Field(default_factory=list)
    location: str = "LAN"
    reachable: bool = True
    rtt_ms: float | None = None
    is_gateway: bool = False
    is_vantage_point: bool = False


class NetworkScanResponse(BaseModel):
    subnet: str | None = None
    gateway_ip: str | None = None
    local_ip: str | None = None
    devices: list[DiscoveredDevice] = Field(default_factory=list)


def _get_local_ip() -> str:
    """Detect local outbound IP address without generating network traffic."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def _get_default_gateway() -> str | None:
    """Find default gateway IP address on Linux or macOS."""
    system = platform.system()
    if system == "Linux":
        try:
            with open("/proc/net/route") as f:
                for line in f:
                    fields = line.strip().split()
                    if len(fields) >= 3 and fields[1] == "00000000":
                        gw_hex = fields[2]
                        return socket.inet_ntoa(struct.pack("<L", int(gw_hex, 16)))
        except Exception as e:
            logger.debug("Failed to parse /proc/net/route: %s", e)

    try:
        if system == "Darwin":
            out = subprocess.check_output(["route", "-n", "get", "default"], text=True, timeout=1.0)
            m = re.search(r"gateway:\s*(\S+)", out)
            if m:
                return m.group(1)
        else:
            out = subprocess.check_output(["ip", "route", "show", "default"], text=True, timeout=1.0)
            m = re.search(r"default via (\S+)", out)
            if m:
                return m.group(1)
    except Exception as e:
        logger.debug("Failed to detect gateway via route/ip: %s", e)

    return None


def _get_arp_table() -> list[dict[str, str]]:
    """Retrieve ARP table entries with IP and MAC addresses."""
    entries: list[dict[str, str]] = []
    system = platform.system()

    if system == "Linux":
        try:
            with open("/proc/net/arp") as f:
                lines = f.readlines()[1:]  # skip header
                for line in lines:
                    parts = line.split()
                    if len(parts) >= 4 and parts[3] != "00:00:00:00:00:00":
                        ip = parts[0]
                        mac = parts[3].lower()
                        entries.append({"ip": ip, "mac": mac})
                if entries:
                    return entries
        except Exception as e:
            logger.debug("Failed reading /proc/net/arp: %s", e)

    try:
        out = subprocess.check_output(["arp", "-an"], text=True, timeout=1.5)
        for line in out.splitlines():
            m = re.search(r"\(([\d\.]+)\) at ([0-9a-fA-F:]+)", line)
            if m:
                ip = m.group(1)
                mac = m.group(2).lower()
                if mac != "(incomplete)" and not ip.startswith("169.254.") and not ip.startswith("224.") and not ip.endswith(".255"):
                    entries.append({"ip": ip, "mac": mac})
    except Exception as e:
        logger.debug("Failed running arp -an: %s", e)

    return entries


async def _probe_port(ip: str, port: int, timeout: float = 0.3) -> bool:
    """Check if a TCP port is open on a host."""
    try:
        conn = asyncio.open_connection(ip, port)
        _, writer = await asyncio.wait_for(conn, timeout=timeout)
        writer.close()
        await writer.wait_closed()
        return True
    except Exception:
        return False


async def _ping_host(ip: str, timeout: float = 0.6) -> tuple[bool, float | None]:
    """Perform reachability ping using PingCollector."""
    try:
        collector = PingCollector()
        res = await collector.collect(
            target_address=ip,
            params={"count": 1, "timeout_seconds": timeout},
            timeout_seconds=timeout + 0.2,
        )
        if res.observations and res.observations[0].status == "ok":
            rtt = res.observations[0].value
            return True, float(rtt) if rtt is not None else None
    except Exception:
        pass

    # Quick TCP fallback on common ports
    for p in [80, 443, 22, 53]:
        if await _probe_port(ip, p, timeout=0.2):
            return True, 5.0

    return False, None


async def _resolve_hostname(ip: str) -> str | None:
    """Reverse resolve hostname asynchronously with strict timeout and clean formatting."""
    try:
        loop = asyncio.get_running_loop()
        name, _, _ = await asyncio.wait_for(
            loop.run_in_executor(None, socket.gethostbyaddr, ip),
            timeout=0.35,
        )
        if not name:
            return None
        # Strip common local domain extensions
        for suffix in [".lan", ".local", ".home", ".internal", ".broadband"]:
            if name.endswith(suffix):
                name = name[:-len(suffix)]
        # Filter out generic dashed IPs (e.g. 192-168-1-5 or host-872d7d60)
        if re.match(r"^\d+-\d+-\d+-\d+$", name) or re.match(r"^host-[0-9a-fA-F]+$", name):
            return None
        return name
    except Exception:
        return None


async def _detect_physical_gateway() -> tuple[str, str] | None:
    """Probes candidate home gateways to detect physical LAN when running in Docker bridge."""
    candidates = [
        "192.168.1.1",
        "192.168.0.1",
        "192.168.178.1",
        "192.168.2.1",
        "10.0.0.1",
        "10.0.1.1",
        "192.168.1.254",
    ]
    collector = PingCollector()

    async def check(gw_ip: str) -> str | None:
        try:
            res = await collector.collect(gw_ip, params={"count": 1, "timeout_seconds": 0.4})
            if res.observations and res.observations[0].status == "ok":
                return gw_ip
        except Exception:
            pass
        for port in [80, 443, 53, 8080]:
            if await _probe_port(gw_ip, port, timeout=0.25):
                return gw_ip
        return None

    results = await asyncio.gather(*[check(ip) for ip in candidates])
    for r in results:
        if r:
            prefix = ".".join(r.split(".")[:3])
            return r, f"{prefix}.0/24"
    return None


def _parse_subnet_prefix(sub: str) -> str:
    """Extract 3-octet subnet prefix from CIDR or IP (e.g. '192.168.1.0/24' -> '192.168.1')."""
    cleaned = sub.strip().split("/")[0]
    parts = cleaned.split(".")
    if len(parts) >= 3:
        return ".".join(parts[:3])
    return "192.168.1"


async def _analyze_device(
    ip: str,
    mac: str | None,
    gateway_ip: str | None,
    local_ip: str,
    semaphore: asyncio.Semaphore,
) -> DiscoveredDevice | None:
    """Analyze a single IP candidate to determine kind, name, roles and reachability."""
    async with semaphore:
        is_gw = bool(gateway_ip and ip == gateway_ip)
        is_local = (ip == local_ip)

        # Reachability test
        reachable, rtt = await _ping_host(ip, timeout=0.6)

        # Port checks in parallel
        ports_to_check = [53, 80, 443, 5000, 8006, 8123, 8080, 3493]
        open_ports = set()
        port_results = await asyncio.gather(
            *[_probe_port(ip, p, timeout=0.25) for p in ports_to_check],
            return_exceptions=True,
        )
        for p, result in zip(ports_to_check, port_results, strict=False):
            if result is True:
                open_ports.add(p)

        # Reverse DNS lookup
        hostname = await _resolve_hostname(ip)
        h = hostname or ""
        h_lower = h.lower()

        roles: list[str] = []

        # 1. Router / Gateway
        if is_gw or any(k in h_lower for k in ["router", "gateway", "udm", "fritz", "pfsense", "opnsense", "firewall"]):
            kind = "router"
            roles.extend(["gateway", "dhcp_server", "dns_resolver"])
            name = f"Router Gateway ({h})" if h else f"Router Gateway ({ip})"
            loc = "Ingresso / Rack"
        # 2. NetSentinel Host (the actual machine where NetSentinel is running)
        elif is_local:
            if any(k in h_lower for k in ["homeassistant", "hass"]) or 8123 in open_ports:
                kind = "smart_hub"
                name = "Home Assistant (Host NetSentinel)"
                loc = "Domotica"
            elif any(k in h_lower for k in ["synology", "qnap", "nas"]):
                kind = "nas"
                name = "NAS Storage (Host NetSentinel)"
                loc = "Storage / Rack"
            elif any(k in h_lower for k in ["mbp", "macbook"]):
                kind = "server"
                name = "MacBook Pro (Host NetSentinel)"
                loc = "Host NetSentinel"
            else:
                kind = "server"
                name = f"Host NetSentinel ({h})" if h else f"Host NetSentinel ({ip})"
                loc = "Host NetSentinel"
            roles.append("vantage_point")
        # 3. Dedicated Storage / NAS (storage only, never default to DNS resolver)
        elif any(k in h_lower for k in ["synology", "qnap", "truenas", "unraid", "diskstation"]) or (
            "nas" in h_lower and "homepod" not in h_lower
        ):
            kind = "nas"
            name = f"NAS Synology ({h})" if "synology" in h_lower else f"NAS Storage ({h or ip})"
            loc = "Storage / Rack"
        # 4. Networking Switch (ONLY explicit switch names, never default to switch)
        elif any(k in h_lower for k in ["switch", "netgear", "cisco", "usw", "edgeswitch", "tl-sg"]) or h_lower.startswith("sw-"):
            kind = "switch"
            name = f"Switch Netgear ({h})" if "netgear" in h_lower else f"Switch ({h or ip})"
            loc = "Rete"
        # 5. Wi-Fi Access Points (UniFi, Omada, etc.)
        elif any(k in h_lower for k in ["u7pro", "u6", "uap", "accesspoint", "eap", "wap"]) or (
            h_lower.startswith("ap-") or h_lower.endswith("-ap")
        ):
            kind = "access_point"
            name = f"Access Point UniFi ({h})" if ("u7" in h_lower or "u6" in h_lower or "unifi" in h_lower) else f"Access Point ({h or ip})"
            loc = "Wireless"
        # 6. Smart Home Hubs & Controllers
        elif any(k in h_lower for k in ["homeassistant", "hass", "tado", "bridge", "netatmo", "hue", "zigbee"]) or 8123 in open_ports:
            kind = "smart_hub"
            roles.append("service")
            name = "Home Assistant Hub" if ("homeassistant" in h_lower or "hass" in h_lower) else f"Smart Hub ({h or ip})"
            loc = "Domotica"
        # 7. IoT Devices: Smart Plugs, Tapparelle, Shelly, Dongles, Relays, Bulbs, Appliances
        elif any(k in h_lower for k in ["shelly", "tapparella", "plug", "meross", "dongle", "sonoff", "rele", "relay", "sensor", "presa", "lampadina", "bulb", "tuya", "smart"]):
            roles.append("passive_tracking")
            if "meross" in h_lower or "plug" in h_lower or "presa" in h_lower:
                kind = "smart_plug"
                name = f"Presa Smart ({h or ip})"
            elif "tapparella" in h_lower:
                kind = "client"
                name = f"Tapparella ({h})"
            elif "shelly" in h_lower:
                kind = "client"
                name = f"Modulo Shelly ({h})"
            elif "dongle" in h_lower:
                kind = "client"
                name = f"Dongle Zigbee/IoT ({h})"
            elif "sensor" in h_lower:
                kind = "sensor"
                name = f"Sensore IoT ({h or ip})"
            elif "bulb" in h_lower or "lampadina" in h_lower:
                kind = "client"
                name = f"Lampadina Smart ({h or ip})"
            else:
                kind = "client"
                name = f"Dispositivo IoT ({h or ip})"
            loc = "Domotica"
        # 8. Virtualization / Hypervisor Servers
        elif any(k in h_lower for k in ["proxmox", "pve", "esxi", "server"]) or 8006 in open_ports:
            kind = "server"
            name = f"Server Proxmox VE ({h})" if "proxmox" in h_lower else f"Server ({h or ip})"
            loc = "Server / Rack"
        # 9. UPS Power Supplies
        elif any(k in h_lower for k in ["ups", "apc", "eaton", "nut"]) or 3493 in open_ports:
            kind = "ups"
            roles.append("power_provider")
            name = f"UPS Gruppo Continuità ({h or ip})"
            loc = "Alimentazione"
        # 10. Apple HomePod & Audio
        elif "homepod" in h_lower:
            kind = "client"
            name = f"Apple HomePod ({h})"
            loc = "Audio / Salotto"
        # 11. Computers, Laptops & Workstations
        elif any(k in h_lower for k in ["mbp", "macbook", "imac", "mac-mini", "laptop", "notebook", "pc-", "desktop", "workstation"]):
            kind = "client"
            name = f"MacBook Pro ({h})" if any(k in h_lower for k in ["mbp", "macbook"]) else (f"iMac ({h})" if "imac" in h_lower else f"Computer ({h or ip})")
            loc = "Studio"
        # 12. Mobile / Wearable Clients
        elif any(k in h_lower for k in ["iphone", "ipad", "watch", "phone"]):
            kind = "client"
            name = h.replace("-", " ").title() if h else f"Mobile {ip}"
            loc = "Mobile"
        # 12. Smart TVs & Streaming Devices
        elif any(k in h_lower for k in ["tv", "webos", "bravia", "chromecast", "firetv", "shield"]):
            kind = "client"
            name = f"Smart TV ({h or ip})"
            loc = "Salotto"
        # 13. Smart Appliances & Generic Personal Devices
        elif any(k in h_lower for k in ["air-di", "z-fold", "galaxy", "pixel", "samsung", "dishwasher", "refrigerator", "washer"]):
            kind = "client"
            name = h.replace("-", " ").title() if h else f"Dispositivo {ip}"
            loc = "Casa"
        # 14. DEFAULT: Client / Workstation (Never default to switch!)
        else:
            kind = "client"
            name = h if h else f"Client {ip}"
            loc = "LAN"

        # Unique ID
        dev_id = f"dev-{ip.replace('.', '-')}"

        return DiscoveredDevice(
            id=dev_id,
            name=name,
            kind=kind,
            ip=ip,
            mac=mac,
            roles=list(dict.fromkeys(roles)),
            location=loc,
            reachable=reachable,
            rtt_ms=rtt,
            is_gateway=is_gw,
            is_vantage_point=is_local,
        )


@router.get("/scan", response_model=NetworkScanResponse, summary="Scansione automatica apparati di rete")
async def scan_network(
    subnet: str | None = Query(default=None, description="Subnet da scansionare (es. 192.168.1.0/24)")
) -> NetworkScanResponse:
    """Scans the network, discovers active devices via concurrent ping sweeps and service analysis."""
    local_ip = _get_local_ip()
    gateway_ip = _get_default_gateway()

    target_subnet_str = subnet or settings.subnet
    is_docker_bridge = local_ip.startswith("172.") or local_ip.startswith("127.") or local_ip.startswith("10.0.2.")

    # Auto-detect physical LAN gateway when running inside Docker bridge
    detected_gw = None
    if not target_subnet_str and is_docker_bridge:
        res = await _detect_physical_gateway()
        if res:
            detected_gw, target_subnet_str = res
            gateway_ip = detected_gw
            logger.info("Auto-detected physical LAN gateway %s and subnet %s from Docker bridge", gateway_ip, target_subnet_str)

    if target_subnet_str:
        prefix = _parse_subnet_prefix(target_subnet_str)
        subnet_cidr = f"{prefix}.0/24"
        if not gateway_ip or (is_docker_bridge and gateway_ip.startswith("172.")):
            gateway_ip = detected_gw or f"{prefix}.1"
    elif local_ip and "." in local_ip:
        prefix = ".".join(local_ip.split(".")[:3])
        subnet_cidr = f"{prefix}.0/24"
    else:
        prefix = "192.168.1"
        subnet_cidr = "192.168.1.0/24"

    # Fast ping sweep across target subnet
    sweep_sem = asyncio.Semaphore(80)
    collector = PingCollector()
    alive_ips: dict[str, float | None] = {}

    async def _sweep_ping(ip: str) -> None:
        async with sweep_sem:
            try:
                res = await collector.collect(ip, params={"count": 1, "timeout_seconds": 0.5})
                if res.observations and res.observations[0].status == "ok":
                    rtt = res.observations[0].value
                    alive_ips[ip] = float(rtt) if rtt is not None else None
            except Exception:
                pass

    sweep_tasks = [_sweep_ping(f"{prefix}.{i}") for i in range(1, 255)]
    await asyncio.gather(*sweep_tasks)

    # Candidates dictionary (IP -> MAC)
    candidates: dict[str, str | None] = {ip: None for ip in alive_ips}

    if gateway_ip:
        candidates[gateway_ip] = None

    # Retrieve ARP table entries (useful if host network or local ARP cache has them)
    arp_entries = _get_arp_table()
    for entry in arp_entries:
        ip = entry["ip"]
        mac = entry.get("mac")
        if ip.startswith(f"{prefix}."):
            candidates[ip] = mac

    # Filter out internal Docker bridge IPs if we are scanning a physical subnet
    if is_docker_bridge and not prefix.startswith("172."):
        candidates.pop(local_ip, None)
        if gateway_ip and gateway_ip.startswith("172."):
            candidates.pop(gateway_ip, None)

    # Analyze all candidate devices concurrently
    analyze_sem = asyncio.Semaphore(25)
    analyze_tasks = [
        _analyze_device(ip, mac, gateway_ip, local_ip, analyze_sem)
        for ip, mac in candidates.items()
    ]
    results = await asyncio.gather(*analyze_tasks, return_exceptions=True)

    discovered: list[DiscoveredDevice] = []
    for r in results:
        if isinstance(r, DiscoveredDevice):
            # Only keep devices that are reachable or gateway
            if r.reachable or r.is_gateway or r.is_vantage_point or (r.mac and r.mac != "(incomplete)"):
                discovered.append(r)

    # If running in Docker bridge and an MBP/host machine exists, mark it as vantage point candidate
    if is_docker_bridge:
        host_candidate = next((d for d in discovered if any(k in d.name.lower() for k in ["mbp", "macbook", "host", "nas", "synology"])), None)
        if host_candidate and not any(d.is_vantage_point for d in discovered):
            host_candidate.is_vantage_point = True
            if "vantage_point" not in host_candidate.roles:
                host_candidate.roles.append("vantage_point")

    # Enforce SINGLETON invariants: exactly at most one vantage_point, dns_resolver, and dhcp_server
    vp_devices = [d for d in discovered if "vantage_point" in d.roles or d.is_vantage_point]
    if len(vp_devices) > 1:
        primary_vp = next((d for d in vp_devices if d.is_vantage_point), vp_devices[0])
        for d in vp_devices:
            if d.id != primary_vp.id:
                d.is_vantage_point = False
                if "vantage_point" in d.roles:
                    d.roles.remove("vantage_point")

    dns_devices = [d for d in discovered if "dns_resolver" in d.roles]
    if len(dns_devices) > 1:
        primary_dns = next((d for d in dns_devices if d.is_gateway), dns_devices[0])
        for d in dns_devices:
            if d.id != primary_dns.id:
                if "dns_resolver" in d.roles:
                    d.roles.remove("dns_resolver")

    dhcp_devices = [d for d in discovered if "dhcp_server" in d.roles]
    if len(dhcp_devices) > 1:
        primary_dhcp = next((d for d in dhcp_devices if d.is_gateway), dhcp_devices[0])
        for d in dhcp_devices:
            if d.id != primary_dhcp.id:
                if "dhcp_server" in d.roles:
                    d.roles.remove("dhcp_server")

    # Sort devices logically: Gateway -> Vantage Point -> Switch -> AP -> NAS -> Server -> UPS -> Smart Hub -> Clients
    def sort_key(d: DiscoveredDevice) -> tuple[int, str]:
        if d.is_gateway:
            return (0, d.ip)
        if d.is_vantage_point:
            return (1, d.ip)
        order = {
            "switch": 2,
            "access_point": 3,
            "nas": 4,
            "server": 5,
            "ups": 6,
            "smart_hub": 7,
            "client": 8,
        }
        return (order.get(d.kind, 9), d.ip)

    discovered.sort(key=sort_key)

    # Upstream Internet WAN Node
    wan_node = DiscoveredDevice(
        id="wan-internet-provider",
        name="Internet WAN",
        kind="wan_gateway",
        ip="1.1.1.1",
        mac=None,
        roles=["wan_provider"],
        location="Esterno / WAN",
        reachable=True,
        rtt_ms=None,
        is_gateway=False,
        is_vantage_point=False,
    )
    discovered.insert(0, wan_node)

    return NetworkScanResponse(
        subnet=subnet_cidr,
        gateway_ip=gateway_ip,
        local_ip=local_ip,
        devices=discovered,
    )


@router.post("/ping", response_model=PingProbeResponse, summary="Test ping rapido di raggiungibilità")
async def quick_ping(payload: PingProbeRequest) -> PingProbeResponse:
    """Performs an immediate reachability ping test against a target IP or hostname."""
    target = payload.target.strip()
    if not target:
        return PingProbeResponse(target=target, reachable=False, message="Indirizzo target mancante.")

    reachable, rtt = await _ping_host(target, timeout=payload.timeout_seconds)
    msg = f"Raggiungibile ({rtt:.1f} ms)" if reachable and rtt is not None else ("Raggiungibile" if reachable else "Nessuna risposta ICMP o TCP")
    return PingProbeResponse(
        target=target,
        reachable=reachable,
        rtt_ms=rtt,
        message=msg,
    )
