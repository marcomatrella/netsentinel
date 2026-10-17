# NetSentinel — Changelog

Tutte le modifiche rilevanti a questo progetto sono documentate in questo file.
Il formato è basato su [Keep a Changelog](https://keepachangelog.com/it/1.1.0/)
e questo progetto aderisce al [Semantic Versioning](https://semver.org/lang/it/).

## [1.2.0] - 2026-10-18

### 🚀 Major Update: Integrazioni Hardware di Primo Livello & Gestione Avanzata
- **Sezione "Integrazioni" Dedicata nel Dettaglio Apparato**: Introdotta una nuova sezione chiaramente separata dai controlli di rete standard all'interno della vista apparato, per censire e gestire integrazioni dedicate di primo livello (UniFi, AdGuard Home, Home Assistant, Synology DSM).
- **Badge Interattivi e Bubble sul Canvas**: Gli apparati con integrazioni attive mostrano un badge con icona personalizzata (UniFi, AdGuard, HA, Synology) in una bubble fluttuante direttamente sul canvas di rete; un clic apre un menu contestuale rapido per consultare la telemetria live o modificare la configurazione.
- **Finestra Telemetria in Tempo Reale**: Modal dedicata che mostra metriche dettagliate (client connessi, consumi PoE, query DNS bloccate, stato pool RAID, temperature, firmware) con pulsante di aggiornamento manuale istantaneo e modifica parametri.
- **Test Preventivo di Raggiungibilità ("Test Raggiungibilità")**: Aggiunto un pulsante per verificare credenziali, token API ed endpoint prima di salvare la configurazione, eliminando errori a runtime.
- **Supporto UniFi OS Moderno & Controller Standalone**:
  - Selettore visivo per **UniFi OS** (UDM, Cloud Key Gen2, UDR, UniFi OS Server con porta HTTPS standard) e **Controller Legacy / Standalone** (porta :8443).
  - Pieno supporto per **UniFi OS API Key** (Settings → System → Integrations) e autenticazione con credenziali.
- **Riconoscimento e Gestione 2FA / MFA UniFi**: Rilevamento automatico della richiesta 2FA (`api.err.Ubic2faTokenRequired`) con interfaccia per l'inserimento dell'OTP e verifica istantanea via API.
- **Sospensione Automatica Anti-Lockout / Anti-Spam**: In caso di errore di autenticazione o richiesta 2FA, lo scheduler di backend sospende automaticamente il polling in background (`next_run_at = None`) evitando il blocco dell'account e lo spam continuo di email OTP da parte dei vendor.
- **Disaccoppiamento tra Raggiungibilità di Rete e Servizi Terzi**: Un'eventuale anomalia di un servizio esterno/cloud non degrada più la raggiungibilità fisica dell'apparato sulla LAN (se pingabile, rimane verde e operativo).
- **Miglioramenti UI e Sicurezza Operativa**:
  - Distinzione cromatica gialla per il pulsante "Simula guasto What If", per non confonderlo con le azioni distruttive.
  - Dialog di conferma al centro dello schermo prima di eliminare qualsiasi apparato dal sistema, con indicazione esplicita del nome dispositivo.
  - Riordinamento del menu: "Backup e ripristino plancia" collocato sotto "Visualizzazione e Controlli".
- **Parità i18n al 100%**: Traduzione completa e sincronizzata per tutte le 5 lingue supportate (it, en, de, fr, es).

## [1.1.13] - 2026-10-17

### Novità & Miglioramenti
- **Riorganizzazione Menu e Sezione "Configurazioni generali"**: Riorganizzato il menu flyout dropdown introducendo la nuova sezione dedicata che raggruppa *Notifiche*, *Servizi DNS e DHCP* e *Interventi programmati*.
- **Rimozione Wizard Guidato dal Menu**: Il wizard a 8 passi è stato rimosso dalle opzioni ordinarie del menu principale ed è ora riservato esclusivamente al primo onboarding / setup guidato.
- **Rinnovamento Grafico Registro Eventi (Minimal NOC Table)**: Il log eventi è stato completamente riscritto: rimossi i vecchi accordion/card espandibili in favore di un'unica tabella minimal ad alta densità informativa con intestazioni fisse (`sticky headers`), contrasto ottimizzato, badge di severità ed evidenziazione ad alto contrasto con bordo colorato laterale (`border-l-4`) per allarmi `CRIT` e `WARN`.
- **Separazione Eventi di Riavvio nel Registro Eventi**: Gli eventi di riavvio (`reboot_detected`) non affollano più la vista predefinita "Tutti" né la scheda "Avvisi", ma sono isolati in un tab dedicato **"Riavvii"** (`reboots`) con icona `RotateCw`.
- **Espansione Notifiche: Email SMTP & Notifiche Push Web (PWA)**: Il pannello Notifiche è stato strutturato in schede con supporto completo per le **Notifiche Push Web / PWA**. È ora possibile concedere l'autorizzazione al browser, testare la ricezione in tempo reale e ricevere notifiche automatiche via SSE su allarmi critici e risoluzioni.
- **Finestra di Assestamento (Settling Window) Anti-Tempesta Log**: Quando si verifica una transizione anomala o una serie di fallimenti a cascata (come il riavvio notturno del router), il sistema raccoglie le transizioni in background in un buffer temporaneo prima di scrivere nel database degli eventi. Solo dopo l'isolamento della causa radice viene generato un unico log pulito di apertura incidente, sopprimendo le decine di log `WARN` ed eventi intermedi sui nodi a valle impattati.
- **Accorpamento Email (Unica Email per Incidente)**: Modificata la logica dei canali di allarme: il sistema invia rigorosamente una sola email di notifica per incidente all'apertura, evitando l'invio di raffiche di email per ogni singolo dispositivo secondario e prevenendo il blocco da rate-limiting SMTP.
- **Riconoscimento Automatico Offline WAN / Router & Report Consolidato**: Se il router o la linea WAN cadono, il sistema interrompe immediatamente qualsiasi tentativo di connessione ai server SMTP esterni, evitando timeout di rete e blocchi; le comunicazioni vengono poste in coda protetta `pending_wan`. Al ripristino della connettività Internet recapita un unico report riassuntivo consolidato con durata totale, causa radice, nodi coinvolti e conferma del ripristino completo della rete.
- **Risoluzione Completa Stringhe Non Decodificate (i18n)**: Allineate e introdotte in tutte le 5 lingue supportate (it, en, de, fr, es) le chiavi relative a `events.narratives.*` (`device_offline_headline`, `device_offline_explanation`, `device_offline_actionable`, `device_managed_*`, `device_restored_*`, `unknown_device`).

## [1.1.12] - 2026-10-17

### Novità & Miglioramenti
- **Distinzione Visiva Guasto Primario vs Nodi Irraggiungibili**: Nel canvas di rete, i nodi con guasto primario (`down` / Root Cause) mostrano ora il badge rosso di allarme `🚨 GUASTO`, mentre i nodi a valle impattati collateralmente mostrano chiaramente il badge ambra `⚠️ IRRAGGIUNGIBILE` con bordo tratteggiato.
- **Rilevamento e Segnalazione Isolamento Vantage Point**: Quando il Vantage Point (es. Home Assistant) perde l'intero collegamento con lo switch di attestazione o la LAN, non rimane più ingannevolmente verde `ok`, ma assume lo stato `ISOLATO DA LAN` con bordo indaco pulsante e badge dedicato.
- **Supporto multilingua completo**: Aggiunte e aggiornate le etichette di stato `status_down`, `status_unreachable` e `status_isolated` per italiano, inglese, tedesco e francese.

## [1.1.11] - 2026-10-17

### Risolto
- **Allineamento Immagine Add-on Supervisor (`build.yaml`)**: Aggiornato `netsentinel/build.yaml` per puntare alla versione corrente dell'immagine container su GHCR per tutte le architetture (`aarch64` e `amd64`), consentendo a Home Assistant Supervisor di scaricare effettivamente la versione più recente anziché rimanere bloccato su v1.1.8.
- **Risoluzione Simulazione What-If e Raggiungibilità LAN**: Integrato il fix per la connettività LAN locale nominale durante i guasti simulati di router e WAN.

## [1.1.10] - 2026-10-16

### Risolto
- **What-If Simulation e Raggiungibilità LAN**: Risolta definitivamente l'anomalia per cui la simulazione di guasto sul Router o sulla WAN portava l'intera rete locale (Switch, NAS, AP, HA) offline.
- **Isolamento Guasti WAN / Gateway**: La caduta della connessione WAN o del router preserva al 100% lo stato nominale (`ok`, verde) dei dispositivi attestati sullo switch locale raggiungibili dal Vantage Point.
- **Sintomi di Simulazione Coerenti**: I nodi raggiungibili via LAN non vengono più aggiunti ai sintomi né marcati come impattati in assenza di reale perdita di alimentazione/connettività fisica.
- **Fallback Automatico Vantage Point**: Se il Vantage Point non è esplicitamente designato, la simulazione individua automaticamente un nodo attivo della topologia fisica senza degradare arbitrariamente l'albero downstream.

## [1.1.9] - 2026-10-16

### Risolto
- **What-If Simulation su Router/Gateway**: La simulazione di guasto del router non imposta più tutti gli apparati della LAN come offline. Lo switch, il NAS e l'Access Point rimangono operativi e raggiungibili dal Vantage Point (Home Assistant).
- **Distinzione Raggiungibilità Fisica vs Servizio WAN**: I dispositivi che perdono l'uscita Internet sono ora segnalati come `affected` (degradati per assenza di WAN) anziché `unreachable`.
- **Dipendenze Soft**: Impostata correttamente a `soft` la severità delle relazioni di dipendenza dedotte per Gateway L3, server DHCP e resolver DNS.

## [1.1.8] - 2026-10-16

### Risolto
- **Wizard Setup Iniziale**: Risolto il conflitto di ruoli duplicati: Vantage Point univoco assegnato esclusivamente all'host locale Home Assistant, eliminato duplicato su MacBook.
- **Ruolo DNS su NAS**: Eliminata la pre-assegnazione errata del resolver DNS sul NAS se il router è già configurato come DNS.
- **Usabilità Schede Apparati**: L'intero riquadro dell'apparato nel wizard e nella lista ora è cliccabile per visualizzare e modificare i dettagli (non solo l'icona matita).

## [1.1.7] - 2026-10-16

### Risolto
- **Risolto Blocco Avvio Add-on**: Rimosso completamente il comando `HEALTHCHECK` dai Dockerfile per evitare che Home Assistant Supervisor rimanga bloccato indefinitamente nello stato `AppState.STARTUP`.

## [1.1.6] - 2026-10-16

### Risolto
- **Asset 404 sotto Ingress**: Corretto il caricamento dei file JavaScript e CSS sotto il reverse proxy Ingress di Home Assistant.

## [1.1.5] - 2026-10-16

### Aggiunto
- **Doppio Socket HTTP / Ingress**: Supporto nativo per l'accesso simultaneo tramite Ingress (porta 8099) e porta esterna diretta (default 8181).

## [Unreleased]

### Aggiunto
- **Milestone M6**:
  - Streaming incrementale in tempo reale basato su Server-Sent Events (SSE) su `/api/v1/stream`: diff push automatici dello stato del grafo e degli incidenti verso il frontend senza overhead di polling.
  - Funzionalità "Macchina del Tempo" (Time Machine): endpoint `/api/v1/timemachine/snapshot` e componente slider frontend per ricostruire e riprodurre lo stato storico della rete e gli incidenti passati negli ultimi 30 giorni.
  - Modalità Kiosk a schermo intero: interfaccia pulita senza barre di navigazione ideale per monitor a parete e tablet dedicati.
  - Documentazione esaustiva completata nella directory `docs/`:
    - `docs/architecture.md`: panoramica architetturale, pipeline ad eventi e modelli.
    - `docs/plugins.md`: guida per lo sviluppo di nuovi collector e canali di notifica.
    - `docs/setup-nas.md`: guida dettagliata al deployment su Synology DSM, TrueNAS, unRAID e QNAP con docker-compose.
    - `docs/heartbeat.md`: guida all'integrazione del dead-man's switch con Healthchecks.io.
    - `docs/security.md`: modello di sicurezza, cifratura a riposo e permessi minimi.
    - `README.md` principale completo con diagramma architetturale, badge CI e guida rapida.
  - Benchmark prestazionale e di impronta di memoria superato con successo: memoria a riposo < 200MB RAM, CPU < 3%, scritture batch ultrarapide su SQLite WAL.
  - Suite di test completa (46 test unitari, di scenario e di performance, 100% verdi).
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
