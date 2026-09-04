# Journal 9 — Deploy e readiness: la strategia C (VPS + Docker Compose + Caddy)

Questo journal racconta il modulo del roadmap dedicato al deploy ("Docker
deploy & readiness"): il passo che porta Pynance da "gira solo sul mio
computer" a "raggiungibile su internet". La mappa delle strategie di deploy —
che cosa sono PaaS, VPS, serverless, e come si sceglie — sta in
`../wiki/deploy-guide.md`; questo journal è il racconto della **strategia C**,
il percorso più formativo (VPS manuale + Docker Compose + reverse proxy), che
in questo modulo abbiamo implementato per intero.

Una premessa importante sulla storia: la C non è diventata il primo deploy
reale. Al momento di andare davvero online abbiamo scelto la **strategia A** —
un PaaS, Render — e il racconto di quel percorso è nel journal successivo
(`10-deploy-paas-render.md`). Questo journal documenta comunque il lavoro
sulla C: perché l'abbiamo fatta, che cosa abbiamo costruito, e che cosa ne è
rimasto quando il progetto è passato al PaaS. I concetti generali non sono
qui: se ti serve capire cos'è un reverse proxy, un multi-stage o una
variabile d'ambiente, la guida `../wiki/deploy-guide.md` e i suoi rimandi
sono il posto giusto.

## Il contesto: dove eravamo, e perché partire dalla C

Fino a questo punto Pynance viveva tutta sul nostro computer: Postgres in un
container, backend su `:8000`, frontend su `:5173`, ogni pezzo raggiungibile
solo attraverso `localhost` e solo dalla nostra macchina. Portare l'app su
internet è diverso dai moduli precedenti: non aggiunge una funzionalità, ma
cambia *come* l'app viene messa in produzione — e questo si fa in modi molto
diversi tra loro.

La guida `../wiki/deploy-guide.md` ordina le strategie dalla più semplice
alla più da sistemista. Per questo modulo abbiamo scelto deliberatamente la
**C**, la più impegnativa: affittare un server vuoto, impacchettare tutto in
immagini Docker e metterci davanti un reverse proxy. Il motivo è didattico ed
esplicito — la guida lo dice nella parte "come scegliere": la C è
insostituibile se l'obiettivo è capire davvero come funziona un deploy. Solo
dopo averla costruita (e non senza fatica) è maturata la decisione opposta:
per il primo deploy reale la A, come racconta il journal 10.

Il modulo si appoggia sui concetti di Docker (immagini, container, volumi,
rete di compose) già visti nel modulo 2 (`02-persistence.md` e
`../wiki/docker-basics.md`) e su due pezzi del modulo 8: il single-origin
senza CORS e la host allow-list di `TrustedHostMiddleware`
(`../wiki/cors.md`, `../wiki/trusted-host.md`).

## Le decisioni prese (e dove sono registrate)

Le scelte di architettura di questo modulo sono registrate in **ADR 0007**
(`../adr/0007-deploy-single-origin-behind-caddy.md`), che costruisce su
ADR 0006 (single-origin, no CORS, TrustedHost) e ADR 0005 (cookie di
sessione). In sintesi:

- **Un solo punto d'ingresso: un reverse proxy Caddy.** Termina TLS, instrada
  tutto il traffico sul backend e gestisce i certificati Let's Encrypt in
  automatico (provisioning e rinnovo), più il redirect `http→https`. È
  l'unico servizio che pubblica porte sull'host (`:80`/`:443`). La scelta di
  Caddy su nginx+certbot è motivata proprio dall'automazione TLS: per
  un'app a singolo dominio la cerimonia di nginx/certbot (installazione,
  cron di rinnovo) è lavoro manuale che Caddy elimina. Il concetto delle due
  strade è in `../wiki/deploy-guide.md` (sezione HTTPS).
- **Single-origin: il backend serve il frontend compilato.** L'immagine
  backend è multi-stage e al suo interno builda anche il frontend; FastAPI
  serve sia `/api/*` sia i file statici. È la stessa forma già decisa in
  ADR 0006 — quella che rende il cookie di sessione (ADR 0005) sicuro senza
  CORS. L'alternativa (frontend in un container nginx separato) è stata
  scartata perché romperebbe il single-origin.
