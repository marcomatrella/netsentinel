"""NUT (Network UPS Tools) collector plugin for NetSentinel."""

import asyncio
import logging
from typing import Any

from app.collector.base import (
    BaseCollector,
    CollectorEvent,
    CollectorObservation,
    CollectorResult,
    DiscoveredItem,
)

logger = logging.getLogger("netsentinel.collector.nut")


class NutCollector(BaseCollector):
    """Collector for Network UPS Tools (NUT) daemon over TCP port 3493."""

    name = "nut"
    description = "Interroga lo stato di carica, alimentazione di rete e blackout da daemon NUT (UPS)"
    capabilities = ["ups_status", "battery_charge", "runtime", "power_events", "discovery"]

    async def _send_nut_cmd(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        cmd: str,
        timeout: float = 3.0,
    ) -> str:
        """Send a single text command to NUT upsd and return line response."""
        writer.write(f"{cmd}\n".encode())
        await writer.drain()
        line = await asyncio.wait_for(reader.readline(), timeout=timeout)
        return line.decode("utf-8", errors="replace").strip()

    async def collect(
        self,
        target_address: str | None,
        params: dict[str, Any],
        timeout_seconds: float = 5.0,
    ) -> CollectorResult:
        result = CollectorResult()
        host = params.get("host", target_address or "127.0.0.1")
        port = int(params.get("port", 3493))
        ups_name = params.get("ups_name", "ups")

        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(host, port),
                timeout=timeout_seconds,
            )
        except Exception as exc:
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Impossibile connettersi al daemon NUT su {host}:{port} ({exc})"},
                )
            )
            return result

        try:
            # Query standard NUT variables
            raw_vars: dict[str, str] = {}
            vars_to_query = [
                "ups.status",
                "battery.charge",
                "battery.runtime",
                "ups.load",
                "input.voltage",
                "battery.voltage",
                "device.model",
            ]

            for v in vars_to_query:
                try:
                    resp = await self._send_nut_cmd(reader, writer, f"GET VAR {ups_name} {v}")
                    # Format: VAR <upsname> <varname> "<value>"
                    if resp.startswith("VAR"):
                        parts = resp.split('"', 2)
                        if len(parts) >= 2:
                            raw_vars[v] = parts[1]
                        else:
                            tokens = resp.split()
                            if len(tokens) >= 4:
                                raw_vars[v] = tokens[3]
                except Exception:
                    continue

            # Close NUT session cleanly
            try:
                writer.write(b"LOGOUT\n")
                await writer.drain()
            except Exception:
                pass
            writer.close()
            await writer.wait_closed()

            status_str = raw_vars.get("ups.status", "UNKNOWN").upper()
            battery_charge = float(raw_vars.get("battery.charge", 100.0))
            battery_runtime = float(raw_vars.get("battery.runtime", 0.0))
            ups_load = float(raw_vars.get("ups.load", 0.0))
            input_voltage = float(raw_vars.get("input.voltage", 230.0))
            model = raw_vars.get("device.model", "UPS")

            # Status interpretation
            # OL = Online, OB = On Battery, LB = Low Battery
            tokens = status_str.split()
            is_on_battery = "OB" in tokens
            is_low_battery = "LB" in tokens
            is_online = "OL" in tokens

            obs_status = "ok"
            if is_low_battery:
                obs_status = "crit"
            elif is_on_battery:
                obs_status = "crit"
            elif not is_online and status_str != "UNKNOWN":
                obs_status = "warn"

            details = {
                "ups_name": ups_name,
                "model": model,
                "status_raw": status_str,
                "is_online": is_online,
                "is_on_battery": is_on_battery,
                "is_low_battery": is_low_battery,
                "battery_charge_percent": battery_charge,
                "battery_runtime_seconds": battery_runtime,
                "load_percent": ups_load,
                "input_voltage": input_voltage,
            }

            result.observations.append(
                CollectorObservation(
                    status=obs_status,
                    value=battery_charge,
                    details=details,
                )
            )

            # Emit event if running on battery
            if is_on_battery:
                result.events.append(
                    CollectorEvent(
                        event_type="ups_on_battery",
                        severity="crit",
                        title=f"Mancanza rete elettrica: UPS {ups_name} su batteria",
                        message=(
                            f"L'UPS {ups_name} ({model}) è in modalità batteria. "
                            f"Carica residua: {battery_charge}%, autonomia stimata: {int(battery_runtime // 60)} min."
                        ),
                        details=details,
                    )
                )

        except Exception as exc:
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Errore durante l'interrogazione variabili NUT: {str(exc)}"},
                )
            )
        finally:
            try:
                writer.close()
            except Exception:
                pass

        return result

    async def discover(self, params: dict[str, Any]) -> list[DiscoveredItem]:
        """Discover UPS units from NUT daemon."""
        items: list[DiscoveredItem] = []
        host = params.get("host", "127.0.0.1")
        port = int(params.get("port", 3493))

        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(host, port),
                timeout=3.0,
            )
            writer.write(b"LIST UPS\n")
            await writer.drain()

            while True:
                line = await asyncio.wait_for(reader.readline(), timeout=2.0)
                decoded = line.decode("utf-8", errors="replace").strip()
                if not decoded or decoded.startswith("ERR") or decoded == "END LIST UPS":
                    break
                # Format: UPS <upsname> "<description>"
                if decoded.startswith("UPS"):
                    tokens = decoded.split('"')
                    ups_id = tokens[0].split()[1] if len(tokens[0].split()) > 1 else "ups"
                    desc = tokens[1] if len(tokens) > 1 else ups_id
                    items.append(
                        DiscoveredItem(
                            id=f"nut-{ups_id}",
                            name=f"UPS {desc}",
                            kind="ups",
                            suggested_checks=[
                                {
                                    "type": "nut",
                                    "name": f"Stato UPS {ups_id}",
                                    "params": {"host": host, "port": port, "ups_name": ups_id},
                                }
                            ],
                        )
                    )

            writer.close()
            await writer.wait_closed()
        except Exception:
            pass

        return items
