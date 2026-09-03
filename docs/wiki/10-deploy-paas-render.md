# Modulo 10 — Deploy con la strategia A: Render in pratica

La wiki `09-deploy-guide.md` è la mappa delle strategie: questo file è la
messa in pratica di una di esse. Partiamo dalla **strategia A** (PaaS
"tutto in uno") usando **Render**, e costruiamo il deploy della nostra app
passo dopo passo. Il risultato è un'app raggiungibile su un URL pubblico,
con HTTPS automatico, che si aggiorna da sola a ogni push.

Perché la A? La guida la consiglia per "andare online subito, in un weekend":
la piattaforma fa il lavoro sporco (build, HTTPS, dominio, riavvii) e noi ci
concentriamo su ciò che è nostro — il codice e la configurazione che lo
riguarda. È anche il percorso più adatto a chi sta imparando, perché i
concetti (env vars, build, migrazioni) si vedono in azione senza la fatica di
gestire un server.

E perché **Render** e non Railway (l'altra piattaforma "tutto in uno")? Il
motivo è il costo: al momento della scelta, Render ha un **free tier reale**
(web service gratuito, nessuna carta di credito richiesta), mentre Railway
offre un credito una-tantum che poi si esaurisce. Il prezzo di Render free è
un **cold start**: dopo un periodo di inattività il web service si
"addormenta", e alla prima richiesta ci vogliono ~50 secondi per ripartire.
È un compromesso accettabile per un'app personale a zero spese.

Questo file è la registrazione di *quello che facciamo*: la wiki racconta il
percorso, e il codice nel repository è il risultato. Leggendola insieme al
codice capisci il "perché" di ogni pezzo.

---

## La decisione di forma: un solo servizio, un solo URL

La strategia A descritta nella guida usa due servizi separati (frontend
statico + backend), che però reintroduce il CORS. Il nostro progetto ha già
fatto una scelta diversa, documentata in ADR 0006: **single-origin** — il
backend serve sia le API sia i file del frontend compilato. Su Render
questo significa **un solo web service**, che builda il frontend e serve
tutto insieme. Un solo URL da dare agli utenti, zero CORS da configurare,
nessun secondo dominio da gestire.

È la stessa forma che avevamo scelto per il deploy manuale (strategia C):
l'infrastruttura condivisa (un'immagine Docker che contiene tutto) serve
entrambe le strade. Cambia solo *dove* la metti: qui su Render, senza
server da gestire.

---

## Le modifiche al codice, e perché

### Il database: una sola stringa al posto di cinque variabili

