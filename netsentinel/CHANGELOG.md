# Changelog - NetSentinel Home Assistant Add-on

Tutte le modifiche rilevanti per l'add-on NetSentinel di Home Assistant sono documentate qui.

## 1.1.9

### Risolto
- **What-If Simulation su Router/Gateway**: La simulazione di guasto del router non imposta più tutti gli apparati della LAN come offline. Lo switch, il NAS e l'Access Point rimangono operativi e raggiungibili dal Vantage Point (Home Assistant).
- **Distinzione Raggiungibilità Fisica vs Servizio WAN**: I dispositivi che perdono l'uscita Internet sono ora segnalati come `affected` (degradati per assenza di WAN) anziché `unreachable`.
- **Dipendenze Soft**: Impostata correttamente a `soft` la severità delle relazioni di dipendenza dedotte per Gateway L3, server DHCP e resolver DNS.

---

## 1.1.8

### Risolto
- **Wizard Setup Iniziale**: Risolto il conflitto di ruoli duplicati: Vantage Point univoco assegnato esclusivamente all'host locale Home Assistant, eliminato duplicato su MacBook.
- **Ruolo DNS su NAS**: Eliminata la pre-assegnazione errata del resolver DNS sul NAS se il router è già configurato come DNS.
- **Usabilità Schede Apparati**: L'intero riquadro dell'apparato nel wizard e nella lista ora è cliccabile per visualizzare e modificare i dettagli (non solo l'icona matita).
- **Header**: Allineata la visualizzazione della versione a v1.1.8.

---

## 1.1.7

### Risolto
- **Risolto Blocco Avvio Add-on**: Rimosso completamente il comando `HEALTHCHECK` dai Dockerfile per evitare che Home Assistant Supervisor rimanga bloccato indefinitamente nello stato `AppState.STARTUP` ("in avvio"). L'add-on risulta ora pronto istantaneamente.

---

## 1.1.6

### Risolto
- **Asset 404 sotto Ingress**: Corretto il caricamento dei file JavaScript e CSS sotto il reverse proxy Ingress di Home Assistant.

---

## 1.1.5

### Aggiunto
- **Doppio Socket HTTP / Ingress**: Supporto nativo per l'accesso simultaneo tramite Ingress (porta 8099) e porta esterna diretta (default 8181) configurabile dalle opzioni dell'add-on.
- **Configurazione Opzioni HA**: Gestione timezone, subnet e certificati SSL direttamente dal pannello Configurazione dell'add-on.
