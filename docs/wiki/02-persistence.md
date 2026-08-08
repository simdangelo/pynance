# Module 2 — Persistence

Module 1 gave us the skeleton and a green toolchain. Module 2 gives the project
its first real substance: a **Postgres database running via Docker**, the
**SQLAlchemy models** representing our domain, **configuration** via
`pydantic-settings`, and **Alembic** to version the schema. By the end you'll
have a running database, two models, and the first migration applied.

This file is self-contained: everything you need to complete the exercise is
here. The `topics/` folder holds optional, general deep-dives (Docker,
SQLAlchemy, descriptors, etc.) that go further than this module needs — read
them for depth, but they're a bonus, not required.

---

## 1. Docker — running Postgres in a container

### Why Docker at all

Software depends on its environment: libraries, versions, paths, config.
"Works on my machine" is real. Docker packages an application *plus its runtime
environment* into a self-contained unit that runs identically anywhere Docker
is installed. Our project rule is: **Postgres always runs via Docker, never
installed on the host** — so your machine stays clean and the DB version is
pinned in a file.

### Image vs container

- **Image** = the blueprint (read-only template): filesystem, libraries,
  config. It never changes while running.
- **Container** = a running instance of an image, with its own writable layer.

One image, many containers. Deleting a container doesn't touch the image.
Anything a container writes is lost when it's removed — *unless* you persist it
(volumes, below).

### Volumes — persistence

A container's writable layer is ephemeral. **Volumes** are named storage that
outlives containers. For a database this is non-negotiable: your data must
survive restarts and container recreation. The volume is mounted at a path
*inside* the container (`/var/lib/postgresql/data` for Postgres); the container
doesn't know its storage is a Docker volume.

### Docker Compose

For more than one container, running `docker run` by hand is unmanageable.
**Compose** declares the whole stack in one YAML file and manages it with one
command:

```yaml
services:
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_PASSWORD: secret

volumes:
  pgdata:
```

```bash
docker compose up -d      # start in the background
docker compose ps         # status
docker compose down       # stop and remove containers
```

Compose creates the declared volumes, starts services, and puts them on a shared
network.

### Networking

Containers reach each other on the compose network **by service name** (`db`,
`backend`, ...) — no IPs needed. To reach a container from your host (browser,
tests), you **publish** a port: `ports: - "5432:5432"` maps host 5432 to the
container's 5432. Nothing is reachable from the host unless published.

### Docker pitfalls

- **No volume → data loss** on every `docker compose down`. Data dir must be a
  volume.
- **Port conflicts** → "port already in use": another container or a local
  Postgres already bound the host port.
- **`localhost` confusion** → inside the compose network the DB is `db`, not
  `localhost`. `localhost` inside a container is the container itself.
- **Editing files in a running container** → changes vanish on recreate.
  Config lives in the image or in env vars/volumes.

---

## 2. Configuration with `pydantic-settings`

### Why not raw `os.environ`

Scattered `os.environ["KEY"]` reads are unchecked strings: no type safety, typos
fail only at runtime, and there's no single place listing what config exists.
`pydantic-settings` reads env vars (typically from a `.env` file), **validates**
them into a typed object, and fails fast if a required value is missing.

### The shape

```python
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    database_url: str
    secret_key: SecretStr
    some_optional: int = 10
```

- Each field maps to an env var of the same name; `.env` supplies values, real
  env vars take precedence.
- **Required field with no value → error at import.** That catches a missing
  `DATABASE_URL` early, not at first connection.
- **`SecretStr`** for secrets: the value is real, but printing the object shows
  `**********` — no accidental credential leaks in logs. Unwrap explicitly with
  `.get_secret_value()`.

### `.env` placement

`pydantic-settings` reads `.env` relative to the current working directory. In
this project the app runs from `backend/`, so `backend/.env` is the home. It is
**gitignored** (it holds secrets); commit a `.env.example` instead documenting
the required variables.

### Settings pitfalls

- **Missing required field → app dies at import.** Correct, but make sure the
  `.env` exists before running anything.
- **Every env var you use should be declared** on `Settings` — the class is the
  contract.
- **No default for real secrets** — a committed default defeats the purpose.
- **Don't commit `.env`** — it leaks secrets. Commit only the example.

---

## 3. SQLAlchemy 2.0 models

### What an ORM does

An ORM maps a Python class to a DB table and instances to rows, so you write
`session.add(obj); session.commit()` instead of raw SQL. You think in Python
objects; SQLAlchemy speaks SQL.

