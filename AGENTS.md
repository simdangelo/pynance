# AGENTS.md

## Project Overview

**Pynance** is a personal budget tracking application, being rebuilt from scratch as a **learning project** — but not a toy. The explicit goal is a **production-ready application**, initially run by a single user (the project owner) on their own machine, with a realistic possibility of eventually being deployed publicly if it proves useful. Every design and technology decision should hold up under that bar, even in early modules: common standards and best practices should be followed throughout, not just "whatever gets a demo working."

The user is writing the **backend** manually to build deep Software Engineering skills. The **frontend** is written entirely by an LLM agent — the user does not intend to learn frontend development in this project, and does not review frontend code line by line.

The project is a **monorepo** with a FastAPI backend and a React (Vite + TypeScript) frontend, communicating over a JSON REST API.

---

## Learning Workflow (IMPORTANT — read before writing any backend code)

Backend work follows a **Wiki → Autonomous Implementation → Code Review → Iterate** loop:

1. **Wiki module**: for the topic at hand, the agent produces a Markdown guide in `docs/wiki/` covering the core concept and why it exists, the main trade-offs and alternatives, common pitfalls, and a minimal illustrative example (never the exact solution to the user's exercise).
2. **Autonomous implementation**: the user reads the guide and writes the code themselves.
3. **Code review**: the user shares their code. The agent reviews it and clearly states what needs fixing and why. The user makes the corrections and shares the code again; the agent reviews the new version. This can repeat a couple of times.
4. **Unblock when needed**: if after a few rounds the user is stuck, or has already grasped the concept and just wants to move forward, the user can explicitly ask the agent to write the corrected/finished code directly. This is a normal, expected part of the loop — not a failure state — and should be offered by the agent itself once a couple of review rounds haven't converged, rather than making the user ask every time.

**Backend code is normally written by the user**, with the agent writing it directly only as the unblock step above, or as small illustrative snippets inside a wiki guide.

**Frontend code is written directly by the agent**, end to end. It should still follow the architectural boundary below (no business logic in the frontend) even though the user won't be reviewing it in detail.

### ADRs vs Wiki
Kept as separate artifacts, in separate folders:
- `docs/wiki/*.md` — teaches the general concept (e.g. "sync vs async in Python web backends"), broadly applicable beyond this project.
- `docs/adr/NNNN-title.md` — records the specific decision *this* project made, using a lightweight template: Context, Decision, Alternatives considered, Consequences. Near-immutable: if a decision changes later, write a new ADR that supersedes the old one rather than editing it.

Every non-trivial architectural choice (sync vs async, JWT vs sessions, cookie storage, etc.) gets an ADR once decided, in addition to the wiki guide that taught the concept.

### Python Mastery Track (parallel, ongoing)
The user is a mid-level Python developer and wants this project to also be an opportunity to solidify or fill gaps in core Python language competency — not just architecture/framework knowledge. Whenever a module's implementation naturally involves a language feature worth reinforcing (generators, closures, decorators, context managers, comprehensions, `itertools`/`functools`, descriptors, `Protocol`s and structural typing, advanced typing, `asyncio` fundamentals, etc.), the agent should flag it and offer a short wiki note on it, folded into the relevant module rather than as a separate roadmap step. Since "what counts as mid-level" is fuzzy, the agent should feel free to ask the user directly whether a given topic is worth covering or already solid, rather than guessing.

---

## Learning Roadmap (fixed order — do not reorder without proposing it explicitly first)

1. **Setup & Tooling** — `uv`, `ruff`, `mypy`, `pytest`, empty layered folder skeleton (`api/`, `services/`, `models/`, `schemas/`), pre-commit hooks. No feature code yet. *(done)*
2. **Persistence** — Postgres via Docker Compose (first Docker wiki module: image vs container, volumes, docker-compose, container networking), SQLAlchemy 2.0 models (typed `Mapped`/`mapped_column` style), first Alembic migration. Also introduces `pydantic-settings` for reading `.env`. **DB access is synchronous** — decided here via its own wiki + ADR (see ADR 0002), not assumed in advance.
3. **Business Logic + API + Tests** — service-layer use cases (plain functions/classes) working directly with SQLAlchemy sessions; FastAPI thin routers, status codes, Pydantic schemas, error handling; tests written through the HTTP layer via `TestClient`/`AsyncClient` + `app.dependency_overrides` against a real Postgres test database. This merges the former "Business Logic & TDD" and "API layer" modules: there is no repository layer and no fake-repository unit-test tier.
4. **Middleware & CORS**.
5. **Auth** — real user accounts, JWT vs sessions, cookie HttpOnly vs localStorage; wiki + ADR required before implementation. Design decisions in earlier modules should avoid painting this into a corner (e.g. keep an eye toward an eventual `owner_id`-style relationship on data), without adding it prematurely.
6. **Docker deploy & readiness** — containerizing backend + agent-written frontend, multi-stage Dockerfile, full docker-compose for the stack. Since the eventual goal includes a possible public deployment, this module also covers the standard practices for going from "runs on my machine" to "safely reachable on the internet" (reverse proxy, HTTPS/TLS termination, secrets management, basic hardening) — via wiki + ADR at that point, not decided upfront.

Within each module, prefer a **vertical-slice** feel where possible: even early modules should let the user see how the layers (`api` → `services` → `models`) will eventually connect, rather than studying each layer in total isolation forever.

**Product features are tracked separately** in `docs/ROADMAP.md` (recurring transactions, assets, net worth, allocation). They build on the learning modules and are not part of this fixed list — when a feature needs a non-trivial design decision, it gets its own wiki + ADR like the modules do.

---

## Fixed Technology Choices (not open for reconsideration mid-project)

These are settled platform choices. Topics like JWT-vs-sessions, cookie storage, etc. are deliberately *not* here — they're explored via wiki + ADR at the right module.

### Backend
- **Python**: >= 3.14, managed via `uv`
- **Package manager**: `uv` — always prefix Python commands with `uv run`
- **API framework**: FastAPI
- **Database**: PostgreSQL — **always run via Docker**, never installed locally on the host
- **Migrations**: Alembic
- **Testing**: pytest
- **Linter**: ruff
- **Type checking**: mypy (strict mode, configured in `pyproject.toml`)
- **DB access style**: **synchronous** SQLAlchemy (decided in Module 2, ADR 0002) — not async
- **Environment variables**: managed via a `.env` file in `backend/`, read with `pydantic-settings`

```bash
# Correct
cd backend
uv sync
uv run uvicorn pynance.api.main:app --reload
uv run pytest
uv run ruff check .
uv run mypy .

# Never use bare python or pip
python -m pynance.main   # wrong
pytest                  # wrong
pip install ...         # wrong
```

### Frontend (written by the agent)
- **Node**: LTS version, managed via `nvm` if multiple versions are needed
- **Package manager**: `npm` — never `yarn` or `pnpm`
- **Build tool**: Vite
- **Language**: TypeScript (strict mode)
- **UI**: React 18+, Tailwind CSS, shadcn/ui components
- **Data fetching**: TanStack Query
- **Routing**: React Router
- **Charts**: shadcn/ui Charts (built on Recharts, themed to match Tailwind/shadcn) as default; Tremor as an acceptable alternative for more turnkey dashboards.
- **Environment variables**: managed via a `.env` file in `frontend/`

```bash
cd frontend
npm install
npm run dev
npm run build
npm run lint

# Never use yarn or pnpm in this project
yarn install   # wrong
pnpm install   # wrong
```

No global client-side state library (Redux/Zustand). Application state lives on the server; the frontend only holds local UI state and the TanStack Query cache.

---

## Architecture

The **backend** follows a classic **Layered Architecture** (a.k.a. N-tier): each layer only depends on the layer directly beneath it, and calls flow strictly top-down. There's deliberately no dependency-inversion ceremony here (no ports/adapters, no framework-free "pure domain" layer, no repository pattern) — the goal is straightforward, easy-to-navigate code, not architectural purity for its own sake.

Layers, top to bottom:

1. **Presentation** (`api/` + `schemas/`) — FastAPI routers and Pydantic schemas. Parses and validates input, calls the service layer, shapes the response. Never touches the database directly — no queries, no `db.add/commit`, no business rules. It may reference the SQLAlchemy `Session` only as an injected dependency (`Depends(get_db)`) to hand to a service.
2. **Business logic** (`services/`) — plain Python functions/classes implementing use cases (e.g. "record a transaction", "compute monthly balance"). Framework-free (no FastAPI imports). Works directly with the SQLAlchemy `Session` and model instances as its data — there is no separate repository layer between services and the database (see rationale below).
3. **Models** (`models/`) — SQLAlchemy declarative models. No business logic methods beyond simple derived properties.

Rules that must never be broken:
- Each layer may only call the layer directly below it — no skipping (e.g. `api/` never touches the database; it always goes through `services/`).
- `services/` never imports FastAPI or anything from `api/`.
- `api/` routers contain no business logic and never manipulate the database directly — no SQLAlchemy queries, no `db.add()`/`commit()`, no rules. They may only reference the `Session` as an injected dependency to pass to a service.
- Pydantic schemas (`schemas/`) are the API contract. **Request schemas** (`*Create`/`*Update`) are passed to services as validated input — this is the standard FastAPI pattern. **Response schemas** (`*Response`) are API-only: never used as service input/output, never leak into the database layer. Services return their own plain types (dataclasses for report results), which the API maps to response schemas.
- The **frontend never contains business logic**. It only calls the backend API and renders what it receives. Validation beyond basic UX (e.g. required fields) belongs in `services/`, not in React components.

**Why no separate "domain model" layer:** there's a single persistence technology (Postgres via SQLAlchemy) and no plan to swap it, so the extra indirection of a framework-free domain model buys little — that kind of ceremony pays off in hexagonal architecture but is unnecessary complexity for a layered, single-database app. `services/` works directly with SQLAlchemy model instances; Pydantic schemas remain a separate, necessary layer regardless, because they solve a different problem (the API contract — which fields are accepted on create vs returned on read, not domain purity).

**Why no repository layer:** the repository pattern exists to isolate persistence behind an interface so the database could be swapped or faked. Neither goal applies here: Postgres is the only database, and tests run through the HTTP layer against a real test database (see Testing) — so there are no fake repositories to plug in. A repository layer would therefore be indirection without payoff. The service layer uses the SQLAlchemy `Session` directly, which keeps the architecture honest: business rules live in services, database access happens in services, and the HTTP layer stays thin. This is the mainstream shape of real-world FastAPI applications (see the Architecture section above).

---

## Project Structure

Standard, widely-used monorepo layout for a two-app (backend + frontend) project of this kind:

```
pynance/
├── backend/                # FastAPI app — written by the user
│   └── pynance/
│       ├── api/             # FastAPI routers — presentation layer
│       ├── schemas/         # Pydantic request/response models — API contract
│       ├── services/        # Business logic / use cases
│       └── models/          # SQLAlchemy declarative models
├── frontend/                # Vite + React app — written by the agent
├── docs/
│   ├── wiki/                # theoretical/practical guides, one per topic/module
│   └── adr/                 # Architecture Decision Records
├── docker-compose.yml
└── README.md
```

This top-level `backend/` + `frontend/` + shared root-level config (Docker Compose, README, CI config later) is a common, real-world pattern for small-to-medium full-stack monorepos that don't need a dedicated build-orchestration tool (like Nx or Turborepo) — those add value mainly at larger scale with many packages, which isn't the case here. The four packages under `backend/pynance/` above are fixed from Module 1 onward (as an empty skeleton); their contents fill in module by module.

---

## Frontend ↔ Backend Communication

Standard practice for this kind of setup, in two environments:

- **Development**: two processes run in parallel — the backend (`uv run uvicorn ...`, e.g. port 8000) and the Vite dev server (`npm run dev`, e.g. port 5173), which provides hot-reload. Vite's dev server is configured to proxy `/api/*` requests to the backend, so the browser effectively talks to a single origin and no CORS configuration is needed in dev.
- **Production** (including "runs on my machine" for now): `npm run build` produces a static `frontend/dist/` bundle, and FastAPI serves that directory as static files in addition to its `/api/*` routes. One process, one port, one origin — again no CORS needed.

CORS middleware should not be introduced as a permanent solution — only if this proxy/single-origin setup isn't used for some reason, which should be an explicit, discussed exception rather than a default.

If/when the app moves toward a real public deployment, the standard next steps (reverse proxy, HTTPS/TLS, domain, secrets) are handled in Module 6, via its own wiki + ADR — not decided or assumed here.

---

## Migrations

Database schema changes are managed with **Alembic**. Never modify the schema by hand or run raw `CREATE TABLE` / `ALTER TABLE` statements directly.

- Migration scripts live in `backend/alembic/versions/`.
- Always generate a new revision when a SQLAlchemy model changes, then review the auto-generated script before applying it (autogenerate is not always complete — it can miss index changes, server defaults, etc.).
- Never edit an already-applied migration file — create a new revision instead.
- The Alembic `env.py` must import all SQLAlchemy models from `pynance/models/` before running autogenerate, so the metadata is populated.

```bash
cd backend
uv run alembic revision --autogenerate -m "short description of change"
uv run alembic upgrade head
```

---

## Code Conventions

### Backend
- Follow PEP 8. Line length 100 (ruff config).
- Provide **strict type hints** on every function, method signature, and class variable. No `Any` unless unavoidable; document why when used.
- FastAPI routers must be **thin**: parse/validate via Pydantic schemas, delegate all processing to a service-layer function/class, translate the result into a response schema. Never put business logic in a router function, and never manipulate the database directly in a router (no queries, no `db.add`/`commit`) — the `Session` may be referenced only as an injected dependency passed through to a service.
- SQLAlchemy models use the 2.0 typed style (`Mapped[...]` / `mapped_column`), with pluralized table names and a derived `@property` only where it's a simple, derived value (e.g. `image_path`).
- Packages follow the **facade + `__all__`** convention: one file per domain entity (e.g. `models/category.py`, `models/transaction.py`, `models/types.py`), with the package `__init__.py` re-exporting the public API and declaring `__all__`. Consumers import from the facade (`from pynance.models import Transaction`), never from deep paths. Use absolute imports inside packages; only `__init__.py` imports the leaf modules.
- Pydantic schemas follow the `Base`/`Create`/`Update`/`Response` naming convention, with `ConfigDict(from_attributes=True)` on response schemas.
- **Naming convention for services and endpoints** (applies to all layers — service functions, routers, endpoints, dataclasses, response schemas):
  - **CRUD** on an entity: `create_<entity>` / `get_<entity>` (one by id) / `list_<entities>` (collection) / `update_<entity>` / `delete_<entity>`. Use `list_`, not `get_` plural, for collections. REST endpoints mirror this: `POST/GET/PATCH/DELETE /<entities>`, `GET/PATCH/DELETE /<entities>/{id}`.
  - **Reports** follow the grammar `<metric>[_by_<dimension>]` where `metric` is the report kind and `dimension` an optional breakdown. The metric vocabulary: `summary` (totals for one period), `trend` (totals across periods), `comparison` (two periods side by side). The period is always expressed via query params (`month`/`year`/`start_date`/`end_date`), never in the name or path. Examples: `get_summary`, `get_summary_by_category`, `get_trend`, `get_trend_by_category`, `get_comparison` — endpoints `/summary`, `/summary-by-category`, `/trend`, `/trend-by-category`, `/comparison` (hyphens in URLs, underscores in Python).
  - Report dataclasses and response schemas mirror the same names: `Summary`/`SummaryResponse`, `TrendPoint`/`TrendPointResponse`, `TrendByCategory`/`TrendByCategoryResponse`, `Comparison`/`ComparisonResponse`. Suffix `...Row`/`...RowResponse` for one item of a list result (`SummaryByCategoryRow`). The report's time unit (e.g. `monthly`) belongs in the *data* (`TrendPoint.year/month`), not the name — future granularities (weekly, yearly) keep the same shape.
- Settings are read via `pydantic-settings` (`Settings(BaseSettings)` reading `.env`), with secrets typed as `SecretStr`.
- Prefer composition over inheritance for models and services.
- Specific implementation patterns (exact service signatures, error-handling conventions, etc.) will be worked out and documented as part of the relevant module's wiki + review, rather than mandated here in advance.

---

## Authentication

Real user accounts (not a single shared password) are the target, planned for **Module 5** of the roadmap. No further assumptions or design details are fixed here — they'll be worked out together, via wiki + ADR, when that module comes up. The only thing to keep in mind earlier is not to design data models in a way that would make adding per-user ownership awkward later.

---

## Testing

- Backend: `pytest`, following FastAPI's documented testing approach. Tests exercise the app **through the HTTP layer** with `TestClient` (or `AsyncClient` + `ASGITransport`), against a **real Postgres test database** (a throwaway Postgres via Docker), with `app.dependency_overrides` swapping the real `get_db` dependency for one bound to the test database. TDD (test before implementation) is the preferred style where the exercise allows it.
- The test database schema is created from the SQLAlchemy models (not by running Alembic migrations) — see the Module 3 wiki for the trade-offs. Business logic is tested *through* the API.
- Run a single test: `uv run pytest tests/test_foo.py::test_bar -v`

---

## Specs, Plans, Wiki and ADRs

When implementing features from specs/plans, corrections made during implementation must be reflected in **both** the spec and the plan, keeping them in sync — never left stale. The same applies to `docs/wiki/*.md` and `docs/adr/*.md`: if an exercise or review surfaces a correction to something already documented, update the doc rather than letting it drift from reality.

---

## Boundaries

- **Never delete files** with `rm` or any equivalent command.
- **Never run any `git` command** without asking the user for acceptance first.
- **Never write backend code directly**, except as the explicit "unblock" step in the review loop, or tiny illustrative snippets inside a wiki guide.
- Frontend code may be written directly and completely by the agent.
