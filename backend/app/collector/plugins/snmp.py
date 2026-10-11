"""SNMP (v1/v2c) collector plugin for NetSentinel with native async UDP packet codec."""

import asyncio
import logging
from typing import Any

from app.collector.base import (
    BaseCollector,
    CollectorObservation,
    CollectorResult,
    DiscoveredItem,
)

logger = logging.getLogger("netsentinel.collector.snmp")


def _encode_length(length: int) -> bytes:
    if length < 0x80:
        return bytes([length])
    len_bytes = []
    while length > 0:
        len_bytes.insert(0, length & 0xFF)
        length >>= 8
    return bytes([0x80 | len(len_bytes)]) + bytes(len_bytes)


def _encode_tlv(tag: int, value: bytes) -> bytes:
    return bytes([tag]) + _encode_length(len(value)) + value


def _encode_integer(val: int) -> bytes:
    if val == 0:
        return _encode_tlv(0x02, bytes([0]))
    b = []
    temp = val
    while temp > 0:
        b.insert(0, temp & 0xFF)
        temp >>= 8
    if b[0] & 0x80:
        b.insert(0, 0)
    return _encode_tlv(0x02, bytes(b))


def _encode_string(val: str) -> bytes:
    return _encode_tlv(0x04, val.encode("ascii", errors="replace"))


def _encode_oid(oid_str: str) -> bytes:
    parts = [int(p) for p in oid_str.strip(".").split(".")]
    if len(parts) < 2:
        return _encode_tlv(0x06, b"")
    # First sub-identifier: 40 * X + Y
    encoded = [40 * parts[0] + parts[1]]
    for p in parts[2:]:
        if p == 0:
            encoded.append(0)
            continue
        sub = []
        temp = p
        while temp > 0:
            sub.insert(0, (temp & 0x7F) | (0x80 if sub else 0x00))
            temp >>= 7
        encoded.extend(sub)
    return _encode_tlv(0x06, bytes(encoded))


def build_snmp_get_packet(community: str, oid_str: str, request_id: int = 1) -> bytes:
    """Build a standard SNMP v2c GetRequest packet."""
    # VarBind: SEQUENCE { OID, NULL }
    varbind = _encode_tlv(0x30, _encode_oid(oid_str) + bytes([0x05, 0x00]))
    varbind_list = _encode_tlv(0x30, varbind)

    # GetRequest-PDU (tag 0xA0)
    pdu_payload = (
        _encode_integer(request_id)
        + _encode_integer(0)  # error-status = 0
        + _encode_integer(0)  # error-index = 0
        + varbind_list
    )
    pdu = _encode_tlv(0xA0, pdu_payload)

    # SNMP Message: SEQUENCE { version (1 = v2c), community, pdu }
    version = _encode_integer(1)  # 1 for SNMP v2c
    comm = _encode_string(community)
    return _encode_tlv(0x30, version + comm + pdu)


def parse_snmp_response(data: bytes) -> tuple[int, Any]:
    """Parse minimal SNMP response and extract (error_status, value)."""
    if len(data) < 10:
        return 1, None
    try:
        # Find OID tag (0x06) in the VarBind structure
        idx = 0
        while idx < len(data) - 4:
            if data[idx] == 0x06:  # OID tag
                oid_len = data[idx + 1]
                val_idx = idx + 2 + oid_len
                if val_idx < len(data) - 1:
                    val_tag = data[val_idx]
                    val_len = data[val_idx + 1]
                    val_bytes = data[val_idx + 2 : val_idx + 2 + val_len]
                    if val_tag == 0x43:  # TimeTicks
                        return 0, int.from_bytes(val_bytes, "big")
                    elif val_tag in (0x02, 0x41, 0x42):  # Integer / Counter
                        return 0, int.from_bytes(val_bytes, "big", signed=(val_tag == 0x02))
                    elif val_tag == 0x04:  # OctetString
                        return 0, val_bytes.decode("ascii", errors="replace")
            idx += 1
        return 0, "OK"
    except Exception:
        return 1, None


class SnmpCollector(BaseCollector):
    """Collector for SNMP-enabled network devices (switches, routers, NAS)."""

    name = "snmp"
    description = "Interroga parametri SNMP (uptime, descrizione, stato interfacce) via protocollo UDP 161"
    capabilities = ["uptime", "interface_status", "system_info", "discovery"]

    async def collect(
        self,
        target_address: str | None,
        params: dict[str, Any],
        timeout_seconds: float = 3.0,
    ) -> CollectorResult:
        result = CollectorResult()
        host = target_address or params.get("host")
        port = int(params.get("port", 161))
        community = params.get("community", "public")
        oid = params.get("oid", "1.3.6.1.2.1.1.3.0")  # Default: sysUpTime

        if not host:
            result.observations.append(
                CollectorObservation(
                    status="unknown",
                    details={"error": "Nessun target IP specificato per controllo SNMP."},
                )
            )
            return result

        packet = build_snmp_get_packet(community, oid, request_id=42)

        loop = asyncio.get_running_loop()
        on_con_lost = loop.create_future()

        class SnmpProtocol(asyncio.DatagramProtocol):
            def __init__(self):
                self.transport = None
                self.received_data = None

            def connection_made(self, transport):
                self.transport = transport
                self.transport.sendto(packet)

            def datagram_received(self, data, addr):
                self.received_data = data
                if not on_con_lost.done():
                    on_con_lost.set_result(data)

            def error_received(self, exc):
                if not on_con_lost.done():
                    on_con_lost.set_exception(exc)

        try:
            transport, protocol = await loop.create_datagram_endpoint(
                SnmpProtocol,
                remote_addr=(host, port),
            )
            try:
                raw_resp = await asyncio.wait_for(on_con_lost, timeout=timeout_seconds)
                err, value = parse_snmp_response(raw_resp)
                if err == 0 and value is not None:
                    # If sysUpTime, value is in hundredths of a second (centiseconds)
                    is_timeticks = isinstance(value, int) and "1.3.6.1.2.1.1.3.0" in oid
                    uptime_seconds = (value / 100.0) if is_timeticks else None

                    details: dict[str, Any] = {
                        "oid": oid,
                        "raw_value": str(value),
                        "host": host,
                    }
                    if uptime_seconds is not None:
                        details["uptime_seconds"] = uptime_seconds

                    result.observations.append(
                        CollectorObservation(
                            status="ok",
                            value=float(uptime_seconds if uptime_seconds is not None else 1.0),
                            details=details,
                        )
                    )
                else:
                    result.observations.append(
                        CollectorObservation(
                            status="warn",
                            details={"error": "Risposta SNMP non decodificabile o codice errore presente."},
                        )
                    )
            finally:
                transport.close()

        except TimeoutError:
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Timeout risposta SNMP da {host}:{port} ({timeout_seconds}s)."},
                )
            )
        except Exception as exc:
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Errore UDP SNMP: {str(exc)}"},
                )
            )

        return result

    async def discover(self, params: dict[str, Any]) -> list[DiscoveredItem]:
        """Optionally probe device sysDescr."""
        return []
