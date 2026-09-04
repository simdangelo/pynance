# Journal 10 — Deploy con la strategia A: Render in pratica

Questo journal racconta il deploy dell'app su **Render** (strategia A della
guida). Non spiega i concetti generali — CORS, multi-stage, env vars, ecc.
stanno nella wiki `../wiki/deploy-guide.md` — ma *che cosa abbiamo fatto
in questo modulo*, file per file, quali insidie abbiamo incontrato e come le
abbiamo risolte. Se non hai letto la guida, leggila prima: il journal è il
racconto dell'applicazione, non la teoria.

---

## Il contesto: cosa siamo andati a fare

Al termine del modulo 9 l'app girava solo su `localhost`. Avevamo già
esplorato la **strategia C** (deploy manuale su VPS, documentata in
`09-docker-deploy-and-readiness.md`) ma avevamo deciso di non usarla per il
primo deploy reale: troppo lavoro di sistemista per chi sta imparando. La
guida consiglia di partire dalla **A** (PaaS "tutto in uno") per andare
online in fretta, e di rifare la C in un secondo momento.

La scelta è caduta su **Render** e non su Railway (l'altra candidata) per un
motivo preciso: al momento della scelta Render ha un **free tier reale**
(web service gratuito, nessuna carta di credito), mentre Railway offre un
credito una-tantum che si esaurisce. Il prezzo è il **cold start**: dopo un
periodo di inattività il servizio si "addormenta" e la prima richiesta dopo
la pausa impiega ~50 secondi. Compromesso accettato per un'app personale a
zero spese.

**Un avvertimento sulla gratuità del database**: il Postgres free di Render
è gratis solo per 90 giorni, poi o si paga o non è più disponibile. L'abbiamo
accettato per il primo deploy; la soluzione futura è spostarsi su un Postgres
serverless con piano gratuito permanente (Neon o Supabase) cambiando solo la
`DATABASE_URL`. Il codice non cambia — è proprio il vantaggio di leggere la
connessione da una singola variabile.

---

## Le decisioni prese (e dove sono registrate)

- **Single-origin: un solo servizio, un solo URL.** Invece dei due servizi
  separati che la strategia A descrive (frontend statico + backend, che
  reintroduce il CORS), il backend serve sia le API sia i file del frontend
  compilato. Così su Render c'è un solo web service e zero CORS da
  configurare. È la stessa forma della strategia C, già decisa in ADR 0006
  (single-origin) e ADR 0007 (l'immagine che contiene tutto).
- **Build con Dockerfile, non con la build automatica.** Render può
  buildare anche da solo (Nixpacks), ma abbiamo scelto il Dockerfile: è
  esplicito, ci dà controllo, ed è l'infrastruttura condivisa che servirà
  anche per la strategia C in futuro.
- **Cookie `Secure` e host allow-list abilitati in prod.** `SECURE_COOKIES`
  e `ALLOWED_HOSTS` sono i due knob che in produzione si accendono (ADR
  0005 e ADR 0006).
- **Primo deploy senza bot Telegram.** Il bot è un processo a long-polling
  che non è il fit naturale di un web service HTTP; lo aggiungeremo dopo, se
  decideremo di volerlo in prod.

---

## Le modifiche al codice, file per file

Partiti dalla branch `deploy` (un ramo pulito senza il lavoro di
containerizzazione del modulo 9, per re-imparare il percorso da zero). I file
toccati:

### `backend/pynance/config.py` — la `DATABASE_URL`

Il config costruiva la connessione a Postgres da **cinque variabili**
(`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`,
`POSTGRES_DB`). Le piattaforme PaaS danno invece **una singola stringa**
pronta:

```
postgresql://utente:password@host:porta/database
```

Abbiamo aggiunto il supporto alla `DATABASE_URL` diretta: se presente,
**vince** su quella costruita dalle cinque variabili. Due dettagli non ovvi:

- Il campo interno si chiama `database_url_env` con `Field(validation_alias="DATABASE_URL")`,
  perché `database_url` era già il nome di una property.
- La piattaforma dà `postgresql://...` ma il progetto usa il driver psycopg
  (`postgresql+psycopg://`): la property `resolved_database_url` **normalizza
  il prefisso**, altrimenti SQLAlchemy proverebbe un driver non installato.
  Senza questa normalizzazione il deploy partirebbe con un errore oscuro.

### `backend/pynance/database.py` e `backend/alembic/env.py`

Entrambi usavano `settings.database_url` (la vecchia property). Con il
cambio di nome, ora usano `settings.resolved_database_url`. È la modifica
silenziosa che nessuno nota finché non manca.

### `backend/pynance/api/routers/static_assets.py` — nuovo

Il single-origin richiede che FastAPI serva i file del frontend compilato.
Questo router monta `assets/` come file statici, serve `index.html` sulla
radice, e fa da **SPA fallback** (qualsiasi path che non è un file reale →
`index.html`, così React Router gestisce `/transactions` e simili). Due
dettagli:

- Le route hanno `include_in_schema=False` (non devono apparire in /docs).
- Il router va registrato in `main.py` **dopo** le route API, altrimenti la
  catch-all `/{path:path}` catturerebbe anche `/api/*`.
- È **condizionale**: se `frontend-dist/` non esiste (in dev gira Vite), il
  router non si registra e le API restano invariate. Così i test e lo
  sviluppo locale non vengono toccati.

### `backend/pynance/api/routers/auth.py` — il cookie `Secure`

`set_cookie` ora passa `secure=settings.secure_cookies`. Di default `False`
(dev su HTTP), `True` in prod dove il traffico è HTTPS (ADR 0005).

### `backend/Dockerfile` — multi-stage, nuovo

Render builda dal Dockerfile. Il file è multi-stage:

1. **Fase frontend** (`node:22-alpine`): `npm ci` + `npm run build` →
   produce `dist/`. Node serve solo a compilare.
2. **Fase backend-deps** (`python:3.14-slim`): copia il binario `uv`
   dall'immagine uv (`COPY --from=ghcr.io/astral-sh/uv:latest /uv ...`) —
   l'immagine uv non ha tag con la versione di Python pinata — poi
   `uv sync --frozen --no-dev --no-install-project`.
3. **Fase runtime**: copia solo i runtime artifacts (site-packages, codice,
   `alembic/`, `dist/`) e gira come utente non-root (`USER 10001`).

Nota: il build context è la **root del repo** (copiamo sia `frontend/` sia
`backend/`), quindi `.dockerignore` sta alla root, non in `backend/`.

### `backend/entrypoint.sh` — nuovo

Esegue `alembic upgrade head` (schema prima del codice, come da guida) poi
lancia uvicorn su `--port "${PORT:-8000}"`. Due differenze rispetto alla C:

- La porta è `${PORT:-8000}`: Render inietta la porta da usare in `$PORT`.
- `--proxy-headers` resta (il proxy di Render è davanti), ma niente
  `--forwarded-allow-ips` con IP fisso: qui il proxy è della piattaforma,
  quindi uvicorn usa il suo default sicuro.

### `.github/workflows/ci.yml` — nuovo

Il quality gate: ogni push fa girare `ruff check .`, `mypy .`, `pytest`
contro un Postgres di servizio. Il CD non è un workflow: è Render stessa che
fa il deploy a ogni push.

### `.env.example`, `README.md`

Aggiunte `DATABASE_URL`, `SECURE_COOKIES`, `ALLOWED_HOSTS` e la sezione di
deploy nel README.

---

## Le insidie incontrate (e come le abbiamo risolte)

1. **La CI fallita al primo push — env vars nel posto sbagliato.** Il
   workflow configurava le credenziali Postgres sul **servizio** (container)
   ma non sul **job**. `pynance.database` crea l'engine all'import, e senza
   `POSTGRES_*` nell'ambiente del job la URL aveva la porta vuota →
   `ValueError` → crash di `conftest.py` prima di ogni test. Fix: le 5
   variabili a livello di `env:` del job. La lezione: in un workflow GitHub
   ci sono *due* ambienti distinti (job e servizi), e un import al modulo
   fallisce se uno dei due è incompleto.

2. **`Dockerfile Path` sulla pagina di Render.** Il Dockerfile sta in
   `backend/`, non alla root. Se il campo resta vuoto, Render cerca
   `./Dockerfile` alla root e la build fallisce. Va impostato
   `./backend/Dockerfile`. E il **Root Directory va lasciato vuoto**: il
   Dockerfile builda insieme frontend e backend, quindi il build context è
   la root del repo — mettere `backend/` lì farebbe fallire `COPY
   frontend/...`.

3. **L'exec bit dell'entrypoint.** Durante la build locale, il container
   moriva con *permission denied* su `./entrypoint.sh`: il `COPY` di Docker
   non preserva l'exec bit. Fix: `RUN chmod +x /app/entrypoint.sh` nel
   Dockerfile (e `chmod +x` anche nel repo).

4. **`ALLOWED_HOSTS` non si conosce prima del deploy.** Il dominio
   `*.onrender.com` lo assegna Render *dopo* la creazione del servizio.
   Quindi il primo deploy si fa senza quell'env (l'app risponde 400 a ogni
   richiesta — stato "non ancora configurato", non un errore di build), poi
   si legge il dominio dal pannello e si aggiunge l'env, che fa ri-deployare.

5. **La regione del database deve combaciare con quella del web service.**
   Se il Postgres è in una regione e il web service in un'altra, non possono
   parlarsi sulla rete privata di Render. Entrambi vanno messi nella stessa
   regione (per noi: Frankfurt).

6. **Usare l'`Internal Database URL`, non la External.** Dentro Render, il
   web service deve usare l'URL interno (hostname `dpg-...-a` senza
   `.onrender.com`), raggiungibile solo sulla rete privata. La External
   esporrebbe il DB su internet.

