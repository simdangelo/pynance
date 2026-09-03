# Modulo 9 — Guida al deploy: portare un'app su internet

Hai un'app che funziona sul tuo computer: Postgres in un container, backend
su `:8000`, frontend su `:5173`, tutto raggiungibile solo attraverso
`localhost`. Il deploy è il passo che la rende **raggiungibile da chiunque**,
da un browser qualunque, su un link vero.

Questo modulo è diverso dai precedenti. Finora ogni modulo ha aggiunto una
funzionalità: una tabella, un endpoint, un pezzo di UI. Il deploy non è una
funzionalità — è **il modo in cui l'app viene messa in produzione**, ed esiste
più di un modo. La domanda non è "come deployo", ma "quale strategia di
deploy scelgo", perché ogni strategia è un equilibrio diverso tra *fatica*,
*costo*, *controllo* e *quello che impari*.

Questa wiki è una **mappa del territorio**. Prima spiega i concetti che
ricorrono in *ogni* strategia (se li capisci, ogni piattaforma ti sembrerà
una variazione sullo stesso tema), poi presenta le strategie concrete dalla
più semplice alla più da sistemista, con pro/contro e quando sceglierle, e
infine un capitolo sulla sicurezza in produzione.

> Il progetto ha già un deploy manuale completo su VPS, documentato in
> `09-docker-deploy-and-readiness.md`. Quella wiki è l'approfondimento della
> **strategia C** di questa guida: la mappa qui sotto ti dice dove si colloca
> e quali alternative esistono.

---

## Parte 1: i mattoncini che servono in ogni strategia

Prima di guardare le piattaforme, vale la pena capire i "mattoncini" che
compongono un deploy. Se questi concetti sono chiari, ogni strategia è una
variazione sullo stesso tema — cambia solo *dove* metti i pezzi e *quanto
lavoro manuale* fai.

### Le tre "cose" che il tuo progetto mette online

Il tuo progetto è in realtà **tre servizi distinti** che devono parlarsi:

1. **Il database PostgreSQL** — i dati persistenti. È un processo che sta
   acceso e conserva stato.
2. **Il backend FastAPI** — le API. È un processo che sta acceso e risponde
   alle richieste.
3. **Il frontend React** — la parte che l'utente vede nel browser.

Ogni strategia di deploy differisce principalmente per *dove* fai girare
questi tre pezzi e *quanto lavoro manuale* richiede.

### Il backend: cos'è un server ASGI, e come sta in piedi

Il tuo codice FastAPI, da solo, non può ricevere richieste dal browser: è una
libreria di funzioni che *rispondono* a richieste, ma non sa *ascoltare* la
rete. Serve un **server web** — un programma che sta in ascolto su una porta,
riceve le richieste HTTP e le consegna al tuo codice, poi restituisce la
risposta. Per un'app Python ci sono due "dialetti" storici per questa
conversazione tra server e app:

- **WSGI** è il più vecchio e pensa in modo **sincrono**: una richiesta alla
  volta, in attesa che l'app finisca. È il mondo di Flask e Django classici.
- **ASGI** è il successore e pensa in modo **asincrono**: può gestire più
  richieste mentre una è in attesa (di un database, di una rete). FastAPI è
  nato per ASGI.

**uvicorn** è un server ASGI: è il processo che sta davvero in ascolto sulla
porta e fa da ponte tra il browser e la tua app. Quando lanci
`uvicorn pynance.api.main:app`, stai avviando un piccolo programma che
ascolta, chiama la tua app, e risponde.

**gunicorn** è un'altra cosa: un **process manager**. Non serve l'app
direttamente, ma ne avvia **più copie** (i "worker") così il server può
gestire più richieste in parallelo usando più core della macchina. Gunicorn è
storicamente WSGI, ma può usare uvicorn come worker e diventare così ASGI
anch'esso. La gerarchia è quindi:

```
gunicorn (manager, avvia più copie)
  └─ worker 1: uvicorn → la tua app FastAPI
  └─ worker 2: uvicorn → la tua app FastAPI
  └─ ...
```

