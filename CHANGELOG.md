# NetSentinel — Changelog

Tutte le modifiche rilevanti a questo progetto sono documentate in questo file.
Il formato è basato su [Keep a Changelog](https://keepachangelog.com/it/1.1.0/)
e questo progetto aderisce al [Semantic Versioning](https://semver.org/lang/it/).

## [Unreleased]

### Aggiunto
- **Milestone M2**:
  - Modello del grafo di rete su NetworkX (`TopologyGraph`) con orientamento rispetto al Vantage Point, calcolo percorsi di hop e dipendenze transitive.
  - Motore di correlazione topologica (`CorrelationEngine`) implementante l'algoritmo in 7 fasi (Sezione 6.3): distinzione tra cause radice e sintomi (`UNREACHABLE` e `AFFECTED`), evidenze positive e negative, confidenza.
  - Libreria dichiarativa YAML con le 14 regole di diagnosi (`default_rules.yaml`) e valutatore di regole (`RuleEvaluator`).
  - Gestore del ciclo di vita degli incidenti (`IncidentManager`) con deduplica, rilevamento dello shift della causa radice, cronologia eventi e risoluzione automatica al ripristino.
  - Documentazione approfondita dell'algoritmo di correlazione con diagramma Mermaid (`docs/correlation.md`).
  - Suite completa di test guidati da scenari YAML (`scenario_01_wan_loss`, `scenario_02_gateway_down`, `scenario_06_switch_down`, `scenario_07_nas_dhcp_dns_down`, `scenario_11_vantage_point_isolated`, guasti multipli indipendenti, root-cause shift e ciclo di vita API REST).
  - 25 test unitari e di scenario verdi con 100% di successo.
  - Sistema di collector a plugin (`BaseCollector`, `CollectorRegistry`) con registrazione automatica.
  - Plugin base implementati: `ping` (ICMP con fallback TCP), `tcp_port`, `http` (latenza, status code, SSL, contenuto), `dns` (risoluzione UDP ad alte prestazioni con distinzione resolver down vs upstream SERVFAIL).
  - Motore di isteresi per i controlli (`failure_policy`, `recovery_policy`) e sintesi dello stato dell'apparato (`down`, `degraded`, `ok`, `unreachable`, `flapping`, `unknown`).
  - Rilevatore di flapping su finestra temporale mobile e rilevatore di riavvii tramite delta uptime e boot id.
  - Scheduler interno asincrono con jitter temporale (+/- 10%), limite di concorrenza semaforica e scrittura in batch delle metriche per minimizzare l'usura dei dischi HDD su NAS.
  - API REST per dispositivi, controlli, osservazioni, esecuzione manuale istantanea e cronologia eventi.
  - Suite di test completa per M1 (17 test superati).
- **Milestone M0**:
  - Repository inizializzato con licenza MIT.
  - Documento delle decisioni architetturali (`docs/decisions.md`).
  - Piano di implementazione dettagliato per milestone (`docs/plan.md`).
  - Modelli di database SQLAlchemy 2 con SQLite WAL (`PRAGMA journal_mode=WAL`).
  - Cifratura dei segreti a riposo con Fernet (AES-128-CBC + HMAC).
  - Schema di configurazione Pydantic v2 con validazione ed export/import YAML.
  - Topologia di riferimento home lab (`examples/home-lab.yaml`).
  - Dockerfile multi-stage, `docker-compose.yml` e CI GitHub Actions.
