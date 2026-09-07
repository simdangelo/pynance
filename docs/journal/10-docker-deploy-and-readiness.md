# Journal 10 — Il deploy completo: VPS con Docker Compose e Caddy

Questo journal racconta il deploy completo di Pynance su un **VPS**: il passo
successivo al primo deploy su Render (journal 09). Non spiega i concetti
generali — PaaS vs VPS, reverse proxy, multi-stage, env vars — che stanno
nella wiki `../wiki/deploy-guide.md`; qui c'è *che cosa abbiamo fatto*, file
per file, quali insidie abbiamo incontrato e come le abbiamo risolte. Se non
hai letto la guida, leggila prima: il journal è il racconto
dell'applicazione, non la teoria.

---

## Il contesto: perché il VPS, dopo Render

Il journal 09 racconta il primo deploy su Render: un PaaS "tutto in uno" che
ci ha portato online in fretta, con un free tier reale. Ma quel percorso ha
tre limiti, e tutti e tre sono diventati tangibili:

- **Il database free scade dopo 90 giorni** — il Postgres di Render non è
  gratis per sempre, e il conto alla rovescia era partito.
- **Il bot Telegram non può girare lì** — Render non offre un worker free, e
  il long-polling dentro un web service free soffrirebbe il cold start.
- **Il cold start (~50s)** — l'app "dorme" dopo l'inattività e la prima
  richiesta è lenta.

Il passo naturale è la **strategia C** della guida: un **VPS** con tutto
l'ambiente sotto controllo — web, bot, database e reverse proxy nello stesso
posto, sempre acceso, con i segreti che restano nostri. È la forma di deploy
più "produzione-ready" e l'unica che risolve i tre limiti insieme.

### Le decisioni di fondo (e dove sono registrate)

Le scelte architetturali di questo modulo sono in **ADR 0007**
(`../adr/0007-deploy-single-origin-behind-caddy.md`), che costruisce su
ADR 0006 (single-origin, no CORS, TrustedHost) e ADR 0005 (cookie di
sessione). In sintesi:

- **Un solo punto d'ingresso: un reverse proxy Caddy.** Termina TLS,
  instrada tutto il traffico sul backend e gestisce i certificati Let's
  Encrypt in automatico (provisioning e rinnovo), più il redirect
  `http→https`. È l'unico servizio che pubblica porte sull'host
  (`:80`/`:443`). La scelta di Caddy su nginx+certbot è motivata
  dall'automazione TLS: per un'app a singolo dominio la cerimonia di
  nginx/certbot (installazione, cron di rinnovo) è lavoro manuale che Caddy
  elimina. Il concetto delle due strade è in `../wiki/deploy-guide.md`.
- **Single-origin: il backend serve il frontend compilato.** L'immagine
  backend è multi-stage e al suo interno builda anche il frontend; FastAPI
  serve sia `/api/*` sia i file statici. È la stessa forma del journal 09 —
  quella che rende il cookie di sessione (ADR 0005) sicuro senza CORS.
- **Postgres non è esposto in produzione.** Il database vive solo sulla rete
  privata di compose; la porta si pubblica esclusivamente attraverso un file
  di override per lo sviluppo, così `psql` e i test locali continuano a
  funzionare.
- **Il backend si fida del `X-Forwarded-For` del proxy.** La rete di compose
  usa una subnet fissa (`172.20.0.0/24`), il proxy ha un IP fisso
  (`172.20.0.5`), e uvicorn parte con `--proxy-headers` e
  `--forwarded-allow-ips` limitato a quell'IP: i log mostrano gli IP reali
  dei client senza fidarsi di qualunque mittente.
- **Segreti solo via ambiente.** `.env` resta gitignored (solo `.env.example`
  è committato), compose li inietta come variabili d'ambiente, `Settings` li
  legge: nulla di segreto finisce in un layer dell'immagine.
- **Il bot è un container nello stesso stack**, con `profiles: ["bot"]`:
  non parte con lo stack di default, ma in produzione si avvia con
  `--profile bot`. Così lo sviluppo locale resta invariato.
