# Modulo 8 — Middleware e CORS

Questo modulo arriva dopo l'autenticazione (modulo 7, ADR 0005) e prima del
deploy (modulo 9): l'app ha ora utenti veri e dati privati, ma è ancora
raggiungibile solo in locale. Il modulo 8 è il "giro di vite" sul livello di
trasporto — le cose che valgono per *ogni* richiesta, non per una rotta
specifica — e la verifica di una domanda che l'architettura aveva già
risposto per noi: serve davvero il CORS?

Il contenuto teorico è suddiviso in quattro wiki di concetto:
`../wiki/middleware-http.md` (cos'è un middleware e la forma della cipolla),
`../wiki/cors.md` (la regola del browser e perché spesso non serve),
`../wiki/trusted-host.md` (l'allow-list sull'header `Host`),
`../wiki/request-logging.md` (request logging e `X-Request-ID`). Questo
journal racconta cosa abbiamo fatto noi, i problemi che abbiamo incontrato
facendolo e come li abbiamo risolti.

## Le decisioni prese

La decisione centrale del modulo è registrata in **ADR 0006**
(`../adr/0006-no-cors-trusted-host-and-request-logging.md`), e in sintesi:

- **Niente middleware CORS.** L'app è single-origin per design (in sviluppo
  il proxy di Vite, in produzione FastAPI che serve i file statici del
  frontend): il browser non parla mai con due origini, quindi il CORS non
  scatta mai. Aggiungerlo "per sicurezza" sarebbe complessità che risolve un
  problema inesistente, e con le credenziali un `allow_origins` sbagliato
  esporrebbe il cookie di sessione. Il concetto è in `../wiki/cors.md`.
- **`TrustedHostMiddleware`** con gli host ammessi letti dalle impostazioni.
- **Un request logger** come middleware HTTP, con `X-Request-ID` per
  richiesta e la durata.
- **Niente auth in middleware**: l'autenticazione resta nella dependency
  `CurrentUser` per rotta (ha bisogno del cookie ed è una semantica
  per-rotta), come deciso nel modulo 7.

## Le modifiche al codice

L'esercizio è stato completato come passo di sblocco: i pezzi vivono in
`backend/pynance/api/main.py`, con `allowed_hosts` in
`backend/pynance/config.py`. La storia è in due commit: `bec925c`
(trusted-host + request-logging middleware) e `4106d21` (observability:
health endpoint, contesto utente nei log, request-id sugli errori).

**`backend/pynance/config.py`** — aggiunto il campo
`allowed_hosts: list[str] = ["localhost", "127.0.0.1"]`. La scelta di metterlo
nelle impostazioni (pydantic-settings, vedi `../wiki/pydantic-settings.md`)
è deliberata: al momento del deploy il dominio reale si aggiunge via `.env`
senza toccare il codice — è la trappola `allowed_hosts` che il journal del
deploy (modulo 9) richiamerà come da non dimenticare.

**`backend/pynance/api/main.py`** — quattro aggiunte:

