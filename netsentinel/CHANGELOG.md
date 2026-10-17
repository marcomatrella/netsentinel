# Changelog - NetSentinel Home Assistant Add-on

Tutte le modifiche rilevanti per l'add-on NetSentinel di Home Assistant sono documentate qui.

## 1.2.0

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

---

## 1.1.13

### Novità & Miglioramenti
- **Riorganizzazione Menu e Sezione "Configurazioni generali"**: Riorganizzato il menu dropdown con la nuova sezione dedicata che raggruppa *Notifiche*, *Servizi DNS e DHCP* e *Interventi programmati*.
- **Rimozione Wizard Guidato dal Menu**: Il wizard a 8 passi è stato rimosso dal menu ordinario ed è ora riservato esclusivamente al primo onboarding / setup iniziale.
- **Rinnovamento Grafico Registro Eventi (Minimal NOC Table)**: Il log eventi è stato completamente ridisegnato: eliminati i vecchi accordion/card separati in favore di un'unica tabella minimal con intestazioni fisse (`sticky headers`), testo ad alta densità, badge di severità ed evidenziazione ad alto contrasto con bordo colorato laterale (`border-l-4`) per allarmi `CRIT` e `WARN`.
- **Separazione Eventi di Riavvio nel Registro Eventi**: Gli eventi di riavvio (`reboot_detected`) non affollano più la vista predefinita "Tutti" né la scheda "Avvisi", ma sono isolati in un tab dedicato **"Riavvii"** (`reboots`) con icona `RotateCw`.
- **Espansione Notifiche: Email SMTP & Notifiche Push Web (PWA)**: Il pannello notifiche è ora strutturato in tab dedicati. È stato introdotto il supporto nativo per le **Notifiche Push Web / PWA** con richiesta di autorizzazione esplicita al browser, test istantaneo e avvisi push su allarmi critici e ripristini in tempo reale via SSE.
- **Finestra di Assestamento (Settling Window) Anti-Tempesta Log**: Quando si verifica una transizione anomala o una serie di fallimenti a cascata (come il riavvio notturno del router), il sistema raccoglie le transizioni in background prima di scrivere nel DB. Solo dopo l'isolamento della causa radice viene generato un unico log pulito di apertura incidente, sopprimendo log `WARN` ed eventi intermedi ridondanti.
- **Accorpamento Email (Unica Email per Incidente)**: Modificata la logica di notifica: il sistema invia rigorosamente una sola email per incidente all'apertura, evitando raffiche di email per ogni singolo dispositivo secondario e prevenendo il rate-limiting SMTP.
- **Riconoscimento Automatico Offline WAN / Router & Report Consolidato**: Se il router o la linea WAN cadono, il sistema blocca i tentativi di invio SMTP esterni e accoda le comunicazioni. Al ripristino della connettività Internet recapita un unico report riassuntivo consolidato con durata totale, causa radice e conferma del ripristino.
- **Risoluzione Completa Stringhe Non Decodificate (i18n)**: Allineate e introdotte in tutte le 5 lingue supportate (it, en, de, fr, es) le chiavi relative a `events.narratives.*` (`device_offline_headline`, `device_offline_explanation`, `device_offline_actionable`, `device_managed_*`, `device_restored_*`, `unknown_device`).

---

## 1.1.12

### Novità & Miglioramenti
- **Distinzione Visiva Guasto Primario vs Nodi Irraggiungibili**: Nel canvas di rete, i nodi con guasto primario (`down` / Root Cause) mostrano ora il badge rosso di allarme `🚨 GUASTO`, mentre i nodi a valle impattati collateralmente mostrano chiaramente il badge ambra `⚠️ IRRAGGIUNGIBILE` con bordo tratteggiato.
- **Rilevamento e Segnalazione Isolamento Vantage Point**: Quando il Vantage Point (es. Home Assistant) perde l'intero collegamento con lo switch di attestazione o la LAN, non rimane più ingannevolmente verde `ok`, ma assume lo stato `ISOLATO DA LAN` con bordo indaco pulsante e badge dedicato.
- **Supporto multilingua completo**: Aggiunte e aggiornate le etichette di stato `status_down`, `status_unreachable` e `status_isolated` per italiano, inglese, tedesco e francese.

---

## 1.1.11

### Risolto
- **Allineamento Immagine Add-on Supervisor (`build.yaml`)**: Aggiornato `netsentinel/build.yaml` per puntare alla versione corrente dell'immagine container su GHCR per tutte le architetture (`aarch64` e `amd64`), consentendo a Home Assistant Supervisor di scaricare effettivamente la versione più recente anziché rimanere bloccato su v1.1.8.
- **Risoluzione Simulazione What-If e Raggiungibilità LAN**: Integrato il fix definitivo per la connettività LAN locale nominale durante i guasti simulati di router e WAN.

---

## 1.1.10

### Risolto
- **What-If Simulation e Raggiungibilità LAN**: Risolta definitivamente l'anomalia per cui la simulazione di guasto sul Router o sulla WAN portava l'intera rete locale (Switch, NAS, AP, HA) offline.
- **Isolamento Guasti WAN / Gateway**: La caduta della connessione WAN o del router preserva al 100% lo stato nominale (`ok`, verde) dei dispositivi attestati sullo switch locale raggiungibili dal Vantage Point.
- **Sintomi di Simulazione Coerenti**: I nodi raggiungibili via LAN non vengono più aggiunti ai sintomi né marcati come impattati in assenza di reale perdita di alimentazione/connettività fisica.
- **Fallback Automatico Vantage Point**: Se il Vantage Point non è esplicitamente designato, la simulazione individua automaticamente un nodo attivo della topologia fisica senza degradare arbitrariamente l'albero downstream.

---

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