- **Postgres non è esposto in produzione.** Il database vive solo sulla rete
  privata di compose; la porta si pubblica esclusivamente attraverso un file
  di override per lo sviluppo, così `psql` e i test locali continuano a
  funzionare.
- **Il backend si fida del `X-Forwarded-For` del proxy.** La rete di compose
  usa una subnet fissa (`172.20.0.0/24`), il proxy ha un IP fisso
  (`172.20.0.5`), e uvicorn parte con `--proxy-headers` e
  `--forwarded-allow-ips` limitato a quell'IP: i log mostrano gli IP reali
  dei client senza fidarsi di qualunque mittente.
- **Segreti solo via ambiente.** `.env` resta gitignored, compose li inietta
  come variabili d'ambiente, `Settings` li legge: nulla di segreto finisce in
  un layer dell'immagine.
- **`secure_cookies` e `allowed_hosts` sono impostazioni**, non valori
  hardcoded: lo stesso codice gira su HTTP in dev e HTTPS in prod cambiando
  solo il `.env` (rimandi: `../wiki/cookie-flags.md` per il flag `Secure`,
  `../wiki/trusted-host.md` per la allow-list).
- **Le migrazioni girano all'avvio**: l'entrypoint del container esegue
  `alembic upgrade head` prima di lanciare uvicorn, con il `depends_on`
  sull'healthcheck del database.
- **Il bot Telegram è un container opzionale** (stessa immagine, `profiles:
  ["bot"]`), tenuto fuori dallo stack di default.

## Le modifiche al codice, file per file

Il lavoro è confluito in un unico commit di containerizzazione
(`70c494b`, "feat: containerize the stack"), che ha toccato questi file:

### `backend/Dockerfile` — nuovo, multi-stage a tre fasi

È il pezzo centrale del modulo. Le tre fasi risolvono la tensione classica
tra *dipendenza di build* e *dipendenza di runtime*: per buildare servono
ruff, mypy, pytest e tutto il gruppo di sviluppo; per girare serve solo
l'insieme bloccato delle dipendenze runtime più il codice. Il pattern
multi-stage è spiegato in `../wiki/deploy-guide.md` (strategia C); qui le
scelte concrete:

1. **`frontend-build`** (`node:22-alpine`): `npm ci` + `npm run build` →
   produce `dist/`. Node è solo uno strumento di compilazione.
2. **`backend-deps`** (`python:3.14-slim`): copia il binario `uv` dentro
   `python:3.14-slim` e lancia `uv sync --frozen --no-install-project`. Il
   dettaglio non ovvio — come si ottiene uv — è raccontato tra le insidie.
   Questo stage copia anche `pynance/`, `alembic/` e `alembic.ini`, perché lo
   stage runtime li copierà da qui.
3. **`runtime`** (`python:3.14-slim`): non re-installa nulla, copia solo gli
   artefatti dello stage `backend-deps` (`.venv`, codice, migrazioni) e
   `dist/` da `frontend-build`, crea un utente non-root con UID fisso
   (`useradd --uid 10001 appuser`) e gira come quell'utente.

### `backend/entrypoint.sh` — nuovo

Sequenza di avvio: `alembic upgrade head`, poi `exec uvicorn ...` con
`--proxy-headers` e `--forwarded-allow-ips="${FORWARDED_ALLOW_IPS:-172.20.0.5}"`.
Il default dell'IP del proxy rende la configurazione giusta anche senza
variabile esplicita. Il perché delle migrazioni prima del server è in
`../wiki/deploy-guide.md` (sezione migrazioni).

### `docker-compose.yaml` — da solo `db` a stack completo

Il compose di produzione ora descrive quattro servizi sulla rete privata
`app` (subnet fissa `172.20.0.0/24`, IP assegnati a mano):

- **`db`**: `postgres:17`, *senza* porta pubblicata, volume `postgres_data`,
  healthcheck `pg_isready`, `depends_on` con `condition: service_healthy`.
- **`backend`**: build dal Dockerfile sopra, tutte le env da `.env`,
  `ALLOWED_HOSTS` che include il dominio (`["${DOMAIN:-localhost}",
  "localhost", "127.0.0.1"]`), `SECURE_COOKIES: "true"`,
  `FORWARDED_ALLOW_IPS: "172.20.0.5"`.
