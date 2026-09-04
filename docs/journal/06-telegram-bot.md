# Modulo 6 — Il bot Telegram: un secondo client

Il terzo livello di presentazione di Pynance, dopo il frontend web e l'API
REST. Risolve un problema pratico: registrare una transazione richiedeva
aprire il PC, così gli acquisti piccoli venivano dimenticati. Un bot Telegram
permette di registrare una transazione dal telefono in pochi secondi. È una
feature di prodotto (tracciata in `../ROADMAP.md`), costruita sul modulo 5
(assets: le transazioni ora hanno un `asset_id`) e prima dell'autenticazione
del modulo 7 — infatti è deliberatamente **single-user**.

È anche la dimostrazione che l'architettura a strati paga: la logica di
business vive in `services/`, framework-free, quindi può servire qualunque
client, non solo HTTP. Il bot è un secondo punto d'ingresso con lo stesso
cervello: `Utente (telefono) → server Telegram → nostro processo bot →
service layer → DB`. Il concetto del "client che non è HTTP" è spiegato in
`../wiki/architettura-a-strati.md`; questo journal racconta cosa abbiamo
fatto noi.

## Le decisioni prese

- **Long-polling, non webhook.** Il bot è un **processo separato** che chiede
  a Telegram "ci sono messaggi nuovi?" in loop. Non serve un URL pubblico o
  HTTPS, quindi è la scelta giusta per un tool single-user. La decisione è
  registrata nella sezione del ROADMAP (i webhook, che richiedono un endpoint
  pubblico, restano per il futuro multi-utente).
- **Comandi strutturati**: `/expense 5.50 groceries`, `/income 100 salary`,
  `/balance`. Il parsing è esplicito e non ambiguo — niente linguaggio
  naturale.
- **Terzo livello di presentazione**: il bot chiama lo stesso service layer
  (`services/transaction.create_transaction`, `services/asset.get_asset_balances`),
  mai la logica di business reimplementata.