Il nostro `config.py` costruisce la connessione a Postgres da cinque
variabili separate (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`,
`POSTGRES_PORT`, `POSTGRES_DB`). È comodo per il dev locale, ma le
piattaforme PaaS danno invece **una singola stringa pronta**: la
`DATABASE_URL`, che ha questo aspetto:

```
postgresql://utente:password@host:porta/database
```

La modifica è piccola ma importante: `config.py` ora accetta una
`DATABASE_URL` diretta, e se è presente **vince** su quella costruita dalle
cinque variabili. In locale continuiamo a usare le cinque variabili; su
Render impostiamo solo la `DATABASE_URL`. Nessun comportamento esistente
cambia.

**Una nota sul database free di Render.** Il Postgres che Render offre nel
tier gratuito è gratis **solo per 90 giorni**: dopo, o si passa al piano a
pagamento o il database non è più disponibile. Per il primo deploy va bene
(nel frattempo l'app è online e impariamo il flusso); quando i 90 giorni si
avvicinano, la soluzione pulita è spostarsi su un Postgres gestito
"serverless" con piano gratuito permanente (Neon o Supabase, già citati
nella guida) e cambiare solo la `DATABASE_URL`. Il codice non cambia: è
proprio il vantaggio di leggere la connessione da una singola variabile.

### Il backend che serve il frontend: `static_assets`

Il single-origin richiede che FastAPI serva anche i file del frontend
compilato. Serve quindi un router che:

- monta la cartella `assets/` (i file JavaScript, CSS e font generati dalla
  build) come file statici;
- serve `index.html` sulla radice `/`;
- fa da **fallback per le rotte del frontend** (SPA fallback): quando il
  browser chiede `/transactions` — una rotta che gestisce React Router, non
  il backend — il server restituisce `index.html`, e React fa il resto.

Il tutto è **condizionale**: se la cartella `frontend-dist/` non esiste (come
in dev, dove gira Vite), il router non si registra e le API restano
invariate. Così i test e lo sviluppo locale non vengono toccati, e il
deploy serve l'app compilata.

### L'immagine Docker: un Dockerfile multi-stage

Render può buildare l'app in due modi: con la sua build automatica
(Nixpacks, che rileva linguaggio e dipendenze da solo) o con un **Dockerfile**
che glielo diciamo noi. Scegliamo il Dockerfile: è esplicito, ci dà il
controllo, e — cosa non da poco — il Dockerfile è l'infrastruttura condivisa
che useremo anche quando in futuro rifaremo la strategia C.

L'immagine è **multi-stage**, cioè costruita in due fasi separate:

1. **Fase "frontend"**: parte da un'immagine con Node, installa le
   dipendenze (`npm ci`), esegue `npm run build` e produce la cartella
   `dist/`. Node serve solo a compilare: a runtime non ce ne sarà bisogno.
2. **Fase "backend"**: parte da `python:3.14-slim`, installa le dipendenze
   Python con `uv` (copiando il binario dall'immagine ufficiale di uv), e
   copia il codice del backend.
3. **Fase "runtime"**: è il risultato finale. Copia solo ciò che serve a
   runtime: le dipendenze Python installate, il codice backend, i file
   `alembic` per le migrazioni, e la cartella `dist/` prodotta dalla fase
   frontend. Gira come utente non-root (`USER 10001`), un'abitudine di
   sicurezza: se l'app venisse compromessa, l'attaccante non avrebbe i
   privilegi di root.

Il risultato è un'unica immagine che contiene tutto — API, frontend,
migrazioni — e che Render esegue come un solo servizio.

### L'avvio: entrypoint e la porta `$PORT`

Il container deve, all'avvio, eseguire le **migrazioni** (vedi la guida:
schema prima del codice) e poi lanciare il server. Lo fa un `entrypoint.sh`:

```sh
#!/bin/sh
set -e
alembic upgrade head
exec uvicorn pynance.api.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers
```

Due dettagli rispetto al deploy manuale della strategia C:

- **La porta è `${PORT:-8000}`.** Render (come ogni PaaS) non usa una porta
  fissa: inietta la porta da usare nella variabile `$PORT`. Con il default
  `8000` funziona anche in locale.
- **`--proxy-headers`** resta: anche qui c'è un proxy davanti (quello di
  Render), e questa flag fa sì che uvicorn legga gli header standard del
  proxy (`X-Forwarded-*`). Non serve più l'IP fisso del nostro Caddy, perché
  il proxy è della piattaforma: l'entrypoint non lo specifica e uvicorn usa
  il suo default sicuro.

---

## La pipeline di CI: GitHub Actions

Prima di pensare al deploy, serve un **quality gate**: ogni push deve far
girare i controlli (ruff, mypy, pytest) e avvisarci se rompiamo qualcosa.
Questo è il lavoro di un workflow GitHub Actions (il file `.github/workflows/ci.yml`).

Il workflow fa questo:

1. **Si attiva a ogni push e pull request** sulla branch `main` (e su quella
   di lavoro).
2. **Configura Python 3.14** e installa le dipendenze del backend con `uv`
   (che è già il nostro gestore).
3. **Avvia un Postgres di servizio**: GitHub Actions permette di lanciare
   container di supporto, e i nostri test girano contro un vero Postgres.
   Il servizio usa le stesse credenziali che i test si aspettano.
4. **Esegue i tre controlli**: `ruff check .`, `mypy .`, `pytest`.

Il punto delicato sono le **variabili d'ambiente per i test**: i test usano
il database `pynance_test_db`. Nel workflow le impostiamo come variabili
d'ambiente del job, così `conftest.py` (che legge `POSTGRES_DB` per puntare
al DB di test) trova ciò che si aspetta.

Il CD (deploy automatico) **non** è un workflow GitHub: è Render stessa. La
piattaforma si collega al repo e fa il deploy a ogni push sulla branch
configurata. CI e CD sono quindi due cose distinte: GitHub Actions *verifica*,
Render *pubblica*.

---

## Il deploy su Render, passo passo

Una volta che il codice è pronto e la CI è verde, il deploy su Render si fa
dalla sua interfaccia web, in pochi passi:

1. **Creare un account** su Render e collegare l'account GitHub.
2. **Nuovo web service → Deploy from GitHub repo** e scegliere il repo
   Pynance e la branch `main`.
3. **Aggiungere un Postgres**: dal dashboard "New" → PostgreSQL. Render
   crea il database e mostra la sua `DATABASE_URL`. (Ricorda: nel free tier
   questo database scade dopo 90 giorni — vedi la nota sopra.)
4. **Configurare il web service**: Render rileva il `Dockerfile` alla radice
   del progetto e lo usa per buildare l'immagine.
5. **Impostare le variabili d'ambiente** del servizio (sotto la sezione
   Environment):
   - `DATABASE_URL` — la stringa data da Render nel passo 3;
   - `SECURE_COOKIES=true` — il cookie di sessione deve essere `Secure`
     perché l'app gira su HTTPS (ADR 0005);
   - `ALLOWED_HOSTS=["...onrender.com"]` — TrustedHostMiddleware deve
     accettare il dominio della piattaforma, altrimenti risponde 400 a ogni
     richiesta (ADR 0006);
   - `TELEGRAM_BOT_TOKEN` e `TELEGRAM_ALLOWED_CHAT_ID` — solo se vogliamo il
     bot (niente bot per il primo deploy, come deciso).
6. **Deploy**: Render builda l'immagine, avvia il container (l'entrypoint
   esegue le migrazioni), e assegna un dominio `*.onrender.com` con HTTPS
   automatico.
7. **Verifica**: aprire `https://...onrender.com/api/health` — deve
   rispondere `{"status":"ok"}`.

**Nota sul cold start.** Nel free tier, dopo ~15 minuti di inattività il
web service si sospende; la prima richiesta dopo la sospensione impiega
~50 secondi (Render lo riavvia). È il prezzo della gratuità: le richieste
successive sono veloci. Non è un bug dell'app.

---

## Cosa c'è dietro (per capire, non solo per eseguire)

Se leggi il deploy di Render e ti chiedi "dove sono il Caddy, il firewall, il
reverse proxy?" — la risposta è: **non ci sono, e va bene così**. La
strategia A esiste proprio per questo: Render fa da reverse proxy, gestisce
i certificati TLS e tiene acceso il container. È lo stesso schema della
strategia C, ma con il lavoro di sistemista già fatto e incapsulato dalla
piattaforma.

Quello che resta *nostro* è il codice che produce l'immagine e la
configurazione che la piattaforma legge. È il motivo per cui questa wiki
esiste: la parte che ricorderemo (e che ci servirà per la C, più avanti) è
nel repository, non nel pannello di Render.

---

## Verifica finale

Dopo il deploy, la checklist da percorrere:

- [ ] `https://...onrender.com/api/health` → `{"status":"ok"}`
- [ ] registrazione e login funzionano (cookie di sessione presente)
- [ ] il cookie ha il flag `Secure` (in devtools → Network → login → cookie)
- [ ] il frontend si carica sulla radice `/` e le rotte interne (es.
      `/transactions`) funzionano (SPA fallback)
- [ ] la CI su GitHub è verde (ruff, mypy, pytest)
- [ ] un push sulla branch fa ripartire il deploy (CD via Render)