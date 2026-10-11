"""TCP port check collector."""

import asyncio
import time
from typing import Any

from app.collector.base import (
    BaseCollector,
    CollectorObservation,
    CollectorResult,
)
from pydantic import BaseModel, Field


class TcpPortParams(BaseModel):
    target: str | None = None
    port: int = Field(..., ge=1, le=65535)
    timeout_seconds: float = Field(default=3.0, ge=0.5, le=30.0)


class TcpPortCollector(BaseCollector):
    """Checks whether a specific TCP port is open and listening."""

    name = "tcp_port"
    description = "Controllo disponibilità e tempo di connessione a una specifica porta TCP."
    capabilities = ["tcp", "port_check", "latency"]
    param_schema = TcpPortParams

    async def collect(
        self,
        target_address: str | None,
        params: dict[str, Any],
        timeout_seconds: float = 5.0,
    ) -> CollectorResult:
        target = params.get("target") or target_address
        port = params.get("port")
        if not target or not port:
            return CollectorResult(
                observations=[
                    CollectorObservation(
                        status="unknown",
                        details={"error": "Parametri mancanti: target e port sono obbligatori."},
                    )
                ]
            )

        timeout_sec = min(float(params.get("timeout_seconds", 3.0)), timeout_seconds)

        t0 = time.time()
        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(target, int(port)),
                timeout=timeout_sec,
            )
            rtt_ms = round((time.time() - t0) * 1000.0, 2)
            writer.close()
            await writer.wait_closed()

            return CollectorResult(
                observations=[
                    CollectorObservation(
                        status="ok",
                        value=rtt_ms,
                        details={
                            "target": target,
                            "port": port,
                            "rtt_ms": rtt_ms,
                            "connected": True,
                        },
                    )
                ]
            )
        except TimeoutError:
            return CollectorResult(
                observations=[
                    CollectorObservation(
                        status="crit",
                        value=None,
                        details={
                            "target": target,
                            "port": port,
                            "error": f"Timeout di connessione ({timeout_sec}s)",
                        },
                    )
                ]
            )
        except ConnectionRefusedError:
            return CollectorResult(
                observations=[
                    CollectorObservation(
                        status="crit",
                        value=None,
                        details={
                            "target": target,
                            "port": port,
                            "error": "Connessione rifiutata (porta chiusa o servizio fermo)",
                        },
                    )
                ]
            )
        except Exception as e:
            return CollectorResult(
                observations=[
                    CollectorObservation(
                        status="crit",
                        value=None,
                        details={
                            "target": target,
                            "port": port,
                            "error": f"Errore di rete: {str(e)}",
                        },
                    )
                ]
            )
