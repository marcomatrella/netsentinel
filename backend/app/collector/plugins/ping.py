"""Ping / ICMP collector with automatic TCP connect fallback."""

import asyncio
import logging
import platform
import re
import time
from typing import Any

from app.collector.base import (
    BaseCollector,
    CollectorObservation,
    CollectorResult,
)
from pydantic import BaseModel, Field

logger = logging.getLogger("netsentinel.collector.ping")


class PingParams(BaseModel):
    target: str | None = None
    count: int = Field(default=3, ge=1, le=10)
    timeout_seconds: float = Field(default=2.0, ge=0.5, le=10.0)
    tcp_fallback_ports: list[int] = Field(default_factory=lambda: [80, 443, 22, 53])


class PingCollector(BaseCollector):
    """Measures packet loss and round-trip time via ICMP with fallback to TCP SYN."""

    name = "ping"
    description = "ICMP Ping con calcolo RTT, perdita pacchetti e fallback automatico TCP connect."
    capabilities = ["icmp", "latency", "packet_loss", "tcp_fallback"]
    param_schema = PingParams

    async def collect(
        self,
        target_address: str | None,
        params: dict[str, Any],
        timeout_seconds: float = 5.0,
    ) -> CollectorResult:
        target = params.get("target") or target_address
        if not target:
            return CollectorResult(
                observations=[
                    CollectorObservation(
                        status="unknown",
                        details={"error": "Nessun indirizzo IP o hostname target specificato."},
                    )
                ]
            )

        count = params.get("count", 3)
        timeout_sec = min(float(params.get("timeout_seconds", 2.0)), timeout_seconds)

        # Attempt ICMP ping via system ping binary
        icmp_res = await self._run_icmp_ping(target, count, timeout_sec)
        if icmp_res is not None:
            return icmp_res

        # If ICMP was not permitted or failed to execute, fallback to TCP connect probe
        logger.debug("Fallback a TCP connect per target: %s", target)
        return await self._run_tcp_fallback(target, params.get("tcp_fallback_ports", [80, 443, 22, 53]), timeout_sec)

    async def _run_icmp_ping(self, target: str, count: int, timeout_sec: float) -> CollectorResult | None:
        """Run ICMP ping via system utility."""
        is_darwin = platform.system() == "Darwin"
        # Flags: -c <count>, -W <timeout in ms on Linux or -t on macOS>
        cmd = ["ping", "-c", str(count)]
        if is_darwin:
            cmd.extend(["-t", str(int(max(1, timeout_sec)))])
        else:
            cmd.extend(["-W", str(int(max(1, timeout_sec)))])
        cmd.append(target)

        proc = None
        try:
            start_ts = time.time()
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=timeout_sec * count + 2.0,
            )
            output = stdout.decode("utf-8", errors="replace")

            # Parse packet loss and rtt
            loss_match = re.search(r"(\d+(?:\.\d+)?)%\s+packet loss", output)
            packet_loss = float(loss_match.group(1)) if loss_match else (0.0 if proc.returncode == 0 else 100.0)

            # Round trip time: min/avg/max/mdev or stddev
            rtt_match = re.search(r"=\s*([0-9.]+)/([0-9.]+)/([0-9.]+)", output)
            avg_rtt = float(rtt_match.group(2)) if rtt_match else None

            if packet_loss >= 100.0 or proc.returncode != 0 and avg_rtt is None:
                return CollectorResult(
                    observations=[
                        CollectorObservation(
                            status="crit",
                            value=None,
                            details={
                                "target": target,
                                "method": "icmp",
                                "packet_loss_percent": 100.0,
                                "error": "Tutti i pacchetti persi (Host unreachable o non risponde)",
                            },
                        )
                    ]
                )

            status = "ok" if packet_loss == 0.0 else "warn"
            return CollectorResult(
                observations=[
                    CollectorObservation(
                        status=status,
                        value=avg_rtt,
                        details={
                            "target": target,
                            "method": "icmp",
                            "avg_rtt_ms": avg_rtt,
                            "packet_loss_percent": packet_loss,
                            "elapsed_s": round(time.time() - start_ts, 3),
                        },
                    )
                ]
            )
        except (PermissionError, FileNotFoundError):
            return None
        except TimeoutError:
            if proc is not None:
                try:
                    proc.kill()
                    await proc.wait()
                except Exception:
                    pass
            return CollectorResult(
                observations=[
                    CollectorObservation(
                        status="crit",
                        value=None,
                        details={"target": target, "method": "icmp", "error": "Timeout del processo di ping"},
                    )
                ]
            )
        except Exception as e:
            if proc is not None:
                try:
                    proc.kill()
                    await proc.wait()
                except Exception:
                    pass
            logger.debug("Eccezione durante ICMP ping su %s: %s", target, e)
            return None

    async def _run_tcp_fallback(self, target: str, ports: list[int], timeout_sec: float) -> CollectorResult:
        """Probe TCP ports when raw ICMP is unavailable."""
        best_rtt: float | None = None
        successful_port: int | None = None

        for port in ports:
            try:
                t0 = time.time()
                _, writer = await asyncio.wait_for(
                    asyncio.open_connection(target, port),
                    timeout=timeout_sec,
                )
                rtt = (time.time() - t0) * 1000.0
                writer.close()
                await writer.wait_closed()
                best_rtt = rtt
                successful_port = port
                break
            except (TimeoutError, ConnectionRefusedError, OSError):
                continue

        if successful_port is not None and best_rtt is not None:
            return CollectorResult(
                observations=[
                    CollectorObservation(
                        status="ok",
                        value=round(best_rtt, 2),
                        details={
                            "target": target,
                            "method": "tcp_connect_fallback",
                            "connected_port": successful_port,
                            "rtt_ms": round(best_rtt, 2),
                            "note": "Rilevato tramite TCP probe (senza permessi ICMP RAW).",
                        },
                    )
                ]
            )

        return CollectorResult(
            observations=[
                CollectorObservation(
                    status="crit",
                    value=None,
                    details={
                        "target": target,
                        "method": "tcp_connect_fallback",
                        "error": f"Nessuna porta TCP aperta tra {ports} e ICMP non disponibile.",
                    },
                )
            ]
        )
