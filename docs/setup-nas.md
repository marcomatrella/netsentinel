# NetSentinel — Guida al Deployment su NAS (Synology DSM, TrueNAS, unRAID, QNAP)

NetSentinel è progettato per essere eseguito direttamente sul NAS centrale della rete domestica (che funge naturalmente da **Vantage Point**).

---

## 1. Requisiti di Sistema

- **RAM**: < 200 MB allocati
- **CPU**: < 3% di utilizzo a riposo (anche su CPU Intel Celeron / ARMv8 di NAS domestici)
- **Disco**: Minime scritture su HDD grazie al WAL di SQLite e al batching asincrono in memoria.
- **Rete**: `network_mode: host` o bridge con inoltro delle porte. La modalità `host` è caldamente consigliata per consentire la corretta esecuzione di ping ICMP, scansione ARP e rilevamento broadcast/multicast.

---

## 2. Docker Compose di Esempio

Crea un file `docker-compose.yml` nella cartella di installazione (es. `/volume1/docker/netsentinel/` su Synology):

```yaml
version: "3.8"

services:
  netsentinel:
    image: ghcr.io/marcomatrella/netsentinel:latest
    container_name: netsentinel
    restart: unless-stopped
    network_mode: host
    cap_add:
      - NET_RAW  # Necessario per eseguire ping ICMP diretti senza privilegi root
    environment:
      - NETSENTINEL_HOST=0.0.0.0
      - NETSENTINEL_PORT=8080
      - NETSENTINEL_DATA_DIR=/data
      - NETSENTINEL_SECRET_KEY=tua_chiave_segreta_32_caratteri_base64
      - NETSENTINEL_HEARTBEAT_URL=https://hc-ping.com/tuo-uuid-healthchecks
      - TZ=Europe/Rome
    volumes:
      - ./data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 300M
```

Avvia il container:
```bash
docker compose up -d
```

Accedi all'interfaccia web all'indirizzo `http://<ip-del-nas>:8080/`.

---

## 3. Configurazione Specifica per Synology DSM (Container Manager)

1. Apri **Container Manager** (o Docker) su DSM.
2. Vai su **Progetto** &rarr; **Crea**.
3. Incolla il contenuto del file `docker-compose.yml` sopra riportato.
4. Assicurati che la cartella `/volume1/docker/netsentinel/data` abbia i permessi di lettura/scrittura per l'utente UID 1000:
   ```bash
   sudo chown -R 1000:1000 /volume1/docker/netsentinel/data
   ```
5. Avvia il progetto.

---

## 4. Backup e Ripristino

Tutti i dati, le configurazioni grafiche e lo storico vivono all'interno della cartella `./data`:
- `netsentinel.db`: Database SQLite (WAL).
- `secret.key`: Chiave crittografica dei segreti.

Per effettuare un backup completo a freddo:
```bash
docker compose stop
tar -czvf netsentinel_backup_$(date +%F).tar.gz ./data
docker compose start
```
Oppure esporta direttamente il file `netsentinel.yaml` dalla Web UI o tramite `GET /api/v1/topology/export/yaml`.
