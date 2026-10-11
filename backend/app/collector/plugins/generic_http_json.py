"""Generic HTTP / JSON collector plugin for NetSentinel."""

import logging
import time
from typing import Any

import httpx
from app.collector.base import (
    BaseCollector,
    CollectorObservation,
    CollectorResult,
    DiscoveredItem,
)

logger = logging.getLogger("netsentinel.collector.generic_http_json")


def _get_nested_value(data: Any, path: str) -> Any:
    """Extract nested value from dict/list using dot notation (e.g. 'status.ready' or 'items.0.name')."""
    if not path:
        return data
    keys = path.split(".")
    curr = data
    for k in keys:
        if isinstance(curr, dict) and k in curr:
            curr = curr[k]
        elif isinstance(curr, list) and k.isdigit() and int(k) < len(curr):
            curr = curr[int(k)]
        else:
            return None
    return curr


class GenericHttpJsonCollector(BaseCollector):
    """Collector for arbitrary HTTP endpoints returning JSON with field extraction and assertions."""

    name = "generic_http_json"
    description = "Interroga qualsiasi endpoint HTTP/REST JSON ed estrae campi, metriche e asserzioni di stato"
    capabilities = ["http_json", "custom_assertions", "latency_metrics"]

    async def collect(
        self,
        target_address: str | None,
        params: dict[str, Any],
        timeout_seconds: float = 5.0,
    ) -> CollectorResult:
        result = CollectorResult()
        url = params.get("url", f"http://{target_address}" if target_address else "")
        method = params.get("method", "GET").upper()
        headers = params.get("headers", {})
        body = params.get("body")
        json_path = params.get("json_path", "")  # e.g. "status" or "health.overall"
        expected_value = params.get("expected_value")  # e.g. "ok" or "UP" or True
        expected_status_code = int(params.get("expected_status_code", 200))
        verify_ssl = params.get("verify_ssl", True)

        if not url:
            result.observations.append(
                CollectorObservation(
                    status="unknown",
                    details={"error": "Nessun URL specificato per generic_http_json."},
                )
            )
            return result

        start_time = time.perf_counter()
        try:
            async with httpx.AsyncClient(verify=verify_ssl, timeout=timeout_seconds) as client:
                req_kwargs: dict[str, Any] = {"headers": headers}
                if body and method in ["POST", "PUT", "PATCH"]:
                    req_kwargs["json"] = body

                resp = await client.request(method, url, **req_kwargs)
                latency_ms = round((time.perf_counter() - start_time) * 1000, 2)

                status_code = resp.status_code
                try:
                    data = resp.json()
                except Exception:
                    data = resp.text

                extracted_val = _get_nested_value(data, json_path) if isinstance(data, (dict, list)) else data

                # Assertion evaluation
                obs_status = "ok"
                fail_reasons = []

                if status_code != expected_status_code:
                    obs_status = "crit"
                    fail_reasons.append(f"Status code HTTP {status_code} != atteso {expected_status_code}")

                if expected_value is not None:
                    # Compare extracted value
                    if str(extracted_val).strip().lower() != str(expected_value).strip().lower():
                        obs_status = "crit"
                        fail_reasons.append(f"Valore '{extracted_val}' != atteso '{expected_value}' in '{json_path}'")

                # Numeric value for graph plotting
                numeric_val = None
                if isinstance(extracted_val, (int, float)):
                    numeric_val = float(extracted_val)
                else:
                    numeric_val = latency_ms

                details = {
                    "url": url,
                    "method": method,
                    "status_code": status_code,
                    "latency_ms": latency_ms,
                    "extracted_value": extracted_val,
                    "json_path": json_path,
                }
                if fail_reasons:
                    details["fail_reasons"] = fail_reasons

                result.observations.append(
                    CollectorObservation(
                        status=obs_status,
                        value=numeric_val,
                        details=details,
                    )
                )

        except httpx.TimeoutException:
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Timeout richiesta HTTP a {url} ({timeout_seconds}s)."},
                )
            )
        except Exception as exc:
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": f"Errore richiesta HTTP JSON: {str(exc)}"},
                )
            )

        return result

    async def discover(self, params: dict[str, Any]) -> list[DiscoveredItem]:
        return []
