# NetSentinel — Piano di Implementazione

## 1. Obiettivo del Progetto

NetSentinel è una soluzione self-hosted per il monitoraggio intelligente di reti domestiche e home lab avanzati. A differenza dei sistemi di monitoraggio convenzionali (che emettono allarmi separati per ogni nodo offline generando "tempeste di alert"), NetSentinel:
1. Mappa la topologia fisica e logica della rete attraverso un wizard grafico (tela canvas interattiva).
2. Raccoglie metriche e stati tramite collector modulari asincroni (plugin).
3. Correla gli eventi tramite il grafo di dipendenza orientato rispetto a un "vantage point" (punto di osservazione).
4. Isola la **root cause** con livello di confidenza, evidenze positive/negative, cronologia e azioni consigliate.
5. Invia notifiche aggregate e uniche per incidente via email (SMTP), webhook, ntfy e canali locali (Home Assistant).
6. Implementa un meccanismo anti-silenzio ("dead-man's switch") verso un servizio esterno (es. Healthchecks.io) affinché l'utente sia allertato anche se NetSentinel o l'host muoiono.

---

## 2. Scelte Tecniche Dettagliate

| Componente | Scelta Tecnologica | Motivazione |
|---|---|---|
| **Linguaggio Backend** | Python 3.12+ | Sintassi moderna, gestione nativa async/await robusta, compatibilità con librerie di networking e automazione. |
| **Framework Web & API** | FastAPI + Uvicorn | Prestazioni elevate, supporto nativo a Pydantic v2 per validazione e serializzazione, generazione automatica di OpenAPI/Swagger. |
| **Database & ORM** | SQLite + SQLAlchemy 2 (asyncio) + Alembic | Zero-overhead, nessun daemon esterno da manutenere, affidabilità assoluta. Con `PRAGMA journal_mode=WAL` e scritture in batch protegge gli hard disk dei NAS dai cicli di scrittura continui. |
| **Scheduler Interno** | `asyncio.TaskGroup` e worker pool dedicato | Evita Celery/Redis; gestisce intervalli variabili, jitter, backoff esponenziale ed esecuzione isolata dei plugin con timeout individuali. |
| **Elaborazione Grafo** | NetworkX | Calcolo rapido di alberi di copertura dal vantage point, percorsi più brevi, componenti connesse e dipendenze transitive. |
| **Frontend Framework** | React 18 + Vite + TypeScript | Ecosistema tipizzato, build compatto e rapido, performance ottimali. |
| **Tela Interattiva** | `@xyflow/react` (React Flow) + `elkjs` | Gestione fluida di nodi e archi personalizzati con porte, layout gerarchico automatico basato su ELK, snap alla griglia, zoom/pan e mini-mappa. |
| **Styling & Icone** | TailwindCSS + Lucide Icons | Design moderno, reattivo, tema scuro/chiaro integrato, leggibilità eccellente anche su tablet. |
| **Streaming Realtime** | Server-Sent Events (SSE) `/api/v1/stream` | Minimo overhead HTTP, riconnessione automatica integrata nel browser, aggiornamenti incrementali di stato (diff del grafo). |
| **Packaging & Deploy** | Docker multi-stage (Node + Python) | Container unico, eseguibile con `docker compose`, compatibile `linux/amd64` e `linux/arm64`. |
| **Sicurezza Segreti** | Cifratura simmetrica Fernet (AES-128-CBC + HMAC) | Segreti protetti nel database a riposo; mai esposti in log o esportazioni in chiaro. |

---

## 3. Struttura delle Cartelle