1. `_setup_logging()`, chiamata all'avvio: dà al logger `pynance` un
   `StreamHandler` con livello `INFO` e `propagate = False`. Senza questa
   funzione le righe del nostro logger non comparirebbero mai sotto uvicorn
   (vedi l'insidia sotto).
2. `app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)`.
3. Il middleware `@app.middleware("http")` `log_requests`: genera un UUID,
   lo salva in `request.state.request_id`, misura la durata con
   `time.perf_counter()`, avvolge `call_next` in un `try/except` per loggare
   anche gli errori (riga di durata + `exc_info=True`, poi rilancia), e al
   ritorno imposta l'header `X-Request-ID` e logga
   `method path -> status (ms) request_id=... user_id=...`. Le richieste più
   lente di 500 ms (`SLOW_REQUEST_THRESHOLD_MS`) finiscono a `WARNING`
   invece di `INFO`, così saltano all'occhio.
4. L'exception handler `@app.exception_handler(Exception)`: logga
   "Unhandled exception on ..." con lo stesso `request_id` e `user_id`, e
   risponde un JSON 500 con l'header `X-Request-ID`. Serve perché il 500
   "scappa" dal middleware (vedi l'insidia sotto).

**`backend/pynance/api/dependencies.py`** — una riga in `get_current_user`:
`request.state.user_id = user.id`. Il middleware la legge dopo `call_next` e
la mette nel log. Risponde alla domanda rimasta aperta nell'analisi di
observability ("chi ha fatto questa richiesta?"): le richieste anonime
(login, register, health) loggano `user_id=None`.

**`backend/pynance/api/main.py`** — anche l'endpoint `GET /api/health` →
`{"status": "ok"}`, non autenticato di proposito: è il controllo di
liveness che un reverse proxy o un monitor faranno battere (e infatti il
modulo 9 lo usa nelle verifiche). Aggiunto nel secondo commit.

**`backend/tests/conftest.py`** e **`backend/tests/test_auth.py`** — il
`TestClient` ora passa `base_url="http://localhost"` (dettaglio sotto).

## Le insidie incontrate

Quattro sorprese, tutte scoperte implementando davvero:

**Il logger che non logga sotto uvicorn.** La più insidiosa, perché non dà
nessun errore visibile: uvicorn configura solo i *suoi* logger e lascia il
root logger a `WARNING` senza handler per i logger dell'applicazione, quindi
le nostre righe `logger.info(...)` venivano scartate in silenzio. La
soluzione è la `_setup_logging()` in `main.py`: handler proprio, livello
`INFO`, `propagate = False` perché la riga non venga stampata due volte. Il
concetto generale è spiegato in `../wiki/request-logging.md`; qui è la
verifica che "se non vedi i log, prima di sospettare del middleware controlla
il logger".

**Il `TestClient` che fallisce tutto con 400.** Il default dell'host del
`TestClient` di Starlette è `testserver`, che non è nella nostra allow-list:
aggiunto `TrustedHostMiddleware`, ogni test è crollato con 400 prima ancora
di toccare una rotta. La fix è `TestClient(app, base_url="http://localhost")`
nei fixture di `tests/conftest.py` e nel `TestClient` costruito a mano in
`tests/test_auth.py`. È la dimostrazione che il middleware funziona: ha
rotto i test, e la correzione è stata configurare il client, non indebolire
il middleware.

**L'exception handler della classe base `Exception` sta fuori dai nostri
middleware.** FastAPI/Starlette instradano le eccezioni base al
`ServerErrorMiddleware`, *esterno* ai middleware personalizzati: il client
riceve comunque il 500, ma il codice "dopo `call_next`" del nostro middleware
non gira — niente header `X-Request-ID`, niente riga di durata. Risolto
coprendo l'errore in entrambi i punti: `try/except` attorno a `call_next` nel
middleware (per durata + errore) e l'exception handler che mette l'header
sulla risposta 500.

**Due righe ERROR per un 500 sono volute.** Conseguenza del punto sopra, non
un bug: la prima riga porta la durata (dal middleware), la seconda il
traceback (dall'exception handler), e lo stesso `request_id` le collega. È la
firma di un errore tracciato da cima a fondo.

## Le verifiche fatte

- Tooling, da `backend/`: `uv run ruff check .`, `uv run mypy .` e
  `uv run pytest` sono rimasti verdi — i middleware non devono rompere
  nessun test esistente (e il fatto che i test siano passati dopo la fix del
  `base_url` lo conferma).
- Verifica manuale: avviato il server e colpiti un paio di endpoint
  (`/api/categories`, un percorso inesistente come `/api/nope`). Nel
  terminale compare una riga di log per richiesta, con metodo, percorso,
  stato, durata e `request_id`; nei devtools (scheda Network) l'header
  `X-Request-ID` è presente sulla risposta.
- L'ADR 0006 registra la decisione e le alternative scartate (CORS "just in
  case", auth come middleware globale, security headers/GZip nel backend).

## Cosa è rimasto aperto

- **Al deploy**: aggiungere il dominio reale a `allowed_hosts` (via `.env`)
  — è il modulo 9, e il journal del deploy lo segnala come punto da non
  dimenticare.
- **Logger strutturato**: il request logging a riga singola è la fondazione;
  il passaggio a righe JSON (o metriche) è rimandato, probabilmente nel
  modulo di deploy.
- **Security headers e rate limiting**: deciso in ADR 0006 che sono compito
  del reverse proxy, non dell'app — quindi vivranno nel modulo 9.
- **`X-Forwarded-For` / IP client**: il logger non gestisce ancora l'IP
  reale del client dietro un proxy; il modulo 9 lo affronterà con
  `--proxy-headers`.