---

## Le verifiche fatte

- `uv run ruff check .`, `uv run mypy .`, `uv run pytest` — **100 test
  passano** in locale.
- `docker build -f backend/Dockerfile .` — l'immagine si builda.
- Container eseguito contro un Postgres reale: `/` → 200 (index.html),
  `/api/health` → `{"status":"ok"}`, `/transactions` → 200 (SPA fallback),
  porta `$PORT` rispettata.
- Build frontend con `npm ci` — ok (in locale serviva `npm ci` per
  sincronizzare `node_modules`).
- Dopo il deploy su Render: `/api/health` risponde `{"status":"ok"}`,
  registrazione/login funzionano, cookie `Secure` presente, frontend e SPA
  fallback ok, CI verde.

## Cosa è rimasto aperto

- **Il database free scade dopo 90 giorni**: prima della scadenza bisogna
  spostarsi su Neon/Supabase cambiando solo `DATABASE_URL` (codice
  invariato).
- **Il bot Telegram** non è in prod: decidere se e come aggiungerlo (è un
  processo long-polling, non un web service HTTP).
- **I moduli misti (01, 02, 03, 07, 08)** sono ancora in `docs/wiki/` senza
  lo split concetto/storia: li spezzeremo quando li toccheremo di nuovo.
- **Il cold start di Render** (~50s dopo l'inattività) resta: è il prezzo
  del free tier, da rivalutare se l'app diventa "da mostrare".