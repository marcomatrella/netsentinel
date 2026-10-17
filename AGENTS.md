# NetSentinel — Linee Guida Operative per Agenti IA & Sviluppatori

Questo documento definisce le **regole tassative, i flussi di lavoro e la checklist di rilascio** che qualsiasi assistente IA (o sviluppatore) deve rigorosamente seguire quando lavora su questo repository.

---

## 🏗️ 1. Architettura del Progetto

NetSentinel è composto da tre componenti integrati:

1. **Backend Python (`/backend`)**:
   - Framework: FastAPI, Uvicorn, SQLAlchemy asincrono su SQLite WAL (`/data/netsentinel.db`).
   - Correlazione & Topologia: NetworkX (`TopologyGraph`), deduzione euristica L2/L3 e simulazione What-If.
   - Gestione Dipendenze: Astral `uv` con Python 3.12 (`pyproject.toml`, `uv.lock`).

2. **Frontend SPA (`/frontend`)**:
   - Stack: React 18, TypeScript, Vite, TailwindCSS, `@xyflow/react` (XYFlow), Lucide Icons.
   - Output compilato: `frontend/dist/` (servito direttamente dal backend FastAPI in produzione e nell'add-on).
   - Lettura versione: Visualizzata nella Topbar importando `package.json` (`v{packageJson.version}`).

3. **Home Assistant Add-on (`/netsentinel`)**:
   - Configurazione Supervisor: `netsentinel/config.yaml`.
   - Immagine Docker runtime: `netsentinel/Dockerfile` (estende `ghcr.io/marcomatrella/netsentinel:X.Y.Z`).
   - Changelog visibile in HA: `netsentinel/CHANGELOG.md` (formato specifico per HA Supervisor).

---

## 📋 2. Regole Tassative di Versioning, Branching e Release

> [!CAUTION]
> ### 🛑 GUARDRAIL FONDAMENTALE SUL VERSIONING E GIT:
> 1. **MAI pushare su `main` di propria iniziativa**:
>    - È **severamente vietato** eseguire `git push origin main` senza una **richiesta esplicita dell'utente** (es. *"fai il merge su main e rilascia la versione X.Y.Z"*).
> 2. **MAI creare o pushare Git Tag durante lo sviluppo**:
>    - I tag Git annotati (`vX.Y.Z`) vengono creati **SOLO ed ESCLUSIVAMENTE** quando si sta mergiando sul branch `main` per formalizzare una nuova release su ordine esplicito dell'utente.
> 3. **Il versioning è gestito a livello di intera feature/sprint, MAI per micro-modifiche**:
>    - È **totalmente vietato** incrementare la versione del software per ogni singola modifica, correzione o iterazione intermedia.
>    - Durante lo sviluppo di una nuova funzionalità o ciclo di fix, si lavora stabilmente sul branch di lavoro (es. branch feature o di lavoro indicato dall'utente) mantenendo inalterata la versione.
>    - L'aggiornamento della versione e la checklist dei 10 file si applicano **unicamente quando l'utente comunica che la feature è conclusa e richiede di fare il merge e la release**.

---

## 📋 3. Checklist per Nuove Versioni / Release Ufficiali (Solo su Indicazione Esplicita)

Quando l'utente richiede espressamente di finalizzare e rilasciare una nuova versione `X.Y.Z`, **la versione DEVE essere aggiornata in modo sincronizzato e consistente in TUTTI i file indicati di seguito, SENZA ECCEZIONI**.

### 🔹 Ordine di Esecuzione dei Passaggi:

```mermaid
flowchart TD
    A["1. Modifiche al Codice & Test (pytest)"] --> B["2. Allineamento i18n (it, en, de, fr, es)"]
    B --> C["3. Richiesta Esplicita Utente per Release"]
    C --> D["4. Aggiornamento Versioni (package.json, config.py, pyproject.toml, uv sync, config.yaml, build.yaml, Dockerfile, CHANGELOG)"]
    D --> E["5. Compilazione Frontend (npm run build)"]
    E --> F["6. Verifica Test Completa (uv run pytest)"]
    F --> G["7. Merge su main, Creazione Tag vX.Y.Z & Push GitHub (SOLO su ordine utente)"]
```

---

### 📝 3. Dettaglio dei File da Aggiornare

| # | File | Posizione / Proprietà | Esempio / Istruzione |
|---|---|---|---|
| **1** | `frontend/package.json` | `"version": "X.Y.Z"` | Aggiornare il campo `version` |
| **2** | `frontend/` (Build) | `npm run build` | **OBBLIGATORIO**: compila il nuovo bundle statico in `frontend/dist/`. Se non lo esegui, l'header bar continuerà a mostrare la versione vecchia! |
| **3** | `backend/app/config.py` | `app_version: str = "X.Y.Z"` | Aggiornare il default della classe `Settings` |
| **4** | `pyproject.toml` | `version = "X.Y.Z"` | Aggiornare la sezione `[project]` |
| **5** | `uv.lock` | Eseguire `uv sync` | Rigenera il lockfile con la versione corretta |
| **6** | `netsentinel/config.yaml` | `version: "X.Y.Z"` | Utilizzato da Home Assistant Supervisor per rilevare aggiornamenti |
| **7** | `netsentinel/build.yaml` | `aarch64: "...:X.Y.Z"`, `amd64: "...:X.Y.Z"` | **FONDAMENTALE**: Definisce per Home Assistant Supervisor l'immagine esatta da scaricare per ogni architettura |
| **8** | `netsentinel/Dockerfile` | `ARG BUILD_FROM=ghcr.io/marcomatrella/netsentinel:X.Y.Z` | Fallback immagine GHCR pubblicata dalla CI/CD per quella versione |
| **9** | `netsentinel/CHANGELOG.md` | Inserire `## X.Y.Z` in cima | Previene l'errore HA *"No changelog found for app..."*. Deve contenere un riassunto in italiano |
| **10** | `CHANGELOG.md` (root) | Inserire `## [X.Y.Z] - YYYY-MM-DD` | Changelog ufficiale del repository |

---

## 🧪 4. Regole sui Test Automatizzati

1. **Eseguire sempre la suite di test prima di rilasciare**:
   ```bash
   uv run pytest
   ```
   Tutti i test devono risultare `PASSED` (zero fallimenti o errori).

2. **Se introduci una nuova funzionalità o risolvi un bug**:
   - Aggiungere o aggiornare il relativo test in `tests/backend/` (es. in `test_m3_topology_and_deduction.py`, `test_m2_correlation_scenarios.py`, ecc.).
   - Verificare che il test copra sia il percorso nominale sia i casi limite.

---

## ⚠️ 5. Vincoli Architetturali e Guardrail Fondamentali

1. **Nessun `HEALTHCHECK` nel Dockerfile**:
   - **NON** aggiungere direttive `HEALTHCHECK` in `Dockerfile` o `netsentinel/Dockerfile`.
   - In Home Assistant OS/Supervisor, una direttiva `HEALTHCHECK` non configurata al millimetro blocca l'avvio dell'add-on nello stato perenne `AppState.STARTUP`. La liveness è gestita nativamente dall'endpoint `/healthz` e da Home Assistant Ingress.

2. **Raggiungibilità LAN Locale vs Guasti WAN / Router**:
   - Una caduta della WAN (es. `1.1.1.1` o uplink del provider) **NON** deve mai impostare gli apparati della LAN locale come offline (`unreachable`). La rete interna rimane funzionante (`ok`).
   - Una caduta del Router **NON** deve portare offline i dispositivi attestati sullo switch locale (Switch, NAS, Access Point, Home Assistant). Solo i dispositivi che risiedono dietro al router (come la WAN o host collegati solo alle sue porte/Wi-Fi) diventano irraggiungibili dal Vantage Point.
   - Nodi raggiungibili dal Vantage Point vengono marcati come `unreachable` **esclusivamente** se hanno perso alimentazione fisica (`kind == "power"` da PoE switch o UPS).

3. **Vantage Point Univoco**:
   - Nella topologia può esistere **un solo** dispositivo con il ruolo `vantage_point` (di norma l'host locale Home Assistant / NetSentinel).
   - In caso di import o deduzione con duplicati, il sistema attiva l'auto-healing mantenendo solo il nodo locale.

4. **Compatibilità Ingress & Dual HTTP Binding**:
   - NetSentinel ascolta simultaneamente su due socket HTTP:
     - Porta `8099`: riservata all'Ingress di Home Assistant (gestisce header `X-Ingress-Path` e tag `<base href="...">`).
     - Porta `8181` (o custom): Web UI esterna diretta.
   - Non rompere la logica di rewrite dei percorsi statici in `backend/app/main.py`.

---

---

## 🌐 6. Regola Tassativa sull'Internazionalizzazione (i18n a 5 Lingue)

NetSentinel supporta ufficialmente **5 lingue** in tutta l'interfaccia utente:
1. 🇮🇹 **Italiano** (`frontend/src/i18n/locales/it.json`)
2. 🇬🇧 **Inglese** (`frontend/src/i18n/locales/en.json`)
3. 🇩🇪 **Tedesco** (`frontend/src/i18n/locales/de.json`)
4. 🇫🇷 **Francese** (`frontend/src/i18n/locales/fr.json`)
5. 🇪🇸 **Spagnolo** (`frontend/src/i18n/locales/es.json`)

### ⚠️ Regole Tassative:
1. **Parità al 100% delle Chiavi**:
   - Ogni volta che si introduce o modifica una stringa, un'etichetta, un tooltip o un messaggio nell'interfaccia, la relativa chiave **DEVE essere creata e tradotta coerentemente in TUTTI e 5 i file JSON**.
   - È **severamente vietato** lavorare solo su `it` ed `en` tralasciando `de`, `fr` o `es`.
   - Il set di chiavi tra i 5 file di localizzazione deve sempre risultare identico (zero chiavi mancanti, parità al 100%).

2. **Divieto di Stringhe Hardcodate**:
   - Nei componenti React, utilizzare sempre l'hook `useTranslation()` (`const { t } = useTranslation();`) invocando `t('sezione.chiave')`. Non inserire testo in lingua fissa nei tag JSX.

3. **Verifica Pre-Release**:
   - Prima di completare qualsiasi rilascio, verificare programmaticamente la parità delle chiavi tra i 5 file di localizzazione con il comando:
     ```bash
     python3 -c "import json; locales=['it','en','de','fr','es']; d={l: json.load(open(f'frontend/src/i18n/locales/{l}.json')) for l in locales}; get_k=lambda obj, p='': set().union(*[get_k(v, f'{p}.{k}' if p else k) if isinstance(v, dict) else {f'{p}.{k}' if p else k} for k, v in obj.items()]); it_k=get_k(d['it']); [print(f'{l}: missing {len(it_k - get_k(d[l]))}') for l in locales if it_k - get_k(d[l])]"
     ```
     L'output deve essere vuoto (zero chiavi mancanti per ogni lingua).

---

## 🚀 7. Procedura di Release su GitHub (SOLO SU INDICAZIONE ESPLICITA DELL'UTENTE)

> [!WARNING]
> Questa procedura NON deve MAI essere eseguita automaticamente o di propria iniziativa dall'assistente IA. Eseguirla **SOLO** se l'utente ha scritto esplicitamente di procedere al merge su `main` e al rilascio della versione.

Quando tutti i file della checklist sono stati aggiornati, i test sono verdi e l'utente ha confermato il rilascio:

```bash
# 1. Commit delle modifiche sul branch di lavoro
git add .
git commit -m "fix/feat: descrizione sintetica delle modifiche e rilascio vX.Y.Z"

# 2. Creazione del tag Git annotato (SOLO per release approvata)
git tag -a vX.Y.Z -m "Release vX.Y.Z: descrizione sintetica"

# 3. Push su GitHub (sia main che il tag - SOLO su richiesta dell'utente)
git push origin main
git push origin vX.Y.Z
```

> [!IMPORTANT]
> Il push del tag `vX.Y.Z` scatena automaticamente la GitHub Action `.github/workflows/cd.yml`, che compila le immagini multi-arch (`linux/amd64`, `linux/arm64`) e le pubblica su GitHub Container Registry (`ghcr.io/marcomatrella/netsentinel:X.Y.Z`).


