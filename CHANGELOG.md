# NetSentinel — Changelog

Tutte le modifiche rilevanti a questo progetto sono documentate in questo file.
Il formato è basato su [Keep a Changelog](https://keepachangelog.com/it/1.1.0/)
e questo progetto aderisce al [Semantic Versioning](https://semver.org/lang/it/).

## [Unreleased]

### Aggiunto
- **Milestone M5**:
  - Sistema completo di notifica con template email HTML e testo in italiano (`render_incident_notification`), chiaro, conciso e privo di tempeste di allarmi (un solo avviso per incidente).
  - Canali di notifica implementati e testati:
    - `smtp`: invio email asincrono con `aiosmtplib` (supporto TLS/SSL e STARTTLS).
    - `webhook`: payload JSON verso endpoint REST arbitrari con token Bearer.
    - `ntfy`: notifiche push verso istanze ntfy pubbliche o locali con priorità, tag contestuali e link diretto alla dashboard.
    - `home_assistant`: creazione notifiche persistenti native su Home Assistant tramite API REST.
  - Coda persistente su SQLite (`NotificationLog`) con resilienza a blackout WAN: le notifiche verso destinatari esterni vengono accumulate in stato `pending_wan` e trasmesse o consolidate all'avvenuto ripristino.
  - Gestione orari di silenzio (quiet hours) configurabili per canale (es. 23:00 - 07:00), con bypass automatico garantito per eventi critici.
  - Modalità manutenzione con silenziamento temporaneo programmabile via API (`/api/v1/maintenance`).
  - Dead-man's switch esterno periodico verso Healthchecks.io (o URL compatibile), protetto da watchdog interno su due livelli (stato scheduler asincrono e reattività database SQLite).
  - Endpoint REST per canali di notifica, invio test, consultazione log coda e stato watchdog/heartbeat.
  - Suite di test completa per M5 (43 test totali nel repository, 100% superati).
- **Milestone M4**:
  - Implementazione dei collector avanzati a plugin per apparati specifici e protocolli standard:
    - `unifi`: interroga controller UniFi (UDM/CloudKey) per stato apparati, consumo PoE porte switch, client connessi e stato di aggiornamento firmware.
    - `synology_dsm`: interroga API REST di Synology DSM per salute volumi RAID, pool di archiviazione, diagnostica S.M.A.R.T. dischi e temperatura.
    - `nut`: client asincrono TCP 3493 per Network UPS Tools con parsing variabili, rilevamento blackout di rete (stato `OB`), batteria scarica (`LB`) ed emissione eventi di sistema.
    - `adguard_home`: interroga statistiche DNS, query totali, query filtrate e latenza media di risoluzione upstream.
    - `snmp`: client UDP nativo asincrono con codifica/decodifica pacchetti ASN.1 BER SNMP v2c per interrogazione di sysUpTime, descrizioni e stato operativo interfacce.
    - `home_assistant`: interroga entità e prese intelligenti / sensori di consumo elettrico con token Bearer.
    - `generic_http_json`: client HTTP generico con estrazione JSONPath e asserzioni su status code, latenza e campi estratti.
  - Completamento ed estensione della libreria regole di diagnosi (`default_rules.yaml`) per le 14 casistiche della Sezione 6.4.
  - Implementazione del test di accettazione per lo scenario *"AP offline 20 minuti"*, con discriminazione precisa dei 4 casi:
    - **Caso A**: Riavvio AP / reboot watchdog / aggiornamento firmware (`rule_03_ap_reboot`).
    - **Caso B**: Perdita alimentazione PoE o cavo scollegato (`rule_04_ap_poe_loss`).
    - **Caso C**: Mancato rinnovo lease IP / DHCP con PoE attivo (`rule_ap_ip_lease_loss`).
    - **Caso D**: Disconnessione isolata da controller UniFi con AP e client operativi (`rule_ap_controller_desync`).
  - Generazione di evidenze mancanti suggerite e controlli proposti nelle ipotesi alternative.
  - Suite di test M4 con 9 nuovi test (37 test totali nel repository, 100% verdi).
- **Milestone M3**:
  - Frontend completo in React 18 + TypeScript + TailwindCSS + `@xyflow/react` + `elkjs` servito come Single-Page App dal backend FastAPI.
  - Tela di rete interattiva (`NetworkCanvas`) con nodi personalizzati (`CustomNode`) e collegamenti tipizzati (`CustomEdge`).
  - Auto-layout gerarchico a strati con ELK.js per organizzazione automatica dei nodi e rispetto dei flussi di rete.
  - Tavolozza nodi tipizzati (`Palette`) per inserimento apparati via drag-and-drop.
  - Pannello laterale di dettaglio apparato (`DeviceDetailPanel`) e collegamento (`LinkDetailPanel`) con esecuzione manuale dei controlli ed elenco eventi.
  - Banner di incidente (`IncidentBanner`) con root cause evidenziata, confidenza, raccomandazioni e presa in carico ("Presa in carico").
  - Slider della Macchina del Tempo (`TimeMachineSlider`) per navigare e riprodurre lo storico di stato.
  - Wizard di configurazione iniziale a 8 passi riprendibile (`WizardModal`).
  - Motore backend di deduzione automatica delle dipendenze (`backend/app/topology/deduction.py`) implementante le regole della Tabella 4.6.
  - Endpoint di simulazione guasti dry-run (`POST /api/v1/simulate/failure`) e gestione completa della topologia (`/api/v1/topology`).
  - Suite di test M3 con verifica della deduzione topologica, endpoint e simulazione (28 test superati).
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