### The 2.0 style: `Mapped` and `mapped_column`

- **`Mapped[T]`** — the attribute's *type* as an annotation: `Mapped[int]`,
  `Mapped[str | None]`. mypy and SQLAlchemy both read it.
- **`mapped_column(...)`** — the *column* configuration: DB type, constraints,
  defaults, PK.

A minimal model:

```python
from sqlalchemy import String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
```

Reading it: `categories` table, integer PK `id`, unique varchar(100) `name`.

### Conventions you should follow

- **Explicit, pluralized `__tablename__`** — never auto-generated.
- **Nullability follows the annotation.** `Mapped[str]` = NOT NULL;
  `Mapped[str | None]` = nullable.
- **Timezone-aware timestamps** — `DateTime(timezone=True)` with a default from
  `datetime.now(UTC)`, never naive local time.
- **Integer PKs** — `id: Mapped[int] = mapped_column(primary_key=True)`.
- **Foreign keys + relationships** — the DB-level constraint and the
  Python-level navigation are separate concepts that work together:

```python
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    category: Mapped[Category | None] = relationship()
```

- **No `__init__`** — SQLAlchemy provides a keyword constructor for mapped
  columns: `Transaction(amount=..., description=...)`.

### Models are dumb data holders

This is the architecture's most important rule: **no business logic methods on
models beyond simple derived properties.** Allowed: a computed `@property`
(e.g. `image_path`). Not allowed: validation, balance math, "can I delete this"
checks. Those belong in `services/` (Module 3).

Why? The model is an *implementation detail of persistence*, not the heart of
your domain. Rules in models are hard to test in isolation, get duplicated, and
make the model untransportable. State lives on models; behavior lives in
services.

### Package structure and import conventions

Models live in a `models/` package with **one file per entity**, and the package
`__init__.py` acts as a **facade** that re-exports the public API:

```
models/
├── __init__.py        # facade: re-exports the public API
├── types.py           # TransactionType (shared enum)
├── category.py        # Category
└── transaction.py     # Transaction
```

```python
# models/__init__.py — the facade
from pynance.models.category import Category
from pynance.models.transaction import Transaction
from pynance.models.types import TransactionType

__all__ = ["Category", "Transaction", "TransactionType"]
```

Conventions that must be followed:

- **Consumers import from the facade**: `from pynance.models import Transaction` —
  never from deep paths like `from pynance.models.transaction import Transaction`.
  The facade hides where things actually live, so the internal layout can change
  without touching callers.
- **`__all__` in `__init__.py` facades only.** It declares the package's public
  API and controls what `from package import *` exposes. It is *not* needed in
  regular modules (that's ceremony, not best practice).
- **Absolute imports over relative**: inside the package, use
  `from pynance.models.types import TransactionType`, not
  `from .types import TransactionType`. Absolute imports are PEP 8- and
  mypy-preferred and stay robust as packages nest.
- **Only the `__init__.py` facade imports the leaf modules.** Leaf modules import
  each other by module path. Never have a leaf module import from the package
  root (`from pynance.models import ...`) — that's how circular imports start.

### Money, specifically

Per ADR 0001: **amounts are `decimal.Decimal`, never floats.** Floats can't
exactly represent most decimal fractions (0.1 + 0.2 != 0.3), so accumulated
money drifts. `Decimal` is exact. Store it as `Numeric(12, 2)` and never build a
`Decimal` from a float (`Decimal("12.34")`, not `Decimal(0.1)`).

**Direction is not in the sign.** Amounts are stored positive; income vs expense
is carried by a `transaction_type` field, and categories are typed by direction
(income categories like "salary", expense categories like "groceries").
Direction is resolved at report time. This avoids the two-sources-of-truth trap
of *both* a type column and signed amounts.

### Model pitfalls

- **Forgotten `__tablename__`** → auto-inferred, never what you want.
- **Redundant `nullable=False`** in `mapped_column` — in 2.0 the annotation
  already says it. Write the annotation correctly.
- **`default=` vs `server_default=`** — Python-side vs DDL-baked. For
  timestamps, a Python-side `default=lambda: datetime.now(UTC)` works in tests,
  `create_all`, and migrations.
- **Mutable defaults** (`default=[]`) are shared across instances — flagged by
  ruff (B006).

---

## 4. Alembic migrations

### Why migrations and not `create_all`

`Base.metadata.create_all(engine)` creates tables that don't exist yet — and
does **nothing** about tables that do. Add a column and rerun it: nothing
happens. Rename a field: it won't know.

Alembic records every schema change as a **versioned migration** (apply + undo),
so any environment can be brought to exactly the schema your code expects. Rule:
**never modify the schema by hand or run raw DDL — always via Alembic.**

### Core commands

```bash
uv run alembic revision --autogenerate -m "add transactions table"
uv run alembic upgrade head
```

- `revision --autogenerate` compares current models against the database and
  **drafts** a migration.
- `upgrade head` applies all pending revisions.

Two rules that matter:
1. **Review the generated script before applying** — autogenerate misses index
   changes, server defaults, and misreads renames (drop+add instead of rename).
2. **Never edit an applied migration** — once applied anywhere, it's history.
   Fix forward with a new revision.

### The wiring

- `alembic.ini` — tool config (where migrations live, where the URL comes from).
- `alembic/env.py` — run on every invocation. Two critical jobs:
  1. Read the DB URL from the **same settings source as the app**, so
     migrations and app agree on the database.
  2. **Import your models** so `Base.metadata` is populated — otherwise
     autogenerate sees an empty schema and generates empty migrations.
- `alembic/versions/` — the migration scripts.

### Upgrade / downgrade contract

Every migration defines both:

```python
def upgrade() -> None:    # apply the change
def downgrade() -> None:  # undo it
```

`upgrade` then `downgrade` must return the DB to its previous state. Downgrades
are your undo button and your bad-deploy safety net.

### Migration pitfalls

- **`env.py` doesn't import models** → empty or wrong autogenerated migrations.
  The #1 cause of "it generated nothing."
- **Applying without reviewing** → you inherit autogenerate's mistakes.
- **Editing an applied migration** → environments diverge silently.
- **Migrations vs the test DB** — tests use `create_all` (fast, always matches
  current models); Alembic is for the real database. This is a conscious
  trade-off documented in AGENTS.md.

---

## 5. Sync vs async — already decided

The DB access style was a deliberate decision point (ADR 0002). The answer:
**synchronous.** FastAPI runs sync endpoints in a threadpool, so at single-user
scale you lose nothing, and sync code is far simpler to write and debug (no
`async`/`await`, no `anyio` test fixtures). Async buys *concurrency*, not speed —
and this app has no concurrency need. The ADR records the escape hatch: if the
app ever goes public and sync bottlenecks, migrating is real work but the
service logic and tests transfer.

Two sync-specific notes:
- Set **`expire_on_commit=False`** on the sessionmaker — after `commit()`,
  attribute access otherwise re-queries the DB.
- One session per request, never shared across threads — that's what the
  `get_db` dependency pattern enforces.

---

## The exercise — do it on your own

1. **Docker Compose** — write `docker-compose.yml` at the repo root running
   Postgres 16, with a named volume for its data and a published port. Verify
   `docker compose up -d` brings it up and `docker compose ps` shows it healthy.
2. **Settings** — add `pydantic-settings` to the project. Create a `Settings`
   class (DB URL + `secret_key` as `SecretStr`) reading `backend/.env`. Create
   `backend/.env` (gitignored) and a committed `.env.example` documenting the
   required variables.
3. **Models** — in `backend/pynance/models/`, define `Category` and
   `Transaction` in the SQLAlchemy 2.0 typed style, **one file per entity** with
   the package `__init__.py` as a facade re-exporting the public API (see the
   "Package structure and import conventions" section above). Per our decisions:
   - `Transaction.amount` is a **`Decimal`** (ADR 0001) — never a float, stored
     as `Numeric`, always positive.
   - `Transaction.transaction_type` (`INCOME`/`EXPENSE`) carries the direction;
     `Transaction.category_id` is a **non-nullable** FK to `categories`, and
     categories are themselves typed by direction (a deliberate domain rule:
     every transaction has a category).
   - `Transaction` has a timezone-aware timestamp defaulting to now.
   - **Dumb models** — no validation methods, no behavior.
4. **Alembic** — install Alembic, configure it (URL from `settings`, `env.py`
   importing your models), generate the first migration, **review it**, and
   apply with `upgrade head`. Verify the tables exist in the container.

Keep the pipeline green as you go: `uv run ruff check .`, `uv run mypy .`,
`uv run pytest`.

When done, send me your code (docker-compose, settings, models, alembic config)
and I'll review it.

---

## Lessons learned implementing this module

These are the real problems hit while doing the exercise — worth recording so the
next person (or you, in Module 3) doesn't repeat them.

### The `postgres` vs `postgresql` dialect gotcha

SQLAlchemy's Postgres dialect is registered as **`postgresql`**, not `postgres`.
A URL like `postgres+psycopg://...` fails with
`Can't load plugin: sqlalchemy.dialects:postgres.psycopg`. The correct scheme is
`postgresql+psycopg://`. The config's `database_url` must use it — the failure
only appears at *connection* time, not at import.

### Postgres container credentials are baked in at first run

This one cost real debugging time. The Postgres image initializes its data
directory **once**, on the first container start, using whatever
`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` were set *then*. After that,
changing the env vars (e.g. editing `.env`) does nothing — the container
keeps using the credentials from the first initialization, and changing them
later just causes `password authentication failed` / `role does not exist`.

If you create the compose file or `.env` after the volume already exists, the
volume holds stale credentials. The fix (safe here because there was no data):
`docker compose down -v` deletes the volume, then `docker compose up -d`
re-initializes with the current env. Check for this before assuming a password
is wrong — verify the role actually exists inside the container:
`docker exec <container> psql -U <user> -d <db> -c "SELECT 1;"`.

### Alembic's async vs sync `env.py`

`alembic init` generates a **sync** `env.py`; `alembic init -t async` generates
an **async** one (using `async_engine_from_config`, `asyncio.run`, etc.). Since
this project is sync (ADR 0002), the `env.py` must be the sync form — the async
template will still try to run and fail in confusing ways. When wiring `env.py`,
always double-check which template you generated.

### `SecretStr` doesn't interpolate into f-strings

`f"...{self.secret}..."` with a `SecretStr` produces the literal `**********`,
not the value — by design, to prevent leaks. To embed a secret in a connection
URL you must call `.get_secret_value()` explicitly:
`self.postgres_password.get_secret_value()`.

### `env.py` needs both the URL *and* the models

Two things must be true in `env.py` or autogenerate silently produces nothing:
1. `config.set_main_option("sqlalchemy.url", settings.database_url)` — so the
   migration connects to the same DB the app uses.
2. Import your models module (`import pynance.models.models`) — so
   `Base.metadata` is populated before autogenerate compares against it.

### `pynance/__init__.py` must exist

If the top-level `pynance/__init__.py` is missing, mypy reports
`Source file found twice under different module names` and refuses to check the
rest of the tree. Every package directory needs its `__init__.py` (the empty
skeleton from Module 1 must not lose it).

### Avoid `models/models.py`-style nesting

A `models/models.py` file produces the redundant import
`from pynance.models.models import Transaction`. Cleaner: one file per entity
(`category.py`, `transaction.py`) plus a shared `types.py` for enums, with the
package `__init__.py` as a facade (see "Package structure and import
conventions" in section 3). This is the layout that scales as more entities are
added in later modules.

### Autogenerated migrations don't match ruff/mypy style

Alembic's default template emits `typing.Sequence`/`Union` and lines over 100
chars, which ruff flags (UP007, UP035, E501, I001). Two options:
- Exclude autogenerated versions from ruff: add
  `extend-exclude = ["alembic/versions/*.py"]` to `[tool.ruff]`.
- Fix the template (`alembic/script.py.mako`) to emit modern style, so *future*
  migrations are clean — but never edit an *already applied* migration file,
  even for formatting (AGENTS.md rule: fix forward with a new revision).

We did both: modernized the template and excluded the versions dir.

### Review the migration before applying

`revision --autogenerate` is a draft. In this exercise it was correct
(tables, FK, Numeric, timezone-aware DateTime all detected), but the habit is:
read the generated file, confirm the columns/FKs/defaults, *then* `upgrade
head`. Autogenerate routinely misses index changes and misreads renames.

---

## Optional deeper reading

The `topics/` folder contains general, standalone deep-dives that go beyond this
module's needs. They are a bonus — the exercise is fully covered by this file.

- `topics/docker-basics.md` — Docker concepts in more depth.
- `topics/sqlalchemy-models.md` — more on the ORM and its philosophy.
- `topics/alembic.md` — migrations internals.
- `topics/pydantic-settings.md` — configuration in more depth.
- `topics/sync-vs-async.md` — the concurrency trade-off, general.
- `topics/descriptors.md` — how `Mapped[...]` works under the hood (Python
  mastery: descriptors).
