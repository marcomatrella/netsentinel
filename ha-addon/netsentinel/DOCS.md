# NetSentinel Home Assistant Add-on

Piattaforma di monitoraggio e Root Cause Analysis per LAN e HomeLab.

## Caratteristiche
- 🗺️ Mappa topologica interattiva e auto-discovery della subnet
- 🧠 Correlazione eventi e Root Cause Analysis (Zero Alert Storm)
- ⏱️ Macchina del tempo storica
- 🛠️ Gestione finestre di manutenzione programmata (puntuali e ricorrenti)
- 🔕 Tracciamento passivo dei client (zero falsi positivi)

## Configurazione
- `subnet` (opzionale): se omessa, NetSentinel rileva automaticamente la subnet locale di Home Assistant. Esempio: `192.168.1.0/24`.
- `timezone`: Fuso orario (default `Europe/Rome`).
- `auth_enabled`: Abilita/disabilita l'autenticazione web.

## Rete & Privilegi
L'add-on è configurato con `host_network: true` e capability `NET_RAW` per consentire le scansioni ARP e i ping ICMP a bassissimo impatto sulla tua rete locale.
La Web UI è accessibile sulla porta `8080`.
