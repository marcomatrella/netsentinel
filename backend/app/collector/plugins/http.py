"""HTTP and HTTPS service availability collector."""

import time
from typing import Any

import httpx
from app.collector.base import (
    BaseCollector,
    CollectorObservation,
    CollectorResult,
)
from pydantic import BaseModel, Field


class HttpParams(BaseModel):
    url: str
    method: str = "GET"
    expected_status: int = Field(default=200, ge=100, le=599)
    expected_content: str | None = None
    verify_ssl: bool = False  # Default False for internal LAN certificates
    timeout_seconds: float = Field(default=5.0, ge=0.5, le=30.0)


class HttpCollector(BaseCollector):
    """Checks HTTP(S) endpoint status, latency and body content."""

    name = "http"
    description = "Controllo HTTP/HTTPS con verifica codice di stato, latenza e contenuto della risposta."
    capabilities = ["http", "https", "web_status", "latency"]
    param_schema = HttpParams

    async def collect(
        self,
        target_address: str | None,
        params: dict[str, Any],
        timeout_seconds: float = 5.0,
    ) -> CollectorResult:
        url = params.get("url")
        if not url and target_address:
            url = f"http://{target_address}"
        if not url:
            return CollectorResult(
                observations=[
                    CollectorObservation(
                        status="unknown",
                        details={"error": "Nessun URL fornito per il controllo HTTP."},
                    )
                ]
            )

        method = params.get("method", "GET").upper()
        expected_status = int(params.get("expected_status", 200))
        expected_content = params.get("expected_content")
        verify_ssl = bool(params.get("verify_ssl", False))
        timeout_sec = min(float(params.get("timeout_seconds", 5.0)), timeout_seconds)

        t0 = time.time()
        try:
            async with httpx.AsyncClient(verify=verify_ssl, timeout=timeout_sec, follow_redirects=True) as client:
                resp = await client.request(method, url)
                latency_ms = round((time.time() - t0) * 1000.0, 2)

                details = {
                    "url": url,
                    "status_code": resp.status_code,
                    "expected_status": expected_status,
                    "latency_ms": latency_ms,
                }

                if resp.status_code != expected_status:
                    return CollectorResult(
                        observations=[
                            CollectorObservation(
                                status="crit" if resp.status_code >= 500 else "warn",
                                value=latency_ms,
                                details={
                                    **details,
                                    "error": f"Codice HTTP inatteso: ricevuto {resp.status_code}, atteso {expected_status}",
                                },
                            )
                        ]
                    )

                if expected_content and expected_content not in resp.text:
                    return CollectorResult(
                        observations=[
                            CollectorObservation(
                                status="warn",
                                value=latency_ms,
                                details={
                                    **details,
                                    "error": f"Contenuto atteso non trovato nel corpo della risposta: '{expected_content}'",
                                },
                            )
                        ]
                    )

                return CollectorResult(
                    observations=[
                        CollectorObservation(
                            status="ok",
                            value=latency_ms,
                            details=details,
                        )
                    ]
                )
        except httpx.TimeoutException:
            return CollectorResult(
                observations=[
                    CollectorObservation(
                        status="crit",
                        value=None,
                        details={"url": url, "error": f"Timeout HTTP dopo {timeout_sec}s"},
                    )
                ]
            )
        except httpx.ConnectError as e:
            return CollectorResult(
                observations=[
                    CollectorObservation(
                        status="crit",
                        value=None,
                        details={"url": url, "error": f"Impossibile connettersi all'host: {str(e)}"},
                    )
                ]
            )
        except Exception as e:
            return CollectorResult(
                observations=[
                    CollectorObservation(
                        status="crit",
                        value=None,
                        details={"url": url, "error": f"Errore richiesta HTTP: {str(e)}"},
                    )
                ]
            )
