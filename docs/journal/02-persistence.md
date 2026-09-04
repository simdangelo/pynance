# Journal 02 — Persistence: Postgres, modelli, configurazione e migrazioni

Questo journal racconta il **modulo 2 (Persistence)** del roadmap: il primo
modulo che ha dato sostanza al progetto. Il modulo 1 aveva lasciato uno
scheletro vuoto e una toolchain verde (uv, ruff, mypy, pytest, pre-commit);
il modulo 2 ha aggiunto il primo mattone vero — un database Postgres in
Docker, i modelli SQLAlchemy del dominio, la configurazione via
`pydantic-settings` e lo schema versionato con Alembic. Non spiega i concetti
generali — quelli stanno nelle wiki — ma *che cosa abbiamo fatto*, file per
file, quali insidie abbiamo incontrato e come le abbiamo risolte.

---

## Il contesto: cosa siamo andati a fare

Obiettivo del modulo: far girare un database reale, definire i primi due
modelli del dominio (`Category` e `Transaction`), leggere la configurazione da
un file `.env` e avere la prima migrazione Alembic applicata. Alla fine del
modulo l'app doveva avere un Postgres funzionante in un container, i modelli
che rappresentano le entità del budget e uno schema del database sotto
controllo di versione.

I concetti generali usati in questo modulo sono coperti dalle wiki:
`../wiki/docker-basics.md` (container, volumi, compose, networking),
`../wiki/pydantic-settings.md` (configurazione tipizzata), `../wiki/sqlalchemy-models.md`
(modelli 2.0 e "dumb models"), `../wiki/alembic.md` (migrazioni versionate) e
`../wiki/python-package-facade.md` (l'organizzazione del package `models`).

---

## Le decisioni prese (e dove sono registrate)

- **DB access sincrono.** La scelta sync-vs-async era un punto di decisione
  esplicito, non un'opzione data per scontata. Abbiamo scelto **SQLAlchemy
  sincrono** e registrato la motivazione in ADR 0002 (`../adr/0002-sync-sqlalchemy.md`):
  FastAPI esegue gli endpoint sync in un threadpool, a scala single-user non
  perdiamo nulla, e il codice sync è molto più semplice da scrivere e debuggare.
- **Soldi come `Decimal`, mai float.** ADR 0001
  (`../adr/0001-money-as-minor-units.md`) registra la decisione: gli importi
  sono `decimal.Decimal` memorizzati come `Numeric(12, 2)`, sempre positivi; la
  direzione (entrata/uscite) è portata da `transaction_type`, non dal segno.
  Questo evita la trappola dei due-source-of-truth (colonna tipo + importo con
  segno) e il drift dei float.
- **Postgres sempre via Docker.** Regola del progetto: mai installare Postgres
  sull'host. Il container con volume nominato e porta pubblicata è il modo
  standard, spiegato in `../wiki/docker-basics.md`.
- **Schema versionato con Alembic, non `create_all`.** Per il database reale:
  migrazioni. Per il database di test (che arriverà nel modulo 3) si userà
  `create_all` — è il trade-off documentato in AGENTS.md e in
  `../wiki/alembic.md`.
- **Configurazione con `pydantic-settings`.** Un oggetto `Settings` tipizzato
  che legge dal `.env`, con i segreti come `SecretStr` — vedi
  `../wiki/pydantic-settings.md`.
- **Package `models` come facciata.** Un file per entità + `__init__.py` che
  ri-esporta la API pubblica con `__all__` — il pattern descritto in
  `../wiki/python-package-facade.md`.

---

## Le modifiche al codice

### `docker-compose.yaml` (alla radice del repo)

Il file Compose che dichiara il servizio `db`: immagine `postgres:17`,
volume nominato `postgres_data` montato su `/var/lib/postgresql/data`,
porta `${POSTGRES_PORT}:5432` pubblicata sull'host, e un `healthcheck` con
`pg_isready` per sapere quando il DB è davvero pronto. Le variabili
(`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`,
`POSTGRES_HOST`) vengono interpolate da un file `.env` alla radice.

Due dettagli non ovvi:
- Il **volume nominato** è ciò che fa sopravvivere i dati a `docker compose
  down` — senza, ogni `down` svuoterebbe il database.
- L'`healthcheck` non era richiesto dall'esercizio ma è stato aggiunto subito:
  senza, i passi successivi (migrazioni) si sarebbero scontrati con "DB non
  ancora pronto".

### `.env.example` (alla radice)

Il modello di `.env` **committato** (il `.env` vero è gitignored): dichiara le
cinque variabili Postgres necessarie. È il "contratto" di configurazione che
il progetto si aspetta, come prescrive la wiki `pydantic-settings`.

### `backend/pynance/config.py`

La classe `Settings(BaseSettings)` con i campi `postgres_user`,
`postgres_password` (come `SecretStr`), `postgres_host`, `postgres_port`,
`postgres_db`, più una property `database_url` che compone la URL
`postgresql+psycopg://...` chiamando `.get_secret_value()` sulla password.
Il file `.env` viene letto con `env_file="../.env"` — relativo alla cartella
da cui parte l'app (`backend/`), quindi punta al `.env` di radice.

Il punto didatticamente importante (vedi anche la sezione Insidie): la URL
deve usare lo schema `postgresql+psycopg://`, **non** `postgres+psycopg://`,
altrimenti SQLAlchemy fallisce al momento della connessione.

### `backend/pynance/database.py`

Per ora contiene solo `Base(DeclarativeBase)` — la base dichiarativa da cui
ereditano tutti i modelli. Engine, `sessionmaker` e la dependency `get_db`
sono arrivati solo nel modulo 3, quando è servita una sessione vera: nel
modulo 2 i modelli esistono ma nessuno li usa ancora.

### `backend/pynance/models/`

Il package dei modelli, organizzato secondo il pattern facade:

- `__init__.py` — la facciata: importa e ri-esporta `Category`,
  `Transaction`, `TransactionType`, con `__all__` dichiarato. I consumatori
  importano `from pynance.models import Transaction`, mai percorsi profondi.
- `types.py` — l'enum `TransactionType(StrEnum)` con `INCOME` e `EXPENSE`.
  `StrEnum` (Python 3.11+) fa sì che il valore sia già una stringa, comodo
  per serializzare e confrontare.
- `category.py` — `Category`: `id`, `name`, `transaction_type` (l'enum),
  `created_at` timezone-aware con default `datetime.now(UTC)`. Le categorie
  sono **tipizzate per direzione**: una categoria è di entrata o di uscita.
- `transaction.py` — `Transaction`: `amount` come `Numeric(12, 2)`,
  `transaction_type`, `category_id` come FK **non-nullable** verso
  `categories`, `description`, `date`, `created_at` timezone-aware.

Tre scelte di dominio da notare:
- `category_id` **non-nullable** è una regola deliberata: ogni transazione ha
  una categoria (a differenza dello schema di esempio della wiki, dove la FK è
  opzionale).
- `amount` è `Decimal` memorizzato come `Numeric(12, 2)` (ADR 0001).
- `created_at` usa `DateTime(timezone=True)` con default Python-side
  `lambda: datetime.now(UTC)` — mai naive local time.

### `backend/pyproject.toml`

Aggiunte le dipendenze runtime (`alembic`, `psycopg[binary]`, `pydantic`,
`pydantic-settings`, `sqlalchemy`) e due configurazioni importanti:
- `extend-exclude = ["alembic/versions/*.py"]` sotto `[tool.ruff]` — le
  migrazioni autogenerate non devono passare per il linter (vedi Insidie).
- `[tool.mypy]` con `strict = true` — confermato per tutto il codice, modelli
  inclusi.

### `backend/alembic/` — la configurazione delle migrazioni

- `alembic.ini` — config del tool, con `script_location` e
  `prepend_sys_path = .` (serve perché `env.py` possa importare `pynance`).
- `alembic/env.py` — il file più delicato. Due lavori critici: (1) imposta la
  URL del database **dalla stessa fonte di settings dell'app**
  (`config.set_main_option("sqlalchemy.url", settings.database_url)`), così
  migrazioni e app concordano sul DB; (2) **importa i modelli**
  (`import pynance.models`) prima di configurare il metadata, altrimenti
  autogenerate vede uno schema vuoto e genera migrazioni vuote. Inoltre è la
  forma **sync** di `env.py` (coerente con ADR 0002).
- `alembic/script.py.mako` — il template delle migrazioni, **modernizzato**
  subito per emettere stile moderno (`str | Sequence[str] | None`, import
  da `collections.abc`) invece del vecchio `typing.Union`/`Sequence` che ruff
  avrebbe flaggato (UP007, UP035).
- `alembic/versions/c2114fc97c93_initial_schema.py` — la **prima migrazione**,
  autogenerata, revisionata prima di applicarla. Crea `categories` e
  `transactions` con le colonne, la FK e l'enum visti sopra.

### `backend/uv.lock`

Aggiornato da `uv sync` dopo l'aggiunta delle dipendenze — il lockfile del
progetto, da committare sempre.

---

## Le insidie incontrate

Questa è la parte che ha insegnato di più: errori reali e le loro cause.

- **`postgres` vs `postgresql` nel dialect.** La URL
  `postgres+psycopg://...` fallisce con `Can't load plugin:
  sqlalchemy.dialects:postgres.psycopg`. Il dialect di SQLAlchemy si chiama
  `postgresql`, quindi la URL corretta è `postgresql+psycopg://`. Il guaio:
  l'errore appare solo **al momento della connessione**, non all'import.
- **Credenziali del container "baked in" al primo avvio.** L'immagine Postgres
  inizializza il data directory **una sola volta**, al primo start, usando i
  `POSTGRES_*` di allora. Se si cambiano le variabili dopo, il container
  continua a usare le credenziali vecchie (e si ottiene `password
  authentication failed`). La soluzione quando non ci sono dati preziosi:
  `docker compose down -v` (cancella il volume) e `up -d` per re-inizializzare.
- **`env.py` async vs sync.** `alembic init` genera per default un `env.py`
  **sync**; `alembic init -t async` ne genera uno async. Per errore si può
  finire col template sbagliato (quello async usa `async_engine_from_config`,
  `asyncio.run`...) che fallisce in modi confusi. Con ADR 0002 serviva la
  forma sync — da verificare sempre quale template si sta scrivendo.
- **`SecretStr` non si interpola negli f-string.** `f"...{password}..."` con un
  `SecretStr` produce la stringa letterale `**********`, non il valore — di
  proposito, per non far trapelare segreti. Per mettere la password nella URL
  di connessione serve `.get_secret_value()`.
- **`env.py` ha bisogno di due cose insieme.** Se manca la URL dai settings,
  le migrazioni puntano altrove; se manca l'import dei modelli, autogenerate
  produce migrazioni vuote. Il sintomo "ha generato niente" è quasi sempre uno
  di questi due.
- **`pynance/__init__.py` che sparisce.** Se manca l'`__init__.py` del package
  top-level, mypy si rifiuta di controllare il resto dell'albero con `Source
  file found twice under different module names`. Lo skeleton del modulo 1
  non deve perderlo.
- **`models/models.py` è una convenzione pessima.** Un file `models/models.py`
  produce l'import ridondante `from pynance.models.models import Transaction`.
  Meglio un file per entità (`category.py`, `transaction.py`) più un `types.py`
  condiviso, con la facciata in `__init__.py` — la struttura che scala con i
  moduli successivi.
- **Le migrazioni autogenerate non rispettano ruff/mypy.** Il template default
  emette `typing.Sequence`/`Union` e righe oltre i 100 caratteri, che ruff
  flagga (UP007, UP035, E501, I001). Abbiamo fatto **entrambe** le cose:
  modernizzato `script.py.mako` (così le migrazioni *future* sono pulite) ed
  escluso `alembic/versions/*.py` da ruff. Attenzione alla regola AGENTS.md:
  mai modificare una migrazione *già applicata*, nemmeno per il formatting.
- **Rivedere la migrazione prima di applicarla.** `revision --autogenerate` è
  una bozza. In questo modulo è uscita corretta (tabelle, FK, Numeric,
  DateTime timezone-aware rilevati bene), ma l'abitudine va costruita ora:
  leggere il file generato, controllare colonne/FK/default, *poi* `upgrade
  head`. Autogenerate sbaglia regolarmente indici e rinomine.

---

## Le verifiche fatte

- `docker compose up -d` → il container parte; `docker compose ps` mostra il
  servizio `db` **healthy** (grazie all'healthcheck con `pg_isready`).
- `uv run alembic revision --autogenerate -m "initial schema"` → ha generato la
  migrazione; **revisionata** (colonne, enum, FK corrette) prima di applicare.
- `uv run alembic upgrade head` → applicata senza errori.
- Verifica che le tabelle esistano davvero dentro il container (ispezione via
  `psql`/`docker exec`): `categories` e `transactions` presenti con le colonne
  attese.
- Pipeline verde: `uv run ruff check .`, `uv run mypy .`, `uv run pytest`
  (in questo modulo c'è solo il test di fumo `test_smoke.py` del modulo 1; i
  test veri arrivano al modulo 3).

---

## Cosa è rimasto aperto

- **La sessione vera e propria.** Engine, `sessionmaker` e la dependency
  `get_db` non esistono ancora: nel modulo 2 `database.py` contiene solo
  `Base`. Serviranno al modulo 3 quando i servizi dovranno leggere e scrivere.
  Le note sync di ADR 0002 (`expire_on_commit=False`, una sessione per
  richiesta) sono già state decise ma non ancora implementate.
- **I test sul database.** Il modulo 3 porterà i test HTTP con un Postgres di
  test dedicato via `create_all` (schema dai modelli, non dalle migrazioni) —
  il trade-off è già documentato in AGENTS.md.
- **Il backup pre-migrazione.** La regola "backup prima di ogni migrazione che
  tocca dati esistenti" è stata stabilita in questo modulo ma qui non serviva
  (prima migrazione, database vuoto). Il primo caso concreto sarà la migrazione
  di backfill del `user_id` nel modulo Auth.
- **L'`owner_id`.** La struttura dei dati tiene già d'occhio la futura
  multi-utenza (module 5, Auth), ma senza aggiungerla prematuramente: per ora
  le tabelle sono senza colonna utente.