- **Backup del database.** Su un VPS free tier la piattaforma non protegge i
  dati: un cron sul host fa `pg_dump` giornaliero e ruota i file (ultime 7).

### La scelta del provider: Oracle Cloud Free Tier

Il VPS è su **Oracle Cloud**, dentro il **free tier**:

- **Shape ARM Ampere A1.Flex**, 2 OCPU / 12GB RAM (la quota free di Oracle a
  giugno 2026 è stata dimezzata da 4/24 a 2/12; per web + bot + Postgres +
  Caddy è comunque abbondante). La Micro AMD da 1GB del free tier non
  basterebbe per uno stack con database, web, bot e proxy insieme: per
  questo deploy serve la shape ARM con RAM reale.
- **Networking da configurare.** Il deploy su Oracle si fa su risorse
  vergini: VCN, subnet pubblica, Internet Gateway e security list (ingress
  su `22`, `80`, `443`) vanno create insieme alla VM ARM.
- **Dominio comprato** (es. ~10-15€/anno): Caddy ne ha bisogno per emettere
  i certificati Let's Encrypt. Un record **A** punta il dominio all'IP
  pubblico della VM.
- **Niente migrazione dati**: il database sul VPS parte vuoto (nessun dato
  reale su Render da preservare) — lo schema lo crea `alembic upgrade head`
  nell'entrypoint.

---

## La configurazione, file per file

### `docker-compose.yaml` — lo stack completo

Il compose di produzione descrive **quattro servizi** sulla rete privata
`app` (subnet fissa `172.20.0.0/24`, IP assegnati a mano):

- **`db`**: `postgres:17`, *senza* porta pubblicata, volume `postgres_data`,
  healthcheck `pg_isready`, `depends_on` con `condition: service_healthy`.
- **`backend`**: build dal Dockerfile multi-stage, tutte le env da `.env`,
  `ALLOWED_HOSTS=["${DOMAIN:-localhost}", "localhost", "127.0.0.1"]`,
  `SECURE_COOKIES: "true"`, `FORWARDED_ALLOW_IPS: "172.20.0.5"`.
- **`bot`**: stessa immagine, `command: ["uv", "run", "python", "-m",
  "pynance.bot.main"]`, `profiles: ["bot"]` — non parte con lo stack di
  default.
- **`proxy`**: `caddy:2`, l'unico con `ports:` pubblicate (`:80`/`:443`),
  `DOMAIN` da ambiente, volumi per `Caddyfile`, `caddy_data` e
  `caddy_config` (i certificati devono sopravvivere al container).

### `docker-compose.dev.yaml` — l'override per lo sviluppo

Pubblica la porta di Postgres (`${POSTGRES_PORT}:5432`). Si usa sempre in
accordo al file base: `docker compose -f docker-compose.yaml -f
docker-compose.dev.yaml up -d db`. La scelta di non pubblicare la porta nel
file principale è la traduzione concreta della regola "il DB non deve essere
raggiungibile dall'esterno".

### `Caddyfile` — il proxy

Configurazione minima: il blocco `{$DOMAIN}` con `encode`, header
`Strict-Transport-Security` (HSTS) e `X-Content-Type-Options: nosniff`, e un
`reverse_proxy backend:8000`. Il TLS (certificati e rinnovo) lo gestisce
Caddy da solo. Gli header di sicurezza vivono qui, al proxy, e non nell'app:
è quanto ADR 0006 aveva riservato al reverse proxy.

### `.dockerignore` — alla root del repo