- **`bot`**: stessa immagine, comando `python -m pynance.bot.main`,
  `profiles: ["bot"]` — non parte con lo stack di default.
- **`proxy`**: `caddy:2`, l'unico con `ports:` pubblicate (`:80`/`:443`),
  `DOMAIN` da ambiente, volumi per `Caddyfile`, `caddy_data` e
  `caddy_config` (i certificati devono sopravvivere al container).

### `docker-compose.dev.yaml` — nuovo, l'override per lo sviluppo

Pubblica la porta di Postgres (`${POSTGRES_PORT}:5432`). Si usa sempre in
accordo al file base: `docker compose -f docker-compose.yaml -f
docker-compose.dev.yaml`. La scelta di non pubblicare la porta nel file
principale è la traduzione concreta della regola "il DB non deve essere
raggiungibile dall'esterno".

### `Caddyfile` — nuovo

Configurazione minima: il blocco `{$DOMAIN}` con `encode`, header
`Strict-Transport-Security` (HSTS) e `X-Content-Type-Options: nosniff`, e un
`reverse_proxy backend:8000`. Il TLS (certificati e rinnovo) lo gestisce
Caddy da solo. Gli header di sicurezza vivono qui, al proxy, e non nell'app:
è quanto ADR 0006 aveva riservato al reverse proxy.

### `.dockerignore` — nuovo, alla root del repo