- **Identità single-user**: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ALLOWED_CHAT_ID`
  in `.env`; qualunque altra chat viene ignorata. Niente auth per ora.
- **Default ragionevoli**: l'asset è il primo asset `Liquid` dell'utente, la
  categoria è risolta per nome (match esatto, poi case-insensitive).
- **Scope v1**: `expense`, `income`, `balance`. Niente trasferimenti,
  ricorrenti o modifica — esplicitamente rimandati.
- **Denaro**: `Decimal`, mai float (ADR 0001, `../adr/0001-money-as-minor-units.md`).
  **DB**: SQLAlchemy sincrono (ADR 0002, `../adr/0002-sync-sqlalchemy.md`),
  eseguito in un thread per non bloccare l'event loop (vedi sotto).

## Le modifiche al codice

Il modulo è nel commit `317aa55`. Il bot vive in `backend/pynance/bot/`, con
la convenzione facade + `__all__` (vedi `../wiki/python-package-facade.md`).

### `backend/pynance/config.py`

Due impostazioni nuove, lette da `.env` con pydantic-settings (vedi
`../wiki/pydantic-settings.md`):
`telegram_bot_token: SecretStr` (un segreto: mai loggato, mai committato) e
`telegram_allowed_chat_id: int` (default `0` = nessuna chat consentita).

### `backend/pynance/bot/__init__.py`

Il facade: re-esporta `start`, `expense`, `income`, `balance` e dichiara
`__all__`. I consumatori importano da `pynance.bot`, mai dai moduli interni.

### `backend/pynance/bot/main.py`

L'entry point: `build_app()` legge il token dalle settings (e alza
`RuntimeError` se non è impostato — meglio un crash esplicito che un bot che
parte muto), costruisce l'`Application` di `python-telegram-bot`, registra i
quattro `CommandHandler` e, nel `if __name__ == "__main__"`, chiama
`run_polling()`.

### `backend/pynance/bot/handlers.py`

Il cuore del modulo. Le funzioni non ovvie:

- **`_is_allowed(update)`** — controlla che `update.effective_chat.id` sia
  il `telegram_allowed_chat_id`; ogni handler inizia con questo check e fa
  `return` in silenzio se la chat non è autorizzata. È il firewall
  single-user.
- **`_parse_amount(raw)`** — `Decimal(raw.replace(",", ".")).quantize(...)`.
  Parte dalla **stringa grezza**, mai da un float (ADR 0001,
  `../adr/0001-money-as-minor-units.md`), e accetta anche
  la virgola (una tastiera italiana scrive `5,5`).
- **`_resolve_category(...)`** — match esatto sul nome, poi case-insensitive;
  se non trova nulla, risponde con un errore che elenca le categorie
  disponibili (perché un utente dal telefono non le vede da nessuna parte).
- **`_default_asset_id(...)`** — il primo asset `Liquid` dell'utente; senza
  asset Liquid, `AssetNotFoundError` (→ messaggio chiaro, non un crash).
- **`_log_transaction(...)`** — costruisce un `TransactionCreate` con
  `occurred_on=date.today()` e chiama `transaction_service.create_transaction`.
  È il punto dove si rispetta il confine architetturale: il bot è
  presentazione, la regola di business sta nel service. Non costruisce mai
  `Transaction(...)` da sé.
- **I tre handler async** (`expense`, `income`, `balance`) condividono la
  stessa forma: `with SessionLocal() as session:` (una sessione per update,
  vedi `../wiki/sqlalchemy-sessions.md`), poi la chiamata al service
  sincrono in `asyncio.to_thread(...)` (vedi l'insidia sotto), e un
  `try/except` largo che cattura `ValueError`, `CategoryNotFoundError`,
  `AssetNotFoundError`, `InvalidOperation`, `RuntimeError` e risponde
  **sempre** qualcosa all'utente — che l'operazione sia riuscita o no.

### La dipendenza: `python-telegram-bot`

`uv add python-telegram-bot` (`>=22.8` in `pyproject.toml`). La libreria è
built on asyncio: gli handler sono `async def`.

### Il bot dopo l'auth (modulo 7)

Il commit `827205a` (auth) ha adattato gli handler al multi-utente: i
servizi ora pretendono `user_id`, quindi il bot ha guadagnato
`_default_user_id(...)` (il primo utente per `id`) e lo passa a ogni chiamata.
È un segnaposto temporaneo: il bot è ancora single-user, ma *scoperto* per
utente. Vedi `07-auth.md` per la storia di quel modulo.

## Le insidie incontrate

- **Bloccare l'event loop.** PTB è async; la nostra SQLAlchemy è sincrona
  (ADR 0002, `../adr/0002-sync-sqlalchemy.md`). Chiamare un `db.query(...)`
  dentro un handler async congela l'intero bot finché la query non torna. La
  fix è `asyncio.to_thread(...)`, che esegue il lavoro sincrono in un worker
  thread e lascia l'event loop libero. È lo stesso problema che FastAPI
  risolve con la threadpool per gli endpoint `def`; il concetto è in
  `../wiki/sync-vs-async.md`.
- **Una sessione per update, non condivisa.** Come `get_db` per l'API, ogni
  handler apre la propria `SessionLocal()` e la chiude (qui: `with`).
  Condividere una sessione tra messaggi è la via per bug di stato e race
  conditions.
- **Chiamare il service, non il model.** La tentazione del bot è costruire
  `Transaction(...)` direttamente: corto, ma bypassa le regole (validazione
  della categoria, dell'asset, del commit). Il confine architetturale va
  rispettato anche da un client non-HTTP.
- **`Decimal` da float o stringa imprecisa.** L'utente può scrivere `5.5` o
  `5,5`; il parsing parte sempre dalla stringa e quantizza, mai da un float
  già convertito (ADR 0001, `../adr/0001-money-as-minor-units.md`).
- **Categoria sconosciuta.** Rispondere con un errore utile (l'elenco delle
  categorie disponibili), non con un traceback.
- **Errori non gestiti.** L'utente dal telefono non vede stack trace: ogni
  handler risponde sempre, successo o errore.
- **Chat estranee.** Senza il check `_is_allowed`, chiunque abbia il token
  (o trovi il bot) potrebbe scrivere transazioni nel nostro database.

## Le verifiche fatte

- **Tooling**: `uv run ruff check .` e `uv run mypy .` verdi sul package
  `pynance/bot` e su `config.py`.
- **Nessun test automatico per il bot.** La suite pytest testa l'app
  *attraverso* l'HTTP (vedi `../wiki/test-attraverso-http.md`); il bot è un
  processo a long-polling che parla con i server di Telegram, quindi non è
  coperto da quel layer. La verifica del modulo è stata manuale: il bot gira
  accanto all'app web e si prova scrivendo `/expense 5.50 groceries` da
  Telegram, controllando che la transazione compaia nell'app.
- Il modulo è uscito senza errori anche dopo l'adattamento dell'auth
  (modulo 7).

## Cosa è rimasto aperto

- **Il collegamento bot ↔ utente.** Oggi il bot è single-user e usa il
  primo utente del database come default (e il `chat_id` come filtro). Con
  gli account reali va deciso come il bot si aggancia a un utente specifico:
  login/sessione dedicata o associazione esplicita chat→account. È
  l'item rimasto aperto registrato in `07-auth.md`.
- **Il bot non è in produzione.** Al deploy (modulo 10) il bot è rimasto
  fuori: un processo a long-polling non è il fit naturale di un web service
  HTTP. Vedere `10-deploy-paas-render.md` per la decisione.
- **Scope v1 limitato.** Niente trasferimenti, ricorrenti, modifica o
  cancellazione via bot — decisione esplicita nel ROADMAP, da rivisitare se
  il bot diventa un client serio.