"""Network discovery and fast device reachability probing."""

import asyncio
import logging
import platform
import re
import socket
import struct
import subprocess

from app.collector.plugins.ping import PingCollector
from fastapi import APIRouter
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
        # Use -an to avoid DNS lookups
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


async def _ping_host(ip: str, timeout: float = 1.0) -> tuple[bool, float | None]:
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

    # Quick TCP fallback on common web/ssh/dns ports
    for p in [80, 443, 22, 53]:
        if await _probe_port(ip, p, timeout=0.3):
            return True, 5.0

    return False, None


async def _resolve_hostname(ip: str) -> str | None:
    """Reverse resolve hostname asynchronously with strict timeout."""
    try:
        loop = asyncio.get_running_loop()
        name, _, _ = await asyncio.wait_for(
            loop.run_in_executor(None, socket.gethostbyaddr, ip),
            timeout=0.35,
        )
        # Strip trailing .lan, .local, etc. if clean
        if name and "." in name:
            short = name.split(".")[0]
            if len(short) > 2:
                return short
        return name
    except Exception:
        return None


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

        # Reachability
        reachable, rtt = await _ping_host(ip, timeout=0.8)

        # Port checks in parallel
        ports_to_check = [53, 80, 443, 5000, 8006, 8123, 8080, 3493]
        open_ports = set()
        port_results = await asyncio.gather(
            *[_probe_port(ip, p, timeout=0.3) for p in ports_to_check],
            return_exceptions=True,
        )
        for p, result in zip(ports_to_check, port_results, strict=False):
            if result is True:
                open_ports.add(p)

        # Reverse DNS lookup
        hostname = await _resolve_hostname(ip)

        roles: list[str] = []
        if 53 in open_ports:
            roles.append("dns_resolver")

        # Determine device kind and friendly name
        if is_gw:
            kind = "router"
            roles.extend(["gateway", "dhcp_server"])
            if "dns_resolver" not in roles:
                roles.append("dns_resolver")
            name = hostname or "Router Gateway"
            loc = "Ingresso / Rack"
        elif is_local:
            # NetSentinel Host
            if 5000 in open_ports:
                kind = "nas"
                name = hostname or "NAS Synology (Host NetSentinel)"
            else:
                kind = "server"
                name = hostname or "Server NetSentinel (Host)"
            roles.append("vantage_point")
            loc = "Rack Salotto"
        elif 5000 in open_ports:
            kind = "nas"
            name = hostname or f"NAS Storage ({ip})"
            loc = "Storage / Rack"
        elif 8006 in open_ports:
            kind = "server"
            name = hostname or f"Server Proxmox VE ({ip})"
            loc = "Server / Rack"
        elif 8123 in open_ports:
            kind = "smart_hub"
            name = hostname or "Home Assistant Hub"
            roles.append("service")
            loc = "Domotica"
        elif 3493 in open_ports:
            kind = "ups"
            name = hostname or "UPS Gruppo Continuità"
            roles.append("power_provider")
            loc = "Alimentazione"
        elif 8080 in open_ports:
            kind = "access_point"
            name = hostname or f"Access Point Wi-Fi ({ip})"
            loc = "Wireless"
        elif 80 in open_ports or 443 in open_ports:
            # Could be switch, smart plug, or web device
            kind = "switch"
            name = hostname or f"Switch / Web Device ({ip})"
            loc = "Rete"
        else:
            kind = "client"
            name = hostname or f"Dispositivo {ip}"
            loc = "LAN"

        # Unique ID
        dev_id = f"dev-{ip.replace('.', '-')}"

        return DiscoveredDevice(
            id=dev_id,
            name=name,
            kind=kind,
            ip=ip,
            mac=mac,
            roles=list(dict.fromkeys(roles)),  # deduplicate
            location=loc,
            reachable=reachable,
            rtt_ms=rtt,
            is_gateway=is_gw,
            is_vantage_point=is_local,
        )


@router.get("/scan", response_model=NetworkScanResponse, summary="Scansione automatica apparati di rete")
async def scan_network() -> NetworkScanResponse:
    """Scans the local network, discovers active devices via ARP table, routing, and concurrent reachability probes."""
    local_ip = _get_local_ip()
    gateway_ip = _get_default_gateway()

    subnet = None
    if local_ip and "." in local_ip:
        prefix = ".".join(local_ip.split(".")[:3])
        subnet = f"{prefix}.0/24"
    else:
        prefix = "192.168.1"
        subnet = "192.168.1.0/24"

    # Collect IP candidates from Gateway, Local host, and ARP table
    candidates: dict[str, str | None] = {}

    if gateway_ip:
        candidates[gateway_ip] = None
    if local_ip and local_ip != "127.0.0.1":
        candidates[local_ip] = None

    # Retrieve ARP table entries
    arp_entries = _get_arp_table()
    for entry in arp_entries:
        ip = entry["ip"]
        mac = entry.get("mac")
        if ip not in candidates:
            candidates[ip] = mac

    # If ARP table has few entries, probe common IPs on the subnet to populate
    if len(candidates) < 4:
        common_hosts = [1, 2, 3, 4, 10, 20, 50, 60, 70, 80, 100, 200, 254]
        for host in common_hosts:
            candidate_ip = f"{prefix}.{host}"
            if candidate_ip not in candidates:
                candidates[candidate_ip] = None

    semaphore = asyncio.Semaphore(15)
    tasks = [
        _analyze_device(ip, mac, gateway_ip, local_ip, semaphore)
        for ip, mac in candidates.items()
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    discovered: list[DiscoveredDevice] = []
    for r in results:
        if isinstance(r, DiscoveredDevice):
            # Only keep devices that are reachable, or are gateway/local, or have a valid MAC
            if r.reachable or r.is_gateway or r.is_vantage_point or (r.mac and r.mac != "(incomplete)"):
                discovered.append(r)

    # Sort logically: Gateway first, then Vantage Point, then Infrastructure (Switch/AP), then Servers, then Clients
    def sort_key(d: DiscoveredDevice) -> tuple[int, str]:
        if d.is_gateway:
            return (0, d.ip)
        if d.is_vantage_point:
            return (1, d.ip)
        order = {"switch": 2, "access_point": 3, "nas": 4, "server": 5, "ups": 6, "smart_hub": 7, "client": 8}
        return (order.get(d.kind, 9), d.ip)

    discovered.sort(key=sort_key)

    # Upstream Internet WAN Node if gateway exists
    if gateway_ip:
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
        subnet=subnet,
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