Esclude `.env` e `.env.*` (i segreti non devono entrare nel build context),
`.git`, le cache (`*.pyc`, `.mypy_cache`, `.ruff_cache`), `local/`,
`backend/tests`, `frontend/node_modules` e `frontend/dist` (ricostruito
dentro l'immagine). Sta alla root perché il build context è la root del repo
(vedi insidie).

### `backend/Dockerfile` — multi-stage (già dal journal 09)

L'immagine builda entrambe le app: un stage Node produce `dist/`, uno stage
uv installa le dipendenze backend, lo stage runtime copia solo gli artefatti
(site-packages, codice, `alembic/`, `dist/`) e gira come utente non-root
(`USER 10001`). Dettagli e insidie sono nel journal 09; qui conta che la
stessa immagine serve sia il web sia il bot.

### `backend/entrypoint.sh` — migrazioni prima del server

Esegue `alembic upgrade head` (schema prima del codice, come da guida) poi
lancia uvicorn. In produzione parte con `--proxy-headers` e
`--forwarded-allow-ips="${FORWARDED_ALLOW_IPS:-172.20.0.5}"` — il default è
l'IP fisso del proxy, quindi la configurazione è giusta anche senza
variabile esplicita.

### `scripts/backup.sh` e `scripts/restore.sh` — la continuità dei dati

Il backup è volutamente semplice: nessun servizio extra, gira da cron sul
host.

```bash
# cron: ogni giorno → pg_dump nel container db, gzip, rotazione (ultime 7)
docker compose exec -T db pg_dump -U $POSTGRES_USER $POSTGRES_DB | gzip \
  > /opt/pynance/backups/pynance-$(date +%F).sql.gz
find /opt/pynance/backups -name '*.gz' -mtime +7 -delete
```

`restore.sh` fa l'operazione inversa (gzip -dc | `docker compose exec -T db
psql`). La lezione registrata: **su un VPS free tier il backup non è un
optional** — la piattaforma tratta le risorse gratuite come usa-e-getta, e
il DB dei soldi veri deve poter rinascere da solo.

### `.env.example`, `README.md`

`.env.example` guadagna `DOMAIN` (nome solo, nessun valore). Il README
documenta il flusso production-shaped (`docker compose --profile bot up -d
--build`) accanto a quello del journal 09.

---

## Le insidie incontrate (e come le abbiamo risolte)

1. **L'immagine uv non ha tag con la versione di Python pinata.**
   `uv:0.9-python3.14` (e le varianti simili) non esistono: solo `latest` e i
   tag di versione. Il modo robusto per avere un Python preciso con uv è
   partire da `python:3.14-slim` e copiare il binario uv dall'immagine uv
   (`COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv`). Così la
   versione di Python è quella richiesta dal progetto, senza dipendere da
   quello che `uv:latest` si porta dietro.

2. **Un Dockerfile che builda entrambe le app richiede la root come build
   context.** Se nello stesso file compaiono `COPY frontend/...` e `COPY
   backend/...`, `docker build` va puntato alla root del repo — e il
   `.dockerignore` vive lì, non in `backend/`. Il pattern classico "context
   per app" funziona solo quando ogni immagine builda un'app sola.

3. **Uno stage deve contenere ogni file che uno stage successivo copia.**
   Lo stage `backend-deps` produce `.venv`, ma se poi il runtime fa `COPY
   --from=backend-deps /app/pynance`, lo stage di build deve aver copiato
   anche `pynance/`. L'errore classico è copiare solo `pyproject.toml`/
   `uv.lock` nello stage di dipendenze e ritrovarsi con un `COPY --from` che
   fallisce con "file not found": lo stage è la *fonte* di ogni artefatto
   che il runtime si aspetta.

4. **La porta di Postgres pubblicata per sbaglio, e l'override dimenticato.**
   Nel compose di produzione la porta del DB va tolta — è la regola "il
   database non è raggiungibile dall'esterno" — ma in dev serve ancora per
   `psql` e per i test. La soluzione è il file di override separato;
   l'insidia che ne segue è simmetrica: chi avvia `docker compose up` *senza*
   l'override in ambiente di sviluppo si ritrova il container del DB ricreato
   senza porta pubblicata e i suoi tool locali non ci parlano più.

5. **`allowed_hosts` e `secure_cookies` sono lì per essere accesi al
   deploy.** La lezione è quasi ovvia dopo il modulo 8, eppure è facile da
   mancare proprio perché i test su `localhost` passano comunque: finché il
   dominio reale non è nella allow-list, ogni richiesta vera riceve 400; e
   finché `secure_cookies` resta `False`, il cookie di sessione viaggerebbe
   su HTTPS senza il flag `Secure` (ADR 0007 lo segnala nella lista di
   hardening). Entrambi si aggiustano dal `.env` di produzione, senza toccare
   codice — che è esattamente il motivo per cui erano stati messi nelle
   impostazioni.

6. **Oracle ARM: "Out of host capacity".** Le shape Ampere A1 sono spesso
   sature nelle regioni popolari: la creazione può fallire con capacity
   error. Si retenta, o si prova in un Availability Domain diverso. Non è un
   errore di configurazione.

7. **Caddy al primo boot e DNS non ancora propagato.** Let's Encrypt verifica
   che il dominio risolva all'IP del server prima di emettere il
   certificato. Se il record A non è ancora propagato, la prima emissione
   fallisce — non è un errore di configurazione: si aspetta la propagazione e
   si riavvia solo il container `proxy`.

---

## Le verifiche fatte

Dalla root del repo:

```bash
docker compose --profile bot up -d --build
docker compose ps          # tutti running/healthy
curl https://<DOMAIN>/api/health
```

- `https://<DOMAIN>/api/health` → `{"status":"ok"}` via HTTPS con il
  certificato reale.
- Registrazione e login funzionano; il cookie di sessione appare `Secure` nei
  devtools.
- SPA fallback: `https://<DOMAIN>/transactions` → 200 (index.html, gestito da
  React Router).
- Bot Telegram: `/start`, `/link` e "➕ Nuova spesa" completano il flusso
  end-to-end (il flusso conversazionale è descritto nel journal 06).
- Nei log del backend gli IP dei client appaiono reali, non quello del proxy
  — la conferma che `--proxy-headers` e `--forwarded-allow-ips` fanno il
  loro lavoro.
- `ls /opt/pynance/backups/` mostra un backup `.gz` presente dopo il primo
  cron.
- I test esistenti passano invariati: il router statico è condizionale e non
  tocca l'ambiente di test (ADR 0007 lo registra).

## Lo smoke test locale (prima del VPS)

Prima di portare lo stack su un server vero, l'abbiamo provato in locale con
`DOMAIN=localhost` (Caddy usa la sua CA locale, quindi `curl -k` o il browser
con l'eccezione della CA rispondono su HTTPS):

```bash
docker compose up -d --build db backend proxy
curl -k https://localhost/api/health        # {"status":"ok"}
curl -k https://localhost/transactions      # 200 (SPA fallback)
```

Esito: health 200, SPA fallback 200, migrazioni eseguite all'avvio, e nei
log del backend gli IP dei client appaiono reali (`172.20.0.1`, il gateway
di compose) — la conferma locale che `--proxy-headers` e
`--forwarded-allow-ips` funzionano. Il bot non è stato avviato nello smoke
test (richiede un token Telegram reale).

**Un'insidia in più registrata**: il primo `docker compose up` (senza
`--build`) ha riusato un'immagine `pynance-backend` stantia di build
precedenti, che non conteneva le migrazioni più recenti → il backend è
entrato in restart loop con "Can't locate revision identified by
'...'". Fix: `docker compose up -d --build` (o `docker compose build`
prima di `up`). Sul server vero, la prima volta si usa sempre `--build`.

## Cosa è rimasto aperto

- **Le restrizioni del free tier Oracle possono cambiare.** A giugno 2026
  Oracle ha dimezzato la quota ARM (4/24 → 2/12) senza annuncio. La lezione
  (già registrata nel journal 09 a proposito del DB free di Render) vale
  doppia qui: il free tier è usa-e-getta. Se un giorno le risorse non
  bastassero, il passo successivo è un VPS pagato (es. Hetzner) che usa la
  stessa identica configurazione.
- **Rate limiting al proxy, monitoring (Prometheus/Grafana) e scaling
  multi-istanza**: fuori scope per questa scala, annotati per dopo.
- **Backup verso storage esterno**: oggi i backup vivono sul disco del VPS;
  in futuro si può migliorare con object storage free.