Per un'app piccola (come Pynance con pochi utenti), **uvicorn da solo basta**.
Il motivo sta nella parola "asincrono": un singolo processo ASGI non elabora
una richiesta alla volta, ma **intercala** molte richieste mentre aspettano
qualcosa (una risposta dal database, dalla rete). Quindi, finché il carico è
dominato dall'attesa (quasi sempre, in un'app web), un solo worker gestisce
già molte richieste in parallelo. I worker multipli servono quando il
problema non è più l'attesa ma **la CPU**: calcoli pesanti che bloccano il
processo. E attenzione a una distinzione chiave: il parallelismo "con un
worker solo" è un privilegio di **ASGI**. Con un server WSGI sincrono, un
worker = una richiesta alla volta, in attesa che finisca: lì i worker multipli
servono fin da subito.

Se e quando il traffico cresce, la domanda "quanti worker?" ha una sola
risposta seria: **misura, non indovinare**. Non esistono soglie universali
certificate — il throughput dipende dall'hardware, da quanto costa ogni
richiesta (le query SQL pesano decine di volte più di un JSON vuoto) e dal
carico. L'unica euristica "ufficiale" che trovi nella documentazione di
gunicorn è `worker = (2 × numero di core) + 1`, ed è una *regola pratica* di
partenza, non una legge: si parte da lì, si carica il server con un load test
(`locust`, `wrk`), si guarda la latenza e la CPU, e si aggiusta. Il default
corretto è il worker più piccolo che regge il carico, non il più grande.

### Il frontend: cos'è Node, e perché in produzione "non serve"

React è JavaScript, e il browser sa eseguire JavaScript: la versione
"finale" del frontend è un insieme di file statici (HTML, CSS, JS) che il
browser scarica ed esegue. **Node.js** è un programma che esegue JavaScript
*fuori* dal browser — sul tuo computer, in un terminale. Serve agli
sviluppatori: è lo strumento con cui gira **Vite** e con cui si eseguono i
comandi `npm`. In poche parole, Node è il "motore" che compila e gestisce il
tuo frontend durante lo sviluppo, non la cosa che lo serve agli utenti.

Per capire la differenza dev/produzione, guarda cosa fa **Vite**:

- **In sviluppo** lanci `npm run dev`, che avvia un server speciale. Questo
  server fa due cose: compila il tuo codice React *al volo* (lo traduce in
  JavaScript che il browser capisce) e osserva i tuoi file — quando salvi, la
  pagina si aggiorna da sola (**hot reload**). È un comodo "cucina mentre
  l'utente è a tavola": ogni modifica è subito visibile senza passi intermedi.
- **In produzione** non vuoi un server che compila al volo per ogni
  richiesta: sarebbe lento e fragile. Invece esegui `npm run build`, che
  compila *una volta sola* tutto il progetto e produce una cartella `dist/`
  con i file già pronti. Quei file non hanno bisogno di Node: un qualunque
  web server (Nginx, Caddy, un CDN, o anche il backend stesso) li consegna al
  browser così come sono, velocemente. Come un cuoco che prepara il piatto in
  anticipo invece di cucinarlo per ogni ospite.

Questa è la regola d'oro: **in sviluppo si compila al volo, in produzione si
compila una volta e si servono i file finiti.**

### Le variabili d'ambiente

In locale hai un `.env` con cose come `DATABASE_URL`. In produzione questi
valori **non vanno mai committati**: si impostano come variabili d'ambiente
nella piattaforma di hosting. Le principali che ti serviranno:

- `DATABASE_URL` — la stringa di connessione a Postgres.
- `CORS_ORIGINS` — l'URL del frontend, per dire a FastAPI chi può chiamarlo
  (quando frontend e backend sono su domini diversi, vedi sotto).
- eventuali secret (chiavi API terze, il token del bot Telegram...).
- lato frontend: `VITE_API_URL` — l'URL del backend, che Vite inietta **a
  build time**, non a runtime. Dettaglio importante: se lo cambi, devi
  **ri-buildare** il frontend; non basta riavviare il processo.

### CORS

Il browser applica una regola di sicurezza: una pagina servita dall'origine
A può chiamare con `fetch` l'origine B solo se B lo dichiara esplicitamente
tramite header CORS. "Origine" = schema + host + porta insieme.

Se frontend e backend finiscono su **domini diversi** (es.
`app.tuosito.com` e `api.tuosito.com`), il browser blocca le richieste
finché FastAPI non dichiara esplicitamente quali origini sono ammesse, tramite
`CORSMiddleware`. Se invece li servi dallo **stesso dominio** (frontend e
`/api` dietro lo stesso reverse proxy), il problema CORS sparisce quasi del
tutto — è uno dei motivi per cui molti preferiscono questo pattern. La scelta
di Pynance (single-origin, senza CORS) è documentata in ADR 0006.

