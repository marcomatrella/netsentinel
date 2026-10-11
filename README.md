<div align="center">

# 🛡️ NetSentinel

**Monitoraggio Intelligente per Home Lab con Correlazione Eventi Basata su Topologia di Rete**

[![CI](https://github.com/marcomatrella/netsentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/marcomatrella/netsentinel/actions)
[![Python](https://img.shields.io/badge/Python-3.12+-blue.svg?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18+-61DAFB.svg?logo=react&logoColor=black)](https://react.dev)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker&logoColor=white)](https://docker.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

*NetSentinel non ti dice solo che "X è giù": correla gli apparati in base alla topologia fisica e logica della tua rete e ti dice **esattamente dove sta il problema, perché, da quando e cosa fare**.*

</div>

---

## 💡 Perché NetSentinel?

Nei sistemi di monitoraggio convenzionali (Zabbix, Nagios, Uptime Kuma), il guasto di un apparato infrastrutturale a monte (come lo switch di centro stella o il router) scatena una cascata incontrollata di allarmi separati: *"NAS offline"*, *"AP offline"*, *"Server domotico offline"*, *"DNS offline"*, *"DHCP offline"*.

**NetSentinel risolve questo problema alla radice:**
1. **Distingue la causa dai sintomi**: riconosce che l'Access Point è solo `UNREACHABLE` a causa dello switch `DOWN`, generando **un solo avviso per incidente** anziché una raffica.
2. **Configurazione Disegnando la Rete (Stile draw.io)**: trascina nodi e collegamenti su una tela interattiva. Il sistema **deduce automaticamente le dipendenze** architetturali (alimentazione PoE, percorsi L2, gateway L3, DNS, DHCP).
3. **Punto di Osservazione (Vantage Point)**: sa che gira da un punto preciso della LAN (es. il NAS) e distingue se è la rete ad avere problemi o se è il vantage point stesso a trovarsi isolato.
4. **Leggero e NAS-Friendly**: database SQLite in modalità WAL, metriche aggregate in batch asincroni, retention breve per i dati grezzi. Utilizzo CPU < 3% e RAM < 200MB.
5. **Dead-Man's Switch**: integra un watchdog che avvisa tramite Healthchecks.io se è NetSentinel stesso a bloccarsi o a perdere alimentazione.

---

## 🏗️ Architettura

```
+-------------------------------------------------------------------------------+
|                             NetSentinel Frontend                              |
|   React 18 + xyflow (React Flow) + ELK.js Auto-Layout + Server-Sent Events    |
|   - Tela Grafica Interattiva (draw.io-style)   - Macchina del Tempo (30gg)   |
|   - Modalità Operativa / Sola Lettura          - Modalità Kiosk a Tutto Schermo|
+---------------------------------------+---------------------------------------+
                                        | (REST API v1 + SSE Stream)
+---------------------------------------v---------------------------------------+
|                             NetSentinel Backend                               |
|   FastAPI + Asyncio + Pydantic v2 + SQLAlchemy 2 + SQLite WAL                 |
|                                                                               |
|  +------------------+  +-------------------+  +----------------------------+  |
|  | Scheduler Async  |  | Macchina a Stati  |  | Correlazione Topologica    |  |
|  | Jitter & Batch   |->| Isteresi & Flap   |->| Grafo NetworkX (7 Fasi)   |  |
|  +------------------+  +-------------------+  +----------------------------+  |
|                                                             |                 |
|  +------------------+  +-------------------+  +-------------v--------------+  |
|  | Dead-Man Switch  |  | Watchdog Interno  |  | Coda Persistente Notifiche |  |
|  | Healthchecks.io  |<-| Verifica DB/Loop  |  | SMTP, ntfy, Webhook, HA   |  |
|  +------------------+  +-------------------+  +----------------------------+  |
+---------------------------------------+---------------------------------------+
                                        |
+---------------------------------------v---------------------------------------+
|                            Collector & Plugin                                 |
|   Ping ICMP (raw)   - UniFi Controller & PoE   - Synology DSM Storage/SMART   |
|   TCP Port Check    - NUT UPS Daemon (TCP 3493) - AdGuard Home DNS Stats      |
|   HTTP/S Check      - SNMP v1/v2c (UDP 161)    - Home Assistant Smart Plugs   |
|   DNS Direct UDP    - Generic HTTP/JSONPath                                   |
+-------------------------------------------------------------------------------+
```

---

## 🚀 Avvio Rapido con Docker Compose

NetSentinel viene distribuito come un singolo container Docker multi-stage contenente sia il frontend React compilato che il backend FastAPI ad alte prestazioni.

```yaml
version: "3.8"

services:
  netsentinel:
    image: ghcr.io/marcomatrella/netsentinel:latest
    container_name: netsentinel
    restart: unless-stopped
    network_mode: host
    cap_add:
      - NET_RAW  # Per ping ICMP diretti senza root
    environment:
      - NETSENTINEL_HOST=0.0.0.0
      - NETSENTINEL_PORT=8080
      - NETSENTINEL_DATA_DIR=/data
      - NETSENTINEL_SECRET_KEY=tua_chiave_fernet_opzionale
      - NETSENTINEL_HEARTBEAT_URL=https://hc-ping.com/tuo-uuid-healthchecks
      - TZ=Europe/Rome
    volumes:
      - ./data:/data
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 300M
```

Avvia il servizio:
```bash
docker compose up -d
```

Apri il browser su:
```
http://localhost:8080/
```

---

## 🎨 Il Wizard Interattivo

La configurazione si effettua attraverso un wizard guidato a 8 passi:

1. **Fonti Dati**: Aggiungi le integrazioni locali (UniFi, Synology DSM, AdGuard Home, NUT, Home Assistant) con test istantaneo della connessione.
2. **Tela di Progetto**: Trascina i nodi dalla palette (Internet, Router, Switch, AP, NAS, UPS, Client) e collegali con cavi tipizzati (Ethernet, PoE, Wi-Fi, Power, Logical). Il pulsante **Auto-Layout (ELK.js)** organizza la rete in livelli gerarchici puliti.
3. **Revisione Dipendenze**: Visualizza le relazioni dedotte automaticamente dal disegno (Tabella 4.6 della specifica) con possibilità di override manuale.
4. **Controlli**: Configura intervalli, timeout e soglie per ogni apparato.
5. **Vantage Point & Dead-Man's Switch**: Seleziona il nodo su cui gira NetSentinel e configura il webhook Healthchecks.io.
6. **Notifiche**: Configura SMTP con mail di prova, orari di silenzio (quiet hours) e bypass per guasti critici.
7. **Simulazione Guasti (Dry-Run)**: Fai clic su un nodo o cavo e visualizza in anteprima quali apparati diventerebbero sintomi e quale diagnosi verrebbe emessa, senza inviare alcun allarme reale.
8. **Riepilogo & Salva**: Salva nel database SQLite ed esporta il backup in `netsentinel.yaml`.

---

## 🔍 Le 14 Regole di Diagnosi

NetSentinel include una libreria dichiarativa YAML (`default_rules.yaml`) per diagnosticare i problemi tipici di un home lab:

| Regola | Categoria | Descrizione |
|---|---|---|
| **01** | WAN | Connessione Internet interrotta (ONT/ISP), gateway locale OK |
| **02** | Gateway | Router / Firewall principale offline o congelato |
| **03** | Hardware | Riavvio AP (reboot watchdog, crash o aggiornamento) |
| **04** | Power / Cavo | Perdita alimentazione PoE o disconnessione cavo AP |
| **05** | Cablaggio | Link flapping frequente o crimpatura degradata |
| **06** | Switch | Switch di centro stella offline (tutti i nodi a valle isolati) |
| **07** | Server | NAS offline con caduta dei servizi DNS e DHCP |
| **08** | Servizio | Risoluzione DNS locale degradata o upstream SERVFAIL |
| **09** | Servizio | Pool DHCP saturo o server non rispondente |
| **10** | Power | UPS su batteria per blackout elettrico della rete |
| **11** | Vantage Point | Isolamento locale dell'host su cui gira il monitor |
| **12** | Storage | Volume RAID degradato o peggioramento parametri S.M.A.R.T. |
| **13** | Applicativo | Host raggiungibile via IP ma servizio web/API bloccato |
| **14** | Manutenzione | Aggiornamento firmware programmato con ripristino |

---

## 📚 Documentazione Dettagliata

- [Architettura del Sistema](docs/architecture.md)
- [Algoritmo di Correlazione e Deduplica](docs/correlation.md)
- [Guida allo Sviluppo di Plugin e Collector](docs/plugins.md)
- [Deployment su NAS (Synology, TrueNAS, unRAID, QNAP)](docs/setup-nas.md)
- [Dead-Man's Switch e Watchdog](docs/heartbeat.md)
- [Modello di Sicurezza e Crittografia](docs/security.md)
- [Registro delle Decisioni Architetturali (ADR)](docs/decisions.md)
- [Piano di Progetto per Milestone](docs/plan.md)

---

## 🧪 Test e Qualità del Codice

La suite di test automatizzati include test unitari, test di scenario basati su topologie reali e benchmark di prestazioni:

```bash
# Esecuzione della suite completa (46 test)
uv run pytest

# Linter e formattazione con Ruff
uv run ruff check .

# Type checking statico
uv run mypy
```

---

## 📄 Licenza

Distribuito sotto licenza **MIT**. Consulta il file [LICENSE](LICENSE) per ulteriori informazioni.