"""SNMP Bridge FDB collector plugin for NetSentinel (RFC 4188 / RFC 1493).

Interrogates managed switches (Netgear, D-Link, Zyxel, Cisco, TP-Link, etc.)
via standard Bridge MIB to extract learned MAC forwarding tables (MAC -> Port).
"""

import asyncio
import logging
from typing import Any

from app.collector.base import (
    BaseCollector,
    CollectorObservation,
    CollectorResult,
)
from app.collector.plugins.snmp import (
    _encode_integer,
    _encode_oid,
    _encode_string,
    _encode_tlv,
    build_snmp_get_packet,
    parse_snmp_response,
)

logger = logging.getLogger("netsentinel.collector.snmp_bridge")


def build_snmp_getnext_packet(community: str, oid_str: str, request_id: int = 1) -> bytes:
    """Build a standard SNMP v2c GetNextRequest packet (tag 0xA1)."""
    varbind = _encode_tlv(0x30, _encode_oid(oid_str) + bytes([0x05, 0x00]))
    varbind_list = _encode_tlv(0x30, varbind)

    pdu_payload = (
        _encode_integer(request_id)
        + _encode_integer(0)
        + _encode_integer(0)
        + varbind_list
    )
    pdu = _encode_tlv(0xA1, pdu_payload)

    version = _encode_integer(1)
    comm = _encode_string(community)
    return _encode_tlv(0x30, version + comm + pdu)