### Le migrazioni Alembic

A ogni deploy che cambia lo schema del database, devi eseguire
`alembic upgrade head` contro il database di produzione. Va fatto **prima**
che il nuovo codice del backend parta (o come step separato nella pipeline),
altrimenti rischi che l'app nuova giri contro uno schema vecchio: il codice
assume colonne che ancora non esistono. In un container, questo si ottiene
con un entrypoint che migra prima di avviare il server.

### Dominio e HTTPS

- Un **dominio** (es. `miaapp.com`) si compra da un registrar (Namecheap,
  Cloudflare, OVH, Register.it...), pochi euro/anno. Il nome è come
  l'indirizzo del condominio del tuo VPS: un'etichetta stabile che il DNS
  risolve all'IP del server.
- Molte piattaforme moderne (Railway, Render, Vercel, Netlify) ti danno
  gratis un sottodominio tipo `miaapp.up.railway.app` e **HTTPS
  automatico**, senza configurare nulla: ottimo per iniziare. Puoi
  collegare un dominio tuo in un secondo momento.
- Se fai da solo su un server "nudo" (VPS), l'HTTPS te lo procura tu,
  tipicamente con **Let's Encrypt** (gratuito) tramite Certbot o, più
  comodamente, con **Caddy**, che ottiene e rinnova i certificati da solo.

### Il reverse proxy

Il reverse proxy (Nginx, Caddy, Traefik) è il **portinaio** che sta davanti
ai tuoi servizi: è l'unico che il mondo esterno vede, e sa dove inoltrare
ogni richiesta.

```
                     internet
                        │
              ┌─────────▼─────────┐
              │  REVERSE PROXY    │   porta 443 (HTTPS), il solo "pubblico"
              │  (Nginx / Caddy)  │
              └─────────┬─────────┘
                 ┌──────┴───────┐
          /api/* │              │ tutto il resto
                 ▼              ▼
        ┌──────────────┐  ┌──────────────┐
        │   backend    │  │  frontend    │   file statici (HTML/JS/CSS)
        │  FastAPI     │  │  (o il backend
        └──────┬───────┘  │   che li serve)
               │          └──────────────┘
               ▼
        ┌──────────────┐
        │  database    │   mai esposto verso l'esterno
        └──────────────┘
```

Riceve le richieste su una porta pubblica, le smista (es. `/api/*` → backend,
tutto il resto → frontend) e gestisce i certificati HTTPS. Il vantaggio di
questo schema: il browser parla solo col portinaio, che è l'unico che sa dove
stanno gli altri — e siccome frontend e backend condividono lo stesso
dominio, il CORS sparisce. Su un VPS lo configuri tu; sui PaaS lo fa la
piattaforma al posto tuo.

### Container (Docker)

Non è obbligatorio, ma è quasi lo standard oggi: impacchetti backend (e a
volte frontend) in un'**immagine Docker**, così "funziona uguale ovunque"
(locale, server, CI) perché l'immagine contiene tutto: il runtime, le
dipendenze, il codice. Le strategie più "educative" più sotto lo richiedono
o lo premiano.

---

## Parte 2: le strategie, dalla più semplice alla più da sistemista

| # | Strategia | Difficoltà | Cosa impari | Costo tipico (poche persone) |
|---|-----------|-----------|-------------|-------------------------------|
| A | PaaS "tutto in uno" (Railway / Render / Fly.io) | Molto facile | Deploy, env vars, CI di base | Gratis/pochi $ al mese |
| B | Frontend statico + Backend PaaS + DB managed (Vercel/Netlify + Render/Railway + Neon/Supabase) | Facile | Separazione dei servizi, CORS reale | Spesso gratis fino a un certo traffico |
| C | VPS + Docker Compose + reverse proxy (Hetzner/DigitalOcean) | Impegnativo | Linux, Docker, Nginx/Caddy, sicurezza, DNS | ~4-6 €/mese |
| D | PaaS self-hosted su VPS (Coolify / Dokploy / CapRover) | Medio | Docker "guidato", meno configurazione manuale | ~4-6 €/mese |
| E | Cloud provider enterprise (AWS/GCP/Azure) | Molto impegnativo | IAM, networking, servizi managed | Variabile, occhio ai costi nascosti |
| F | Serverless (Lambda, Vercel Functions) | Impegnativo, con trade-off tecnici | Modello serverless, cold start, connection pooling | Spesso pay-per-use, quasi gratis a basso traffico |

### A — PaaS "tutto in uno": Railway, Render, Fly.io

Una piattaforma dove colleghi il repo GitHub, dichiari "questo è un servizio
Python, questo è un servizio Node/statico, questo è Postgres", e lei si
occupa di build, deploy, HTTPS e dominio gratuito. Railway è probabilmente la
più semplice per iniziare; Render è molto simile; Fly.io un filo più "da
developer".

Come funzionerebbe per te:
1. Crei un progetto sulla piattaforma.
2. Aggiungi un servizio **PostgreSQL** gestito: ti dà una `DATABASE_URL`
   pronta.
3. Aggiungi un servizio per il **backend**: punti alla cartella del backend,
   la piattaforma rileva Python, specifichi il comando di avvio
   (es. `uv run uvicorn pynance.api.main:app --host 0.0.0.0 --port $PORT`) e
   imposti le variabili d'ambiente (`DATABASE_URL`, i secret). Nota: le
   piattaforme ti danno la porta da usare nella variabile `$PORT` — il
   servizio è raggiungibile su quella, non su 8000.
4. Aggiungi un servizio per il **frontend**: `npm run build`, e la
   piattaforma serve la cartella `dist/` come sito statico. Imposti
   `VITE_API_URL` come variabile *di build* puntando all'URL pubblico del
   backend.
5. Esegui le migrazioni Alembic — di solito con un comando "release" della
   piattaforma o manualmente la prima volta.
6. Ottieni gli URL pubblici, o colleghi un dominio tuo.

**Perché qui ti danno *due* URL, e cosa significa per te.** In una
piattaforma del genere, ogni servizio è un "pezzo" separato con il suo URL:
il backend riceve un indirizzo (es. `backend.up.railway.app`) e il frontend
un altro (`frontend.up.railway.app`). Il motivo è che sono due processi
indipendenti che la piattaforma lancia e monitora separatamente.

Tu però vuoi un *solo* URL dal quale usare l'app. Ci sono due strade:

- **Accetti due origini** e configuri il CORS: il frontend su un dominio
  chiama il backend sull'altro. Funziona, ma aggiunge la configurazione CORS
  che il single-origin evita.
- **Torni al single-origin** (la scelta di Pynance): il backend serve anche
  i file del frontend, quindi ti serve *un solo* servizio (quello backend)
  e quindi *un solo* URL. Su una piattaforma così, questo significa creare
  il solo servizio backend che builda anche il frontend e lo serve — esattamente
  come fa l'immagine Docker del progetto. È il modo più semplice per avere
  "un link da dare alle persone".

La seconda strada è quella coerente con il progetto, ed evita il CORS.

**Pro:** nessuna gestione server; HTTPS e dominio gratuiti out-of-the-box;
deploy automatico a ogni push su GitHub; ottimo per validare l'idea in fretta.

**Contro:** meno controllo; alcune configurazioni "magiche" restano oscure; il
free tier è spesso limitato — il web service può "dormire" se inattivo
(cold start alla prima richiesta dopo una pausa) e in alcuni casi il
database gratuito **scade** dopo un periodo (es. 90 giorni su Render) o ha
limiti di risorse. Si impari meno sistemistica.

> **Le piattaforme cambiano spesso i free tier.** Contro e limiti scritti
> qui sono una foto del momento: prima di scegliere, verifica le condizioni
> correnti sulla pagina del provider. Il principio (free tier reale vs
> credito una-tantum, DB gratis a scadenza vs permanente, cold start vs
> sempre acceso) è stabile, i numeri specifici no.

### B — Frontend statico + Backend PaaS + DB managed (separati)

Variante della A, ma con servizi *specializzati* invece di un tutto-in-uno.
È un pattern molto comune nel mondo reale:
- **Frontend** su **Vercel** o **Netlify** o **Cloudflare Pages** — i
  migliori al mondo per siti statici/SPA: CDN globale, HTTPS, deploy
  istantanei, tier gratuito generoso.
