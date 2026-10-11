# NetSentinel — Registro delle Decisioni Architetturali e Tecniche

Questo file registra le decisioni architetturali e implementative per garantire trasparenza, tracciabilità e manutenibilità.
Convenzione: una riga riassuntiva per decisione, seguita da eventuale contesto conciso se necessario.

- **ADR-001**: Utilizzo di Python 3.12+ con FastAPI e Pydantic v2 per il backend asincrono ad alte prestazioni.
- **ADR-002**: Adozione di SQLite in modalità WAL (`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;`) con SQLAlchemy 2 + aiosqlite per minimizzare le scritture su HDD (NAS) e supportare accessi concorrenti.
- **ADR-003**: Cifratura dei segreti a riposo tramite Fernet (AES-128-CBC + HMAC-SHA256) con chiave derivata da variabile d'ambiente `NETSENTINEL_SECRET_KEY` o file `secret.key`.
- **ADR-004**: Frontend in React 18 con Vite, TypeScript, TailwindCSS, `@xyflow/react` (React Flow) ed `elkjs` per visualizzazione interattiva e layout automatico gerarchico del grafo.
- **ADR-005**: Comunicazione in tempo reale tra backend e frontend tramite Server-Sent Events (SSE) per streaming incrementale efficiente dello stato del grafo.
- **ADR-006**: Packaging unificato in singolo container Docker multi-stage con build statico del frontend montato/servito direttamente da FastAPI per semplificare il deployment con `docker-compose`.
- **ADR-007**: Scheduler asincrono interno (`asyncio.TaskGroup`/loop con priorità e jitter) senza dipendenze pesanti esterne (no Celery, no Redis).
- **ADR-008**: Motore di diagnosi a regole dichiarative YAML con valutatori Python dedicati e calcolo probabilistico della confidenza basato su evidenze positive e negative.
- **ADR-009**: Dead-man's switch esterno implementato tramite client HTTP verso endpoint Healthchecks.io compatibile, con watchdog interno che inibisce il ping in caso di stallo del ciclo o corruzione del database.
- **ADR-010**: Coda persistente su SQLite per notifiche (SMTP, Webhook, ntfy, Home Assistant) per garantire invio differito e ordinato in caso di blackout WAN.
- **ADR-011**: Utilizzo di NetworkX per la manipolazione in memoria della topologia di rete e il calcolo degli alberi di copertura dal vantage point.
- **ADR-012**: Autenticazione locale tramite password con hash Argon2id e sessioni/token JWT con rotazione e scadenza.
- **ADR-013**: Storage storico compresso a due livelli: osservazioni grezze con retention breve (7 giorni) e campioni aggregati orari (min/avg/max/p95) per 90 giorni con job di aggregazione notturna.
- **ADR-014**: Supporto nativo ping ICMP tramite socket raw con fallback automatico su TCP connect SYN/probe se privo di capability `NET_RAW`.
- **ADR-015**: Esportazione e importazione della configurazione in YAML formattato e validato tramite Pydantic con redazione automatica dei segreti se non cifrati.
- **ADR-016**: Deduzione automatica delle dipendenze architetturali (Sezione 4.6 della specifica) direttamente dalla tela grafica, basata sui ruoli dei nodi, medium dei link (PoE, ethernet, wan) e distanza L2 dal vantage point.
- **ADR-017**: Motore di simulazione del guasto (dry-run) che riutilizza in memoria il motore di correlazione topologica senza alterare lo stato del database né emettere notifiche esterne.
- **ADR-018**: Plugin collector per integrazioni apparati avanzati (UniFi, Synology DSM, NUT, AdGuard Home, SNMP UDP, Home Assistant, Generic HTTP JSON) con discovery automatica e raccolta asincrona non bloccante.
- **ADR-019**: Discriminazione fine-grained dei guasti agli Access Point con identificazione probabilistica dei 4 scenari della Sezione 6.4 (Reboot/firmware, guasto cavo/PoE, DHCP lease loss, disconnessione isolata dal controller UniFi) ed evidenze mancanti suggerite.
- **ADR-020**: Architettura delle notifiche su coda persistente SQLite con gestione differita e consolidamento in caso di blackout WAN, orari di silenzio configurabili ed eccezione per allarmi critici.
- **ADR-021**: Client dead-man's switch esterno compatibile Healthchecks.io con watchdog interno a due livelli (salute scheduler e reattività database SQLite) per inibire il ping in caso di stallo del processo.
- **ADR-022**: Streaming incrementale in tempo reale basato su Server-Sent Events (SSE) su `/api/v1/stream` per diff di stato di nodi e incidenti, con keepalive periodico e supporto disconnessioni trasparenti.
- **ADR-023**: Macchina del tempo con ricostruzione deterministica dello stato della rete a un timestamp arbitrario degli ultimi 30 giorni tramite aggregazione osservazioni e finestre temporali di incidenti.
