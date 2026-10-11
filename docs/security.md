# NetSentinel — Modello di Sicurezza e Protezione Dati

NetSentinel è progettato per operare all'interno del perimetro di una rete domestica fidata (LAN/VLAN di gestione), adottando le migliori pratiche di sicurezza per proteggere credenziali e integrità degli apparati.

---

## 1. Principi di Sicurezza

1. **Garanzia di Sola Lettura (Read-Only)**:
   - NetSentinel **non modifica mai** la configurazione degli apparati monitorati. Non invia comandi di scrittura a switch, router, NAS o controller.
   - Non effettua modifiche a firewall, routing o tabelle ARP.

2. **Cifratura dei Segreti a Riposo (AES-128-CBC + HMAC)**:
   - Password SMTP, token di accesso Home Assistant, chiavi API UniFi e community string SNMP sono cifrate nel database SQLite utilizzando **Fernet** (derivato tramite PBKDF2-HMAC-SHA256 con 100.000 iterazioni).
   - La chiave crittografica è caricata dalla variabile d'ambiente `NETSENTINEL_SECRET_KEY` o memorizzata con permessi restrittivi `0600` nel file `secret.key`.
   - Nelle API REST e nelle esportazioni di configurazione, i segreti vengono automaticamente oscurati (`mask_secret`) e non appaiono mai in chiaro nei log.

3. **Esecuzione Non-Root con Linux Capabilities**:
   - Nel container Docker, l'applicazione gira con l'utente non privilegiato `netsentinel` (UID 1000, GID 1000).
   - Per eseguire ping ICMP raw senza richiedere l'utente root, al binario Python viene assegnata la Linux capability `cap_net_raw+ep`:
     ```bash
     setcap cap_net_raw+ep $(readlink -f $(which python3))
     ```
   - In ambienti dove `cap_add: [NET_RAW]` non è disponibile, NetSentinel attiva automaticamente il fallback su probe TCP connect.

4. **Isolamento e Rete Locale**:
   - NetSentinel non espone porte all'esterno della LAN a meno che l'utente non configuri esplicitamente un reverse proxy con TLS (es. Nginx Proxy Manager, Traefik o Cloudflare Tunnel).
   - Non richiede connessioni in ingresso da Internet. Tutte le comunicazioni verso l'esterno (email SMTP, notifiche ntfy, ping dead-man's switch) sono connessioni in uscita unidirezionali.

5. **Sanitizzazione Input & Pydantic v2**:
   - Qualsiasi configurazione importata via YAML o REST API è rigorosamente convalidata tramite modelli Pydantic v2 per prevenire attacchi di injection.