- **Backend** su **Render** o **Railway** (Web Service Python).
- **Database** su **Neon** o **Supabase** (Postgres serverless gestito, con
  un generoso piano gratuito) o sul Postgres della piattaforma del backend.

Perché considerarla: qui vivi per la prima volta il **CORS reale** (frontend
e backend su domini diversi), che è istruttivo da configurare correttamente
in FastAPI:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://tuofrontend.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Impari anche la distinzione tra variabili **build-time** (`VITE_API_URL`,
che Vite "brucia" dentro i file JS al momento della build — se la cambi devi
ri-buildare) e variabili **runtime** (quelle del backend, lette a ogni avvio
del processo).

**Un avvertimento su Supabase.** Supabase può essere usato in due modi molto
diversi, e solo uno "c'entra" con il deploy della tua app. Se lo usi *solo
come database* (il Postgres gestito), è perfetto: il tuo backend resta tuo,
e Supabase è solo il mattoncino "database" della strategia B. Ma Supabase
offre anche molto di più — un sistema di autenticazione, un'API generata
automaticamente, storage, funzioni — ed è facile scivolare nell'usare
*tutto quello*, cioè lasciare che Supabase *sia* il backend al posto di
quello che hai scritto tu. Per un progetto come questo — dove il backend è
scritto a mano proprio per imparare — quella seconda strada non è un
"deploy più semplice", è un'**architettura diversa** che renderebbe inutile
il lavoro dei moduli precedenti. Quindi: Supabase come database = ok; Supabase
come backend sostituto = un'altra app.

**Pro:** ogni pezzo fatto dal miglior specialista per quel compito; gratis o
quasi per un piccolo gruppo; setup via UI, senza terminale su un server
remoto.

**Contro:** tre account/piattaforme da tenere a mente; un po' più di
configurazione (CORS, env vars in più posti) rispetto ad A.

### C — VPS con Docker Compose (il percorso più formativo)

Questa è la strada che insegna davvero come funziona un deploy "vero": affitti
un server Linux vuoto e ci metti tutto tu, senza piattaforme che fanno magie.
È la strategia che il progetto ha già percorso per intero — vedi
`09-docker-deploy-and-readiness.md` per il dettaglio completo. I passi
concettuali:

1. Crei una VM (Ubuntu 24.04 LTS è una scelta sicura) e ti connetti via SSH.
2. Installi Docker e Docker Compose sulla VM.
3. Scrivi un `Dockerfile` per il backend, multi-stage con `uv` — dove lo
   ottieni `uv` è una scelta importante: l'immagine ufficiale
   `ghcr.io/astral-sh/uv` non ha tag con la versione di Python pinata, quindi
   il pattern robusto è partire da `python:3.14-slim` e copiare il binario
   `uv` dall'immagine uv:
   ```dockerfile
   FROM python:3.14-slim AS base
   COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
   WORKDIR /app
   COPY pyproject.toml uv.lock ./
   RUN uv sync --frozen --no-dev
   COPY . .
   CMD ["uv", "run", "uvicorn", "pynance.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
   ```
4. Scrivi un `Dockerfile` per il frontend (multi-stage: build con Node, poi
   servi con Nginx) — oppure, come ha scelto Pynance, fai servire `dist/`
   dal backend stesso per mantenere il single-origin.
5. Scrivi un `docker-compose.yml` che orchestra i servizi: `db` (Postgres con
   volume persistente), `backend`, `frontend`.