```
netsentinel/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # Test, lint, typecheck, build
│       └── docker-publish.yml     # Build & publish multi-arch container
├── backend/
│   ├── app/
│   │   ├── api/                   # Router REST e SSE
│   │   │   ├── v1/
│   │   │   │   ├── auth.py
│   │   │   │   ├── checks.py
│   │   │   │   ├── devices.py
│   │   │   │   ├── events.py
│   │   │   │   ├── incidents.py
│   │   │   │   ├── observations.py
│   │   │   │   ├── settings.py
│   │   │   │   ├── simulate.py
│   │   │   │   ├── stream.py
│   │   │   │   └── topology.py
│   │   │   └── health.py
│   │   ├── collector/             # Sistema plugin di raccolta
│   │   │   ├── base.py
│   │   │   ├── registry.py
│   │   │   └── plugins/
│   │   │       ├── adguard_home.py
│   │   │       ├── dhcp.py
│   │   │       ├── dns.py
│   │   │       ├── generic_http_json.py
│   │   │       ├── home_assistant.py
│   │   │       ├── http.py
│   │   │       ├── nut.py
│   │   │       ├── ping.py
│   │   │       ├── snmp.py
│   │   │       ├── synology_dsm.py
│   │   │       ├── tcp_port.py
│   │   │       └── unifi.py
│   │   ├── config/
│   │   │   ├── schema.py          # Modelli Pydantic v2 di configurazione
│   │   │   └── settings.py        # Environment variables & runtime settings
│   │   ├── correlation/           # Motore di correlazione eventi & root cause
│   │   │   ├── engine.py
│   │   │   ├── explainer.py
│   │   │   ├── incident_manager.py
│   │   │   ├── rules/
│   │   │   │   ├── default_rules.yaml
│   │   │   │   └── rule_evaluator.py
│   │   │   └── scenarios.py
│   │   ├── crypto.py              # Cifratura a riposo
│   │   ├── db/                    # Modelli SQLAlchemy & session management
│   │   │   ├── base.py
│   │   │   ├── models.py
│   │   │   ├── session.py
│   │   │   └── migrations/
│   │   ├── heartbeat/             # Dead-man's switch e monitor interno
│   │   │   ├── client.py
│   │   │   └── watchdog.py
│   │   ├── notification/          # Notifiche e coda persistente
│   │   │   ├── channels/
│   │   │   │   ├── base.py
│   │   │   │   ├── home_assistant.py
│   │   │   │   ├── ntfy.py
│   │   │   │   ├── smtp.py
│   │   │   │   └── webhook.py
│   │   │   ├── manager.py
│   │   │   └── queue.py
│   │   ├── scheduler/             # Scheduler asincrono interno
│   │   │   ├── engine.py
│   │   │   └── job.py
│   │   ├── state/                 # Macchina a stati, isteresi, flapping
│   │   │   ├── flapping.py
│   │   │   ├── hysteresis.py
│   │   │   └── reboot.py
│   │   ├── topology/              # Grafo di rete, deduzione relazioni
│   │   │   ├── deduction.py
│   │   │   ├── graph.py
│   │   │   └── validator.py
│   │   └── main.py                # Applicazione FastAPI, lifespan
│   ├── pyproject.toml
│   └── uv.lock
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── api/                   # Client HTTP e SSE
│   │   ├── components/
│   │   │   ├── canvas/            # React Flow custom nodes & edges
│   │   │   │   ├── CustomEdge.tsx
│   │   │   │   ├── CustomNode.tsx
│   │   │   │   ├── GroupNode.tsx
│   │   │   │   ├── NetworkCanvas.tsx
│   │   │   │   └── Palette.tsx
│   │   │   ├── common/
│   │   │   ├── panels/            # Pannelli laterali (Device, Link, Incident)
│   │   │   │   ├── DeviceDetailPanel.tsx
│   │   │   │   ├── IncidentDetailPanel.tsx
│   │   │   │   └── LinkDetailPanel.tsx
│   │   │   ├── timemachine/       # Time Machine slider & playback
│   │   │   └── wizard/            # Flusso guidato 8 step
│   │   ├── hooks/
│   │   ├── pages/                 # Dashboard, Incidenti, Eventi, Impostazioni
│   │   ├── types/                 # Definizioni TypeScript condivise
│   │   ├── utils/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── docs/
│   ├── plan.md
│   ├── decisions.md
│   ├── architecture.md
│   ├── correlation.md
│   ├── plugins.md
│   ├── setup-nas.md
│   ├── heartbeat.md
│   └── security.md
├── examples/
│   ├── home-lab.yaml              # Topologia di riferimento (sezione 13)
│   └── scenarios/                 # Scenari di prova per correlazione
├── tests/
│   ├── backend/
│   │   ├── test_collectors.py
│   │   ├── test_correlation.py
│   │   ├── test_crypto.py
│   │   ├── test_deduction.py
│   │   ├── test_heartbeat.py
│   │   ├── test_hysteresis.py
│   │   ├── test_notifications.py
│   │   ├── test_scheduler.py
│   │   └── test_scenarios.py
│   └── load/
│       └── test_resource_footprint.py
├── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## 4. Analisi dei Rischi e Strategie di Mitigazione

| Rischio Identificato | Probabilità | Impatto | Strategia di Mitigazione |
|---|---|---|---|
| **Eccessiva usura disco su NAS (HDD)** | Alta | Alto | SQLite in modalità WAL con `synchronous=NORMAL`. Scritture in batch (flush ogni 5s o 50 record). Retention delle metriche grezze limitata a 7 giorni con aggregazione oraria compattata. |
| **Stallo o freeze dello scheduler asincrono** | Media | Alto | Watchdog interno con loop separato. Timeout rigidi su ogni esecuzione di collector (default 5s). Isolamento degli errori: un'eccezione in un plugin produce `status=unknown` e un log di diagnostica, mai un crash. |
| **Allarmi a raffica (Alert storms)** | Alta | Alto | Isteresi configurabile su Check e Device (es. 3 fallimenti consecutivi prima di `CRIT`). Correlazione topologica: se il nodo padre è down, i nodi figli diventano `UNREACHABLE` e vengono associati allo stesso `Incident`. Coda persistente con deduplica. |
| **Morte silenziosa di NetSentinel** | Bassa | Critico | Implementazione del Dead-man's switch esterno verso Healthchecks.io con cadenza a 60s. Il monitor invia il ping solo se il proprio ciclo interno e il DB sono sani. |
| **Permessi di rete per ICMP / RAW socket in Docker** | Media | Medio | Fallback trasparente su TCP connect SYN/handshake se i socket raw falliscono per mancanza di permessi. Istruzioni chiare in documentazione per `cap_add: [NET_RAW]` o `network_mode: host`. |
| **Complessità layout e performance React Flow con >100 nodi** | Media | Medio | Uso di ELK.js per layout a livelli a richiesta (non per ogni frame). Virtualizzazione dei nodi fuori viewport tramite React Flow. Rendering condizionale e zoom semantico. |

---

## 5. Dettaglio delle Milestone

### M0 — Fondamenta
- Creazione repository, configurazione `uv` per Python e `npm` per frontend.
- Modelli dati SQLAlchemy 2 (Device, Link, Dependency, Check, Observation, Event, Incident, NotificationChannel, NotificationLog).
- Schema di configurazione Pydantic v2 ed esportazione/importazione YAML versionato.
- Modulo di cifratura segreti Fernet con gestione keyfile ed env var.
- Setup FastAPI con router `/healthz` e lifecycle startup/shutdown.
- Dockerfile multi-stage e `docker-compose.yml` di riferimento.
- CI GitHub Actions (lint, typecheck, test).

### M1 — Collector Base + Macchina a Stati
- Interfaccia comune `BaseCollector` e registry dei plugin.
- Plugin base: `ping` (con fallback TCP), `tcp_port`, `http(s)` (stato, latenza, TLS), `dns` (confronto upstream).
- Scheduler interno asincrono con gestione di jitter, concorrenza e timeout.
- Motore di isteresi per i Check (`failure_policy`, `recovery_policy`) e calcolo dello stato del Device.
- Rilevamento del flapping e del riavvio dell'apparato.
- API REST per lettura stati, osservazioni recenti e serie temporali.

### M2 — Topologia + Motore di Correlazione
- Struttura del grafo delle dipendenze (NetworkX) orientato rispetto al Vantage Point.
- Implementazione algoritmo 6.3:
  1. Identificazione nodi non sani.
  2. Verifica provider a monte per distinguere nodi radice da sintomi (`UNREACHABLE`/`AFFECTED`).
  3. Applicazione libreria regole YAML con valutazione evidenze positive/negative.
  4. Calcolo confidenza e ipotesi alternative.
  5. Ciclo di vita degli `Incident` (apertura, aggiornamento con nuove evidenze, chiusura).
- Spiegabilità completa (cosa, dove, da quando, perché, confidenza, raccomandazioni).
- Suite di test basata su scenari YAML (almeno regole 1, 2, 6, 7, 11).

### M3 — Wizard Tela Grafica + Deduzione Dipendenze + Dry-Run
- Implementazione tela con `@xyflow/react` e palette apparati tipizzati.
- Collegamenti tipizzati (ethernet con porta, poe, wifi, power, wan, logical) e contenitori/gruppi.
- Motore di deduzione delle relazioni dal disegno (regole dichiarative della tabella 4.6).
- Schermata di revisione delle relazioni dedotte (`source: inferred` con possibilità di override `source: manual`).
- Simulazione di guasti interattiva (dry-run sulla tela) senza generare notifiche reali.
- Persistenza del layout e versionamento della configurazione.

### M4 — Plugin Avanzati e Regole Complete
- Collector dedicati: `unifi`, `synology_dsm`, `nut`, `adguard_home`, `snmp`, `home_assistant`, `generic_http_json`.
- Implementazione completa delle 14 regole di diagnosi della tabella 6.4.
- Scenario di verifica "AP offline 20 minuti" con discriminazione delle 4 ipotesi (riavvio, cavo/PoE, DHCP/IP, solo controller) ed evidenze mancanti.

### M5 — Notifiche, Coda Persistente & Dead-Man's Switch
- Canali di notifica: SMTP con template HTML/text in italiano, webhook, ntfy, Home Assistant.
- Coda persistente con gestione blackout WAN e invio differito all'avvenuto ripristino.
- Gestione orari di silenzio, deduplica e pulsante di acknowledge.
- Dead-man's switch esterno con invio periodico verso Healthchecks.io condizionato allo stato di salute del monitor.
- Modalità manutenzione con silenziamento temporaneo.

### M6 — Dashboard Interattiva, Time Machine & Rifinitura
- Dashboard a schermo intero condivisa con la tela del wizard: nodi e link vivi in tempo reale.
- Link con visualizzazione della fonte dello stato e spessore/animazione proporzionale al traffico.
- Macchina del tempo con cursore temporale per replay storico degli ultimi 30 giorni.
- Modalità kiosk per schermi a muro.
- Endpoint `/metrics` Prometheus.
- Documentazione esaustiva (`README.md`, `architecture.md`, `setup-nas.md`, `correlation.md`, ecc.).
- Verifica finale dei requisiti di performance (<3% CPU, <200MB RAM) e test suite completa.
