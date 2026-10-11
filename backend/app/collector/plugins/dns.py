"""DNS collector that resolves domains and discriminates resolver downtime vs upstream failure."""

import asyncio
import socket
import struct
import time
from typing import Any

from app.collector.base import (
    BaseCollector,
    CollectorObservation,
    CollectorResult,
)
from pydantic import BaseModel, Field


class DnsParams(BaseModel):
    server: str = "1.1.1.1"
    domain: str = "cloudflare.com"
    record_type: str = "A"
    timeout_seconds: float = Field(default=3.0, ge=0.5, le=10.0)
    reference_server: str = "1.1.1.1"


def build_dns_query(domain: str, query_id: int = 0x1234) -> bytes:
    """Build a standard DNS A-record query packet."""
    header = struct.pack("!HHHHHH", query_id, 0x0100, 1, 0, 0, 0)
    qname = b""
    for part in domain.strip(".").split("."):
        encoded = part.encode("ascii")
        qname += bytes([len(encoded)]) + encoded
    qname += b"\x00"
    question = qname + struct.pack("!HH", 1, 1)  # QTYPE=1 (A), QCLASS=1 (IN)
    return header + question


def parse_dns_response(data: bytes, query_id: int = 0x1234) -> tuple[int, int]:
    """Parse DNS response header, returning (rcode, ancount)."""
    if len(data) < 12:
        return (99, 0)  # Malformed
    resp_id, flags, _, ancount, _, _ = struct.unpack("!HHHHHH", data[:12])
    if resp_id != query_id:
        return (99, 0)
    rcode = flags & 0x000F
    return (rcode, ancount)


class DnsCollector(BaseCollector):
    """Monitors DNS resolution latency and discriminates resolver down vs upstream failure."""

    name = "dns"
    description = "Controllo risoluzione DNS con distinzione tra resolver non raggiungibile ed errore upstream."
    capabilities = ["dns", "dns_resolution", "latency"]
    param_schema = DnsParams

    async def collect(
        self,
        target_address: str | None,
        params: dict[str, Any],
        timeout_seconds: float = 5.0,
    ) -> CollectorResult:
        server = params.get("server") or target_address or "1.1.1.1"
        domain = params.get("domain") or params.get("query") or "cloudflare.com"
        timeout_sec = min(float(params.get("timeout_seconds", 3.0)), timeout_seconds)
        ref_server = params.get("reference_server", "1.1.1.1")

        # Step 1: Query target DNS server
        target_status, target_rtt, target_rcode = await self._send_dns_query(server, domain, timeout_sec)

        if target_status == "timeout":
            return CollectorResult(
                observations=[
                    CollectorObservation(
                        status="crit",
                        value=None,
                        details={
                            "server": server,
                            "domain": domain,
                            "error": f"Il resolver DNS {server} non risponde (timeout {timeout_sec}s).",
                            "diagnosis": "resolver_down",
                        },
                    )
                ]
            )

        if target_status == "error":
            return CollectorResult(
                observations=[
                    CollectorObservation(
                        status="crit",
                        value=None,
                        details={
                            "server": server,
                            "domain": domain,
                            "error": f"Errore di comunicazione o socket verso il server DNS {server}.",
                            "diagnosis": "resolver_error",
                        },
                    )
                ]
            )

        if target_rcode == 2:  # SERVFAIL
            # Test reference server to confirm if it's upstream ISP/Internet issue
            ref_status, _, ref_rcode = await self._send_dns_query(ref_server, domain, timeout_sec)
            upstream_msg = (
                "Upstream DNS falliti anche su resolver di riferimento."
                if ref_rcode != 0
                else "Resolver locale attivo ma fallisce l'inoltro agli upstream."
            )
            return CollectorResult(
                observations=[
                    CollectorObservation(
                        status="crit",
                        value=target_rtt,
                        details={
                            "server": server,
                            "domain": domain,
                            "rcode": "SERVFAIL",
                            "error": f"Errore server DNS (SERVFAIL): {upstream_msg}",
                            "diagnosis": "upstream_failure",
                        },
                    )
                ]
            )

        if target_rcode != 0:
            return CollectorResult(
                observations=[
                    CollectorObservation(
                        status="warn",
                        value=target_rtt,
                        details={
                            "server": server,
                            "domain": domain,
                            "rcode": target_rcode,
                            "error": f"Codice risposta DNS inatteso: {target_rcode}",
                        },
                    )
                ]
            )

        return CollectorResult(
            observations=[
                CollectorObservation(
                    status="ok",
                    value=target_rtt,
                    details={
                        "server": server,
                        "domain": domain,
                        "rtt_ms": target_rtt,
                        "rcode": "NOERROR",
                    },
                )
            ]
        )

    async def _send_dns_query(self, server: str, domain: str, timeout_sec: float) -> tuple[str, float | None, int]:
        """Send UDP DNS query asynchronously via worker thread for full compatibility with uvloop and default event loops."""
        return await asyncio.to_thread(self._sync_dns_query, server, domain, timeout_sec)

    def _sync_dns_query(self, server: str, domain: str, timeout_sec: float) -> tuple[str, float | None, int]:
        """Synchronous UDP query execution using standard blocking sockets with timeout."""
        query_id = 0x5678
        pkt = build_dns_query(domain, query_id)
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(timeout_sec)
        t0 = time.time()
        try:
            sock.sendto(pkt, (server, 53))
            data, _ = sock.recvfrom(1024)
            rtt_ms = round((time.time() - t0) * 1000.0, 2)
            rcode, _ = parse_dns_response(data, query_id)
            return ("ok", rtt_ms, rcode)
        except TimeoutError:
            return ("timeout", None, -1)
        except Exception:
            return ("error", None, -1)
        finally:
            sock.close()