6. Metti un **reverse proxy** davanti a tutto: **Caddy** (configurazione
   minima, HTTPS automatico con Let's Encrypt senza pensarci) oppure
   **Nginx + Certbot** (più configurazione manuale, ma è lo standard
   "storico"). Il proxy instrada `/api/*` verso il backend e tutto il resto
   verso il frontend — così frontend e backend vivono sullo **stesso
   dominio** e il problema CORS sparisce. (Vedi lo schema nella Parte 1.)
7. Punti il dominio alla VM. Nel pannello del registrar crei un **record
   DNS `A`**: una riga che dice "questo nome → questo IP". Concretamente,
   scrivi che `tuodominio.com` punta all'IP pubblico della tua VM. È così
   che, quando qualcuno digita il dominio, il browser "telefona" al numero
   giusto — la tua VM.
8. Lanci le migrazioni con `docker compose exec backend uv run alembic
   upgrade head` (o in un entrypoint che le esegue all'avvio).
9. Apri le porte giuste nel firewall e blocca tutto il resto. Il firewall è
   il "buttafuori" del tuo server: decide chi può entrare. In produzione
   vuoi che solo la porta 443 (HTTPS) e la 80 (il redirect a HTTPS) siano
   aperte verso l'esterno — e **niente altro** (niente SSH da tutto il
   mondo se possibile, mai la porta del database). Inoltre disabiliti il
   login SSH via password a favore delle **chiavi** (una coppia di file
   crittografici, uno sul tuo computer e uno sul server, che sostituisce la
   password con qualcosa di praticamente impossibile da indovinare). Qui
   inizi a toccare la sicurezza di base di un server.

**Pro:** impari *davvero* — Linux, Docker, reverse proxy, DNS, TLS,
firewall; controllo totale, nessun vendor lock-in, costo fisso e prevedibile;
le competenze si trasferiscono a qualunque progetto futuro.

**Contro:** devi occuparti tu di sicurezza, aggiornamenti, backup del
database, monitoraggio; se il server va giù alle 3 di notte, tocca a te; più
tempo richiesto all'inizio.

### D — PaaS self-hosted su VPS: Coolify, Dokploy, CapRover

Un compromesso tra B e C: affitti comunque un VPS, ma invece di configurare
tutto a mano installi un pannello open-source (Coolify o Dokploy) che ti dà
un'interfaccia simile a Railway/Render **sul tuo server**. Colleghi il repo,
il pannello builda le immagini Docker, gestisce HTTPS automaticamente, ti dà
i log via UI. È un passo intermedio se la C ti sembra troppo ma vuoi comunque
possedere l'infrastruttura.

**Contro:** un ulteriore livello software da mantenere (il pannello stesso);
community più piccola di Railway/Render, qualche spigolo in più.

### E — Cloud provider enterprise: AWS, GCP, Azure

Menzionata per completezza, ma **sconsigliata come primo deploy**: la
potenza è enorme (ECS/Fargate o App Runner per il backend, S3+CloudFront per
lo statico, RDS per Postgres), ma la superficie di configurazione (IAM, VPC,
security groups, load balancer) è pensata per team e carichi grandi. Il
rischio concreto è spendere più soldi per errori (risorse dimenticate accese)
di quanti ne spenderesti con Hetzner in un anno. Da esplorare quando avrai
già fatto la C e vorrai capire come si fa "a livello enterprise".

### F — Serverless: Vercel Functions, AWS Lambda

Il backend FastAPI può girare come funzione serverless (con un adattatore
come **Mangum** per renderlo compatibile con Lambda), invocato solo quando
arriva una richiesta.

Attenzione a un punto tecnico importante: SQLAlchemy con connessioni Postgres
tradizionali **non va molto d'accordo** con l'ambiente serverless — ogni
invocazione può creare una nuova connessione, e il database si trova sommerso
di connessioni se il traffico sale. Serve un connection pooler esterno
(PgBouncer, o un DB "serverless-friendly" come Neon che ha un pooler
integrato). Per pochi utenti iniziali è complessità aggiuntiva che non ti
serve subito. Ha senso più avanti, se il traffico è molto irregolare (picchi
rari, per il resto zero utenti) e vuoi pagare solo l'uso effettivo.

---

## Parte 3: come scegliere

Le domande che decidono davvero la scelta:

1. **Cosa vuoi imparare?** Se l'obiettivo è capire come funziona un deploy
   "vero", la strategia C è insostituibile. Se l'obiettivo è avere l'app
   online, A o B bastano.
2. **Quanti utenti avrai?** Con poche persone, qualsiasi strategia regge;
   le differenze di scala non contano ancora.
3. **Quanto tempo/manutenzione vuoi dedicarci?** Un VPS richiede
   aggiornamenti, backup, sicurezza. Un PaaS se ne occupa lui.
4. **Vuoi il controllo o la semplicità?** Sono in tensione: più controllo =
   più lavoro manuale.

Il percorso didattico più naturale va in due tappe:

**Tappa 1 — vai online subito (strategia A o B).** Avere un link vero da
mostrare e un flusso completo (build → env vars → deploy → CORS → migrazioni)
dà motivazione e ti fa fallire in un ambiente protetto dove la piattaforma fa
il 90% del lavoro sporco.

**Tappa 2 — rifai tutto su un VPS (strategia C) quando hai un weekend
intero.** È qui che impari davvero. Puoi tenerlo come ambiente parallelo su
un sottodominio, senza sostituire subito la tappa 1.

Il progetto Pynance ha percorso le tappe **in ordine inverso**: ha già la C
completa (VPS + Docker + Caddy, in `09-docker-deploy-and-readiness.md`), ma
chi l'ha scritta fatica ancora a comprenderla fino in fondo perché è il
percorso più complesso. Il piano è quindi: **partire dalla A** per avere
l'app online subito e assorbire i concetti (build, env vars, deploy,
migrazioni) su una piattaforma che fa il lavoro sporco, e **rifare la C in un
weekend libero** — quando i concetti della A saranno chiari, la C sarà molto
più semplice da digerire. Le conoscenze della C restano comunque quelle che
permettono di capire cosa fanno A e B "sotto il cofano".