def parse_snmp_response_with_oid(data: bytes) -> tuple[int, str | None, Any]:
    """Parse SNMP response and extract (error_status, returned_oid, value)."""
    if len(data) < 10:
        return 1, None, None
    try:
        idx = 0
        returned_oid = None
        while idx < len(data) - 4:
            if data[idx] == 0x06:  # OID tag
                oid_len = data[idx + 1]
                oid_bytes = data[idx + 2 : idx + 2 + oid_len]
                # Decode OID
                if oid_bytes:
                    oid_parts = [str(oid_bytes[0] // 40), str(oid_bytes[0] % 40)]
                    cur = 0
                    for b in oid_bytes[1:]:
                        cur = (cur << 7) | (b & 0x7F)
                        if not (b & 0x80):
                            oid_parts.append(str(cur))
                            cur = 0
                    returned_oid = ".".join(oid_parts)

                val_idx = idx + 2 + oid_len
                if val_idx < len(data) - 1:
                    val_tag = data[val_idx]
                    val_len = data[val_idx + 1]
                    val_bytes = data[val_idx + 2 : val_idx + 2 + val_len]
                    if val_tag == 0x43:  # TimeTicks
                        return 0, returned_oid, int.from_bytes(val_bytes, "big")
                    elif val_tag in (0x02, 0x41, 0x42):  # Integer / Counter
                        return 0, returned_oid, int.from_bytes(val_bytes, "big", signed=(val_tag == 0x02))
                    elif val_tag == 0x04:  # OctetString
                        return 0, returned_oid, val_bytes.decode("ascii", errors="replace")
            idx += 1
        return 0, returned_oid, "OK"
    except Exception:
        return 1, None, None


class SnmpBridgeCollector(BaseCollector):
    """Universal Managed Switch collector using SNMP Bridge MIB (RFC 4188 / 1493)."""

    name = "snmp_bridge"
    description = "Interroga switch gestiti (Netgear, D-Link, Cisco, Zyxel, ecc.) via SNMP Bridge MIB per mappare MAC alle porte fisiche"
    capabilities = ["device_status", "mac_table", "port_status", "poe_status"]

    async def collect(
        self,
        target_address: str | None,
        params: dict[str, Any],
        timeout_seconds: float = 5.0,
    ) -> CollectorResult:
        result = CollectorResult()
        host = (params.get("host") or target_address or "").strip()
        port = int(params.get("port", 161))
        community = (params.get("community") or "public").strip()

        if not host:
            result.observations.append(
                CollectorObservation(
                    status="unknown",
                    details={"error": "Nessun target IP specificato per switch SNMP Bridge."},
                )
            )
            return result

        loop = asyncio.get_running_loop()

        async def send_snmp_query(packet: bytes) -> bytes | None:
            on_reply = loop.create_future()

            class UdpProtocol(asyncio.DatagramProtocol):
                def connection_made(self, transport):
                    self.transport = transport
                    try:
                        transport.sendto(packet)
                    except Exception as err:
                        if not on_reply.done():
                            on_reply.set_exception(err)

                def datagram_received(self, data, addr):
                    if not on_reply.done():
                        on_reply.set_result(data)

                def error_received(self, exc):
                    if not on_reply.done():
                        on_reply.set_exception(exc)

            try:
                transport, protocol = await loop.create_datagram_endpoint(
                    lambda: UdpProtocol(),
                    remote_addr=(host, port),
                )
                try:
                    data = await asyncio.wait_for(on_reply, timeout=min(timeout_seconds, 2.5))
                    return data
                finally:
                    transport.close()
            except Exception as exc:
                logger.debug("SNMP query to %s:%s failed: %s", host, port, exc)
                return None

        # 1. Query sysDescr (1.3.6.1.2.1.1.1.0) and sysName (1.3.6.1.2.1.1.5.0)
        sys_descr = "Managed Switch"
        sys_name = ""
        uptime_val = None

        pkt_descr = build_snmp_get_packet(community, "1.3.6.1.2.1.1.1.0", request_id=101)
        resp_descr = await send_snmp_query(pkt_descr)
        if resp_descr:
            err, val = parse_snmp_response(resp_descr)
            if err == 0 and val:
                sys_descr = str(val).split("\r")[0].split("\n")[0].strip()

        pkt_name = build_snmp_get_packet(community, "1.3.6.1.2.1.1.5.0", request_id=102)
        resp_name = await send_snmp_query(pkt_name)
        if resp_name:
            err, val = parse_snmp_response(resp_name)
            if err == 0 and val:
                sys_name = str(val).strip()

        pkt_uptime = build_snmp_get_packet(community, "1.3.6.1.2.1.1.3.0", request_id=103)
        resp_uptime = await send_snmp_query(pkt_uptime)
        if resp_uptime:
            err, val = parse_snmp_response(resp_uptime)
            if err == 0 and val is not None:
                uptime_val = int(val) // 100

        # If switch didn't respond to basic SNMP, report error
        if not resp_descr and not resp_name and not resp_uptime:
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Nessuna risposta SNMP ricevuta dallo switch ({host}:{port}, community '{community}')."},
                )
            )
            return result

        # 2. Walk dot1dTpFdbPort (1.3.6.1.2.1.17.4.3.1.2) to extract learned MACs -> Ports
        # dot1dTpFdbPort OID is 1.3.6.1.2.1.17.4.3.1.2.<m1>.<m2>.<m3>.<m4>.<m5>.<m6>
        fdb_prefix = "1.3.6.1.2.1.17.4.3.1.2"
        current_oid = fdb_prefix
        connected_clients: list[dict[str, Any]] = []

        for req_id in range(200, 240):  # limit walk to 40 entries for speed and responsiveness
            pkt_next = build_snmp_getnext_packet(community, current_oid, request_id=req_id)
            resp_next = await send_snmp_query(pkt_next)
            if not resp_next:
                break
            err, ret_oid, port_val = parse_snmp_response_with_oid(resp_next)
            if err != 0 or not ret_oid or not ret_oid.startswith(fdb_prefix):
                break
            # Extract 6 MAC bytes from returned OID suffix
            suffix = ret_oid[len(fdb_prefix):].strip(".").split(".")
            if len(suffix) >= 6:
                try:
                    mac_bytes = [int(p) for p in suffix[-6:]]
                    mac_str = ":".join(f"{b:02x}" for b in mac_bytes)
                    port_num = int(port_val) if isinstance(port_val, int) else port_val
                    connected_clients.append({
                        "mac": mac_str,
                        "ip": "",  # To be correlated with ARP / DHCP
                        "name": f"Client MAC {mac_str[-8:]}",
                        "is_wired": True,
                        "port": f"Porta {port_num}" if port_num else None,
                        "interface": f"Port {port_num}",
                    })
                except Exception:
                    pass
            current_oid = ret_oid

        # Check if user provided manual port overrides or device hints
        manual_ports = params.get("known_ports", {})
        for c in connected_clients:
            if c["mac"] in manual_ports:
                c["port"] = manual_ports[c["mac"]]

        model = sys_name or sys_descr or "Switch Gestito SNMP"
        details = {
            "model": model,
            "sys_descr": sys_descr,
            "uptime": uptime_val,
            "clients_count": len(connected_clients),
            "connected_clients": connected_clients,
            "message": f"{model}: {len(connected_clients)} indirizzi MAC rilevati nella tabella di inoltro (FDB).",
        }

        result.observations.append(
            CollectorObservation(
                status="ok",
                value=len(connected_clients),
                details=details,
            )
        )

        return result