Esclude `.env` e `.env.*` (i segreti non devono entrare nel build context),
`.git`, le cache (`*.pyc`, `.mypy_cache`, `.ruff_cache`), `local/`,
`backend/tests`, `frontend/node_modules` e `frontend/dist` (ricostruito
dentro l'immagine). Sta alla root perché il build context è la root del repo
(vedi insidie).

### `backend/pynance/config.py` — `secure_cookies`

Aggiunto `secure_cookies: bool = False`. È il knob che il modulo 9 introduce
per passare da HTTP locale a HTTPS in produzione senza toccare il codice.

### `backend/pynance/api/routers/auth.py` — cookie `Secure`

`login` ora passa `secure=settings.secure_cookies` al `set_cookie`: di
default `False` (dev su HTTP), `True` in prod dove il traffico è HTTPS. Il
perché del flag `Secure` è in `../wiki/cookie-flags.md`.

### `backend/pynance/api/routers/static_assets.py` — nuovo

È "il backend serve il frontend" reso codice. Il router monta `/assets` come
file statici, serve `index.html` sulla radice e fa da SPA fallback:
qualunque path che non è un file reale riceve `index.html`, così React Router
gestisce le rotte client-side. Due dettagli che contano:

- l'intero blocco è condizionale su `if FRONTEND_DIST.is_dir():` — in dev la
  cartella non esiste (gira Vite) e il router non si registra, quindi le API
  e i test locali restano intatti;
- le route hanno `include_in_schema=False` e il router va registrato in
  `main.py` **dopo** i router API, altrimenti la catch-all `/{path:path}`
  catturerebbe anche `/api/*`.

### `backend/pynance/api/main.py` — registrazione del router statico

Un `app.include_router(static_assets.router)` in coda ai router API, con il
commento che esplicita la condizione ("single origin; no-op in dev").

### `frontend/Dockerfile` — nuovo, ma fuori dallo stack

Esiste anche un Dockerfile standalone per il frontend (build con Node, runtime
nginx) ma il compose **non lo usa**: con la scelta single-origin il frontend
viene buildato dentro l'immagine backend. Il file resta come strumento per
buildare/ispezionare `dist/` da solo — un residuo della riflessione tra le
due forme possibili che l'ADR 0007 documenta.

### `.env.example` e `README.md`

`.env.example` guadagna `DOMAIN`, `ALLOWED_HOSTS` e `SECURE_COOKIES` (nomi
soli, nessun valore). Il README documenta i due flussi: il deploy
production-shaped (`docker compose build && docker compose up -d`) e lo
sviluppo locale con l'override (`-f docker-compose.yaml -f
docker-compose.dev.yaml up -d db`).

## Le insidie incontrate (e come le abbiamo risolte)

**L'immagine uv non ha tag con la versione di Python pinata.** `uv:0.9-python3.14`
(e le varianti simili) non esistono: solo `latest` e i tag di versione. Il
modo robusto per avere un Python preciso con uv è partire da
`python:3.14-slim` e copiare il binario uv dall'immagine uv
(`COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv`). Così la
versione di Python è quella richiesta dal progetto, senza dipendere da quello
che `uv:latest` si porta dietro.

**Un Dockerfile che builda entrambe le app richiede la root come build
context.** Se nello stesso file compaiono `COPY frontend/...` e `COPY
backend/...`, `docker build` va puntato alla root del repo — e il
`.dockerignore` vive lì, non in `backend/`. Il pattern classico
"context per app" funziona solo quando ogni immagine builda un'app sola.

**Uno stage deve contenere ogni file che uno stage successivo copia.**
Lo stage `backend-deps` produce `.venv`, ma se poi il runtime fa
`COPY --from=backend-deps /app/pynance`, lo stage di build deve aver copiato
anche `pynance/`. L'errore classico è copiare solo `pyproject.toml`/`uv.lock`
nello stage di dipendenze e ritrovarsi con un `COPY --from` che fallisce con
"file not found": lo stage è la *fonte* di ogni artefatto che il runtime si
aspetta.

**La porta di Postgres pubblicata per sbaglio, e l'override dimenticato.**
Nel compose di produzione la porta del DB va tolta — è la regola "il database
non è raggiungibile dall'esterno" — ma in dev serve ancora per `psql` e per
i test. La soluzione è il file di override separato; l'insidia che ne segue è
simmetrica: chi avvia `docker compose up` *senza* l'override in ambiente di
sviluppo si ritrova il container del DB ricreato senza porta pubblicata e i
suoi tool locali non ci parlano più.

**`allowed_hosts` e `secure_cookies` sono lì per essere accesi al deploy.**
La lezione è quasi ovvia dopo il modulo 8, eppure è facile da mancare proprio
perché i test su `localhost` passano comunque: finché il dominio reale non è
nella allow-list, ogni richiesta vera riceve 400; e finché `secure_cookies`
resta `False`, il cookie di sessione viaggerebbe su HTTPS senza il flag
`Secure` (ADR 0007 lo segnala nella lista di hardening). Entrambi si
aggiustano dal `.env` di produzione, senza toccare codice — che è esattamente
il motivo per cui erano stati messi nelle impostazioni.

## Le verifiche fatte

Dalla root del repo:

```bash
docker compose build
docker compose up -d
docker compose ps          # tutti running/healthy
curl -k https://localhost/api/health
```

Con `DOMAIN=localhost`, Caddy usa la sua CA locale, quindi HTTPS funziona
anche senza un dominio pubblico e `curl -k` (o il browser, con l'eccezione
della CA) risponde. Il flusso end-to-end è stato provato per intero:
registrazione, login (il cookie appare `Secure` nei devtools), import del
foglio di calcolo e dashboard. Nei log del backend gli IP dei client
appaiono reali, non quello del proxy — la conferma che `--proxy-headers` e
`--forwarded-allow-ips` fanno il loro lavoro. I test esistenti passano
invariati: il router statico è condizionale e non tocca l'ambiente di test
(ADR 0007 lo registra).

## Cosa è rimasto aperto

- **La strategia C non è diventata il deploy di produzione.** Il percorso è
  stato completato e verificato, ma al momento di andare online è stata
  scelta la strategia A (Render): il journal 10 racconta perché e come. Il
  lavoro di questo modulo resta comunque la base di conoscenza del deploy —
  le scelte portate avanti (Dockerfile multi-stage, single-origin,
  `secure_cookies`, `ALLOWED_HOSTS`) ritornano identiche nel journal 10.
- **Il bot Telegram** è un container opzionale, fuori dallo stack di default;
  la decisione se portarlo in produzione è rimandata (il journal 10 la
  riprende esplicitamente).
- **Rate limiting al proxy, monitoring (Prometheus/Grafana) e scaling
  multi-istanza**: fuori scope per questa scala, annotati per dopo.
- **`X-Forwarded-For` / `--proxy-headers`**: affrontati in pratica in questo
  modulo ma senza una wiki dedicata che insegni il concetto (il modulo 8 lo
  aveva segnalato come da approfondire).