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
