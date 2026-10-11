# NetSentinel — Guida Sviluppo Plugin e Collector

NetSentinel adotta un'architettura modulare a plugin: qualsiasi protocollo di monitoraggio o canale di notifica può essere aggiunto implementando una classe Python derivata da `BaseCollector`.

---

## 1. Struttura di un Collector

Tutti i collector ereditano da `app.collector.base.BaseCollector` e devono implementare il metodo asincrono `collect()` e opzionalmente `discover()`:

```python
from typing import Any
from app.collector.base import (
    BaseCollector,
    CollectorObservation,
    CollectorEvent,
    CollectorResult,
    DiscoveredItem,
)

class MyCustomCollector(BaseCollector):
    name = "my_protocol"
    description = "Descrizione leggibile del protocollo o servizio"
    capabilities = ["status", "metrics", "discovery"]

    async def collect(
        self,
        target_address: str | None,
        params: dict[str, Any],
        timeout_seconds: float = 5.0,
    ) -> CollectorResult:
        result = CollectorResult()
        
        # 1. Esegui la richiesta o interrogazione in modo asincrono (SENZA bloccare l'event loop)
        try:
            # Esempio: status_ok, latency, data = await do_async_query(...)
            status_ok = True
            latency_ms = 12.4
            
            result.observations.append(
                CollectorObservation(
                    status="ok" if status_ok else "crit",
                    value=latency_ms,
                    details={"firmware": "1.2.3", "active_clients": 4},
                )
            )
        except Exception as exc:
            # IMPORTANTE: non sollevare eccezioni non gestite; restituisci una CollectorObservation con errore
            result.observations.append(
                CollectorObservation(
                    status="crit",
                    details={"error": str(exc)},
                )
            )
            
        return result

    async def discover(self, params: dict[str, Any]) -> list[DiscoveredItem]:
        """Metodo opzionale invocato dal Wizard per scoprire nodi fantasma."""
        return [
            DiscoveredItem(
                id="my-device-1",
                name="Dispositivo Rilevato",
                kind="client",
                addresses={"ip": "192.168.1.150"},
            )
        ]
```

### Regole per i Collector:
1. **Mai bloccare l'Event Loop**: usa sempre librerie asincrone (`httpx`, `asyncio.open_connection`, subprocess asincroni).
2. **Nessun Crash**: cattura qualsiasi eccezione e trasformala in `status="crit"` o `"unknown"` con messaggio d'errore nel campo `details`.
3. **Valori Numerici**: se il controllo produce una metrica continua (latenza ms, potenza Watt, percentuale batteria, temperatura), impostala in `value` per consentire il tracciamento storico e il calcolo dei percentili.

---

## 2. Registrazione del Plugin

Aggiungi il tuo plugin nel file `backend/app/collector/plugins/__init__.py`:

```python
from app.collector.plugins.my_custom import MyCustomCollector
from app.collector.registry import registry

def register_default_collectors() -> None:
    ...
    registry.register(MyCustomCollector())
```

---

## 3. Aggiunta di un Canale di Notifica

I canali di notifica risiedono in `backend/app/notification/channels/` e vengono invocati da `NotificationManager._dispatch_channel`:

```python
async def send_my_service(config: dict[str, Any], subject: str, message: str) -> bool:
    api_key = config.get("api_key")
    # Invia notifica HTTP o webhook
    return True
```