---

## Parte 4: la sicurezza in produzione

Finora la sicurezza è apparsa come un dettaglio tecnico (cookies `Secure`,
HTTPS, host allow-list). Quando l'app va online e raccoglie dati di utenti
reali, la sicurezza smette di essere un dettaglio e diventa una **responsabilità**:
i dati di altre persone sono ora custoditi da te, e la legge (in Europa, il
GDPR) impone regole precise. Questo capitolo spiega a cosa stare attenti e
perché.

### Cosa hai in mano (e perché è delicato)

La tua app contiene **dati personali**: email, password (hashate), e i dati
finanziari che l'utente registra. Sono informazioni che riguardano persone
identificabili, quindi sono "dati personali" nel senso del GDPR. La buona
notizia: non devi reinventare nulla, ma devi capire quali sono i rischi e le
regole.

### Le minacce principali, e come difendersi

Le minacce informatiche non sono un'astrazione: hanno nomi precisi e
difese precise. Le più rilevanti per un'app come questa:

- **Furto di credenziali (brute force, credential stuffing).** Qualcuno prova
  tante password finché non indovina, oppure usa password rubate altrove
  (perché la gente riusa la stessa password ovunque). *Difese:* hash delle
  password con un algoritmo lento (Argon2 — già fatto nel progetto), limitare
  i tentativi di login, e **mai** loggare le password.
- **SQL injection.** Iniettare codice SQL malevolo in un input per leggere o
  modificare il database. *Difesa:* usare sempre query parametriche o un
  ORM (SQLAlchemy lo fa già se non costruisci stringhe SQL a mano).
- **XSS (cross-site scripting).** Iniettare JavaScript malevolo in una pagina
  che altri utenti poi aprono. *Difesa:* non fidarsi mai dell'input utente,
  non renderizzare HTML grezzo, e il cookie HttpOnly (già fatto) che
  impedisce al JavaScript di leggere il token di sessione.
- **CSRF.** Sfruttare una sessione già autenticata per far compiere azioni a
  tua insaputa. *Difesa:* cookie `SameSite=Lax` (già fatto) e token CSRF dove
  serve.
- **Intercettazione del traffico.** Leggere i dati mentre viaggiano tra
  browser e server. *Difesa:* HTTPS ovunque, che crittografa il traffico.
- **Esposizione di segreti.** Password, token, chiavi API finiti nel repo o
  nei log. *Difesa:* variabili d'ambiente, `.env` gitignored, `SecretStr`,
  mai loggare i segreti.

Il filo comune: **molte difese sono già nel progetto** (Argon2, cookie
HttpOnly/SameSite, HTTPS, secret in env). Il lavoro non è costruire un
sistema di sicurezza nuovo, ma **non introdurre regressioni**: non loggare
cose sensibili, non committare segreti, non disattivare le protezioni.

### Le regole di igiene di base per i dati degli utenti

- **Raccogli il minimo.** Se ti serve solo l'email per il login, non chiedere
  altro. Meno dati hai, meno danni se qualcosa va male.
- **Non conservare ciò che non ti serve.** Dati vecchi che non usi più sono
  solo un peso e un rischio.
- **Hash, mai testo in chiaro.** Le password non si salvano mai leggibili:
  si salva il loro hash (Argon2), che non permette di risalire alla
  password. Già fatto nel progetto.
- **I dati sensibili non vanno nei log.** Un log che registra la richiesta
  va bene; un log che registra il corpo della richiesta con la password o
  l'email, no.
- **Backup del database.** Se tutto va perso (attacco, errore, disastro),
  senza un backup non ricostruisci nulla. Anche un dump periodico in un posto
  separato va bene.

### Cosa fare in caso di attacco

Se sospetti un attacco o una violazione, la sequenza giusta è:

1. **Contieni.** Ferma l'emorragia: blocca l'accesso, sospendi il servizio se
   necessario, revoca le sessioni attive, ruota (cambia) le password e i
   segreti.
2. **Valuta.** Cosa è successo? Quali dati sono stati coinvolti? Come si è
   entrati? I log (il request logger del progetto, con `request_id` e
   `user_id`, è lì per questo) aiutano a ricostruire la cronologia.
3. **Elimina la causa.** Chiudi la falla prima di riaprire il servizio.
   Ripristina da un backup pulito se il sistema è stato compromesso.
4. **Comunica.** Se la violazione riguarda dati personali, la legge (vedi
   sotto) impone di notificare — spesso entro 72 ore all'autorità e, in certi
   casi, agli utenti coinvolti.
5. **Impara.** Documenta cosa è andato storto e come evitarlo. Un incidente
   non gestito è un errore; un incidente non analizzato è due errori.

Il punto chiave: **non scoprire di aver subito un attacco è il peggiore degli
esiti**. I log e il monitoraggio servono anche a questo — sapere che qualcosa
è successo, prima che lo scopra qualcun altro.

### Le regole legali: GDPR, senza panico

Il GDPR (Regolamento UE 2016/679) è la legge europea sulla protezione dei
dati personali. Si applica a chiunque tratti dati di persone in Europa —
quindi anche a una piccola app come questa. Non serve un ufficio legale, ma
servono pochi principi chiari:

- **Hai bisogno di una "base giuridica"** per trattare i dati. Per un'app di
  budget personale, la più naturale è il **consenso** dell'utente (che
  accetta i termini quando si registra) o il **legittimo interesse** (non
  puoi fornire un servizio di contabilità senza i dati che l'utente inserisce
  — il servizio *è* quello). In pratica: l'utente sa cosa gli succede.
- **Trasparenza.** L'utente deve sapere quali dati raccogli, perché, e chi
  li vede. In pratica: una **privacy policy** (una pagina semplice che
  spiega questo) è il minimo indispensabile.
- **Diritti dell'utente.** Chi ti dà i dati ha il diritto di chiederne una
  copia, di correggerli, e di chiederne la **cancellazione** ("diritto
  all'oblio"). Serve un modo per ricevere queste richieste e rispondere.
  Con un'app a un utente, questo è quasi banale: basta poter cancellare
  un account e i suoi dati.
- **Notifica delle violazioni.** Se c'è una violazione dei dati che comporta
  un rischio per le persone, va notificata all'autorità (in Italia il
  Garante) **entro 72 ore** dalla scoperta, e alle persone coinvolte se il
  rischio è alto. Con pochi utenti, "le persone coinvolte" sei tu e due
  amici: una email chiara basta.
- **Meno dati = meno problemi.** Il GDPR premia chi raccoglie poco e
  cancella presto. L'igiene dei dati del paragrafo precedente non è solo
  buona pratica tecnica, è anche conformità.

Cosa NON devi fare: niente panico e niente scorciatoie tipo "non sono
abbastanza grande per il GDPR". Il GDPR non ha una soglia minima di utenti
per applicarsi, ma le sue obbligazioni sono proporzionate: per una piccola
app personale, i principi sopra (trasparenza, diritti, notifica, minimo dei
dati) sono alla tua portata. Se un domani l'app cresce, gli obblighi si
fanno più formali (registro dei trattamenti, DPO, valutazioni d'impatto) —
ma questo è il momento di *iniziare bene*, non di fare tutto subito.

---

## Riferimenti in questo progetto

- `09-docker-deploy-and-readiness.md` — la strategia C nel dettaglio.
- ADR 0005 — cookie di sessione HttpOnly (parte della difesa da XSS/CSRF).
- ADR 0006 — single-origin e perché il CORS non serve.
- ADR 0007 — l'architettura di deploy scelta nel progetto.