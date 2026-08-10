# Module 3 — Business Logic + API + Tests

Module 2 gave us a database, models, and migrations. Module 3 makes the app
actually *do something*: it adds the **service layer** (business rules), the
**HTTP API** (FastAPI routers + Pydantic schemas), and **tests that exercise the
whole thing through the HTTP layer** against a real test database. By the end
you'll have a working JSON API for categories and transactions, with a test
suite proving it works.

This file is self-contained. The `topics/` folder holds optional general
deep-dives (FastAPI, Pydantic, generators) that go further — a bonus, not
required.

---

## The three layers, and how they fit

```
HTTP request
   ↓
api/       routers: parse input → call service → shape response. No business logic.
   ↓
services/  use cases: business rules + the SQLAlchemy Session. The only logic home.
   ↓
models/    ORM definitions (dumb data holders, from Module 2)
   ↓
Postgres
```

Remember the Module 2 rules, now enforced for real:

- **`services/` never imports FastAPI.** It's plain Python: functions/classes
  that take a `Session` (and maybe arguments) and return models/values. It
  raises *domain exceptions* (plain Python exceptions) when a rule is violated.
- **`api/` never touches the database.** Routers only: validate via Pydantic
  schema, call a service, translate the result into a response schema, and
  translate domain exceptions into HTTP status codes.
- **Models stay dumb.** All behavior — "record a transaction", "compute the
  monthly balance" — lives in services.

---

## 1. The service layer

A service is a plain Python function (or a small class grouping related
functions) implementing one use case. It receives the `Session` it needs plus
its inputs, applies the business rules, and returns the result.

### The shape

```python
def create_transaction(
    db: Session, *, transaction: TransactionCreate
) -> Transaction: ...
```

Conventions:

- **Framework-free**: no FastAPI imports, no HTTP concepts. The same function
  could be called from a CLI script, a test, or a background job.
- **Takes the `Session` as a parameter.** The session is a dependency the API
  provides; the service just uses it. That keeps the service testable and the
  session lifecycle owned by the API layer's `get_db`.
- **Domain exceptions for failures.** When a rule is violated — category
  doesn't exist, type mismatch — the service raises a plain exception the API
  layer knows how to map:

```python
class CategoryNotFoundError(Exception):
    pass


class TransactionTypeMismatchError(Exception):
    pass
```

The service doesn't know HTTP exists. It just says "this failed" in domain
terms.

### A real rule to implement

Your domain has a genuine invariant worth implementing and testing: **a
transaction's `transaction_type` is *derived from* its category's
`transaction_type`** — the category is the single source of truth, and the
transaction computes its type through the FK (see ADR 0003). The strongest
form of this rule is structural: the type is never stored on the transaction,
so a mismatched pair is unrepresentable — no service check can drift.

How this came to be: an earlier design stored `transaction_type` on both
entities with a service-level "must match" invariant. A bug surfaced when
retyping a category left its transactions with the old type — the classic
update anomaly of a denormalized duplicate. The fix was to derive rather than
sync: remove the column, keep one source of truth.

### Returning results

Services return either a model instance (to be shaped by the API) or a plain
value for reports (e.g. a dict or a small dataclass of totals). For computed
reports, return simple, typed data — not ORM models pretending to be report
rows.

### Why exceptions (not None, not HTTP)

- Returning `None` for "not found" works but makes the API layer guess: is
  `None` a 404 or a valid empty result? Exceptions are explicit.
- Raising `HTTPException` from a service would import FastAPI into the business
  layer — the exact coupling we forbid. Domain exceptions keep the boundary
  clean.

---

## 2. Pydantic schemas — the API contract

Schemas define *what the API accepts and returns*. There are two kinds with
different roles — don't conflate them:

- **Request schemas** (`*Create`/`*Update`) — validated *input* to services.
  Passing them to service functions (`create_transaction(db, transaction:
  TransactionCreate)`) is the standard FastAPI pattern: the schema is validated
  at the HTTP boundary, then handed to the service as an already-validated,
  typed value object.
- **Response schemas** (`*Response`) — API-only *output*. They shape what the
  client sees and are never used as service input/output.

The service layer works with SQLAlchemy models (and its own dataclasses for
report results); response schemas are the HTTP boundary.

### Naming convention

`Base`/`Create`/`Update`/`Response`, per AGENTS.md:

```python
from pydantic import BaseModel, ConfigDict, Field


class CategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class CategoryCreate(CategoryBase):
    pass


class CategoryResponse(CategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
```

### `from_attributes=True` — the key to shaping ORM results

Response schemas carry `model_config = ConfigDict(from_attributes=True)`. This
lets FastAPI build a schema **from a SQLAlchemy model instance** directly —
reading attributes off the model by name. It's the bridge between "the service
returns a `Transaction`" and "the API returns a `TransactionResponse`".

```python
return CategoryResponse.model_validate(category)  # category is a SQLAlchemy model
```

### Validation

`Field(...)` gives you cheap, declarative input validation: lengths, ranges,
regexes. This is *shape* validation (is the field present, the right type, the
right size) — it belongs on the schema. **Business rules** (the type-mismatch
invariant) belong in services, not in schemas.

### Money in schemas

Amounts are `Decimal` (ADR 0001). Pydantic v2 handles `Decimal` natively:

```python
from decimal import Decimal


class TransactionCreate(BaseModel):
    amount: Decimal = Field(gt=0)
```

`Field(gt=0)` enforces "positive amount" at the boundary — a good use of schema
validation (it's a shape rule, not a cross-entity rule).

### What would actually be wrong

To sharpen the boundary, these are the *real* violations to avoid:

- **Leaking schemas into the database layer** — passing a Pydantic schema to a
  model constructor or into a query (e.g. `Transaction(**create.model_dump())`
  is fine *in a service*, but `db.add(CategoryCreate(...))` or storing schemas
  in models is not). The API contract never becomes persistence data.
- **Using a response schema as service input or output** — e.g. `get_summary`
  returning a `SummaryResponse`, or a service accepting a `*Response` as an
  argument. Services return their own plain types (dataclasses for reports);
  the API maps them to response schemas at the boundary.
- **Services depending on FastAPI itself** — importing HTTP concepts
  (`HTTPException`, `Request`) into `services/`. Pydantic is fine (it's a
  validation library, not a web framework); FastAPI is not.

These are the boundaries that keep services reusable, testable, and
transport-independent — request schemas in, plain types out, no framework in
the middle.

---

## 3. FastAPI routers — thin by construction

A router is an `APIRouter` with endpoint functions. Each endpoint is three
steps: parse/validate (automatic via the Pydantic type annotation), call the
service, shape the response.

### The shape

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from pynance import services
from pynance.database import get_db
from pynance.schemas import CategoryCreate, CategoryResponse

router = APIRouter(prefix="/categories", tags=["categories"])


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    category: CategoryCreate,
    db: Session = Depends(get_db),
):
    created = services.create_category(db, category=category)
    return CategoryResponse.model_validate(created)
```

What's happening:

- `category: CategoryCreate` → FastAPI parses the JSON body and validates it.
- `db: Session = Depends(get_db)` → the session is injected per-request.
- `status_code=201` → correct for resource creation.
- `response_model=CategoryResponse` → FastAPI serializes the returned object
  into the schema (and validates it).

### Error translation — the one piece of logic routers own

Domain exceptions from services become HTTP errors *here*, in the API layer.
This is the accepted exception: routers translate, they don't invent rules.

```python
try:
    created = services.create_transaction(db, transaction=transaction)
except services.CategoryNotFoundError:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="Category not found"
    )
except services.TransactionTypeMismatchError:
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="...")
```

A `raise` inside an `except` block **re-raises** — that's the standard FastAPI
pattern for turning domain failures into HTTP responses.

### CRUD endpoint conventions

| Operation | Method | Path | Status |
|---|---|---|---|
| Create | `POST` | `/categories` | 201 |
| List | `GET` | `/categories` | 200 |
| Create | `POST` | `/transactions` | 201 |
| Get one | `GET` | `/transactions/{id}` | 200 |
| List | `GET` | `/transactions` | 200 |
| Update | `PATCH` | `/transactions/{id}` | 200 |
| Delete | `DELETE` | `/transactions/{id}` | 204 |

- `PATCH` (partial update) vs `PUT` (full replace): for partial edits use
  `PATCH` with an `Update` schema whose fields are optional. The service applies
  `model_dump(exclude_unset=True)` to touch only provided fields.
- `204 No Content` for delete — no response body.

### Reports as endpoints

Report use cases (monthly income vs expense, spending by category) are services
that compute and return plain typed data; the router just returns it. They use
the `date` column, filtering by year/month, and SQLAlchemy aggregation
(`func.sum`, grouping by category).

---

## 4. Wiring the app together

`database.py` needs the full session setup from Module 2's wiki (engine,
sessionmaker, `get_db`). The `get_db` dependency is a generator — it creates a
session per request and closes it afterward (see `topics/generators.md` for the
Python behind the `yield`).

`api/` needs a `main.py` (or similar) that creates the `FastAPI()` app,
includes the routers, and is the module uvicorn runs.

---

## 5. Testing through the HTTP layer

This is the testing approach we chose (ADR 0001's replacement for the
repository-fake strategy): **test the whole app through HTTP, against a real
Postgres test database.**

### The pattern

- `TestClient` (from `fastapi.testclient`) wraps the app; requests go through
  the full stack — routing, schemas, services, models, real SQL.
- The test database is a **separate Postgres database** (same Docker server).
- `app.dependency_overrides[get_db]` replaces the app's session dependency with
  one bound to the test database — FastAPI's documented seam for swapping
  dependencies in tests.
- Schema comes from `Base.metadata.create_all` (fast, always matches current
  models — see Module 2 wiki for the trade-off vs running migrations).

### Test structure (conftest)

`tests/conftest.py` holds the fixtures:

- A test engine bound to the test database URL.
- A session-scoped fixture that creates the schema once.
- A `db_session` fixture giving a clean session per test (truncate tables
  between tests to isolate them).
- A `client` fixture that installs `dependency_overrides[get_db]` and yields a
  `TestClient`.
- Helper functions to create categories/transactions via the API, so tests
  don't repeat setup.

### What a test looks like

```python
def test_create_transaction(client, db_session):
    category = create_test_category(client, "groceries", "EXPENSE")
    response = client.post(
        "/transactions",
        json={"amount": "12.34", "category_id": category["id"], ...},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["amount"] == "12.34"
```

Notice: tests go through the API (`client.post(...)`), and they assert on the
HTTP response (status code + body). Business rules are tested through the
behavior they produce.

### Test isolation

Between tests, clean the data (delete rows or truncate tables) so tests don't
depend on each other's state. `db_session` + a cleanup step in the fixture is
the standard approach.

### What to test (the failure modes)

- Happy paths: create, read, update, delete, reports return correct data.
- **The derived-type behavior**: create a transaction via an income category,
  retype the category to expense, assert the transaction's *reported* type
  follows — the regression test for the drift bug (ADR 0003).
- Not-found: get/update/delete on a nonexistent id → 404.
- Validation: missing/empty fields → 422.
- Report correctness: seed a few transactions, assert the totals.

---

## 6. Errors in detail — the status code map

| Domain situation | Service raises | API returns |
|---|---|---|
| Category/transaction not found | `CategoryNotFoundError` / `TransactionNotFoundError` | 404 |
| Missing/invalid input shape | (not raised — Pydantic handles it) | 422 |
| Everything OK | — | 200/201/204 |

Pydantic validation failures (bad body) become 422 automatically — you don't
write code for those. Your code handles the *domain* failures. (There is no
"type mismatch" row: since ADR 0003, the type is derived from the category, so
a mismatch is structurally impossible.)

---

## Python mastery tie-in: generators

`get_db` is a generator function (it uses `yield`). FastAPI's dependency
injection relies on this: the code before `yield` runs at request start, the
code after runs at request end (cleanup). Generators are the Python feature
that makes this pattern work. `topics/generators.md` explains what's actually
happening.

---

## Lessons learned implementing this module

Real problems hit while building the API — each one maps to a review comment.

### 1. `get_db` must not commit — and needs `expire_on_commit=False`

A first version committed inside `get_db` (after `yield`). Two problems: the
commit runs *after* FastAPI serializes the response, so `id`/`created_at` came
back `null`; and `expire_on_commit` defaults to `True`, causing surprise
re-queries. Fixes: `get_db` is pure setup/teardown (services commit +
`refresh`), and `sessionmaker(..., expire_on_commit=False)`.

### 2. Field names can shadow their own type annotation

```python
class TransactionUpdate(BaseModel):
    date: date | None = None   # CRASH
```

The field name `date` binds to `None` (the default) in the class namespace
*before* the annotation is evaluated, so `date | None` evaluates as `None |
None` → `TypeError` at import (Python 3.14's lazy annotation evaluation).
Renamed to `occurred_on` — which is also better domain naming. Rule: never name
a field after a type you also import.

### 3. A rename in the schema needs a migration — and the migration needs review

Renaming `date` → `occurred_on` in the model without migrating = `INSERT` fails
("column occurred_on does not exist"). Autogenerate then misread the rename as
drop+add (data-destroying) and added an unnamed constraint. The review-before-
apply habit from Module 2 paid off: the correct migration used
`op.alter_column(..., new_column_name=...)` and a named constraint.

### 4. Partial updates must use *effective* values

The update re-check initially compared `update.category_id !=
transaction.category_id` — but an unset field is `None`, so `None != 3` is
always `True`, falsely triggering the invariant check on every amount-only
patch (→ spurious 404). Fix: compute the effective values first (provided
field, else current value), then compare and re-validate *those*.

### 5. `DELETE` → 204 means no response body

FastAPI asserts `Status code 204 must not have a response body` — you can't
combine `response_model` with 204. The route returns `None`, no response model.
The *why*: 204 semantically means "nothing to send back" — after a delete there
is no resource to represent (see `topics/fastapi-basics.md` for the full
status-code/body semantics).

### 6. Route ordering: static paths before parameterized ones

`GET /summary` declared after `GET /{transaction_id}` gets swallowed by the
`{transaction_id}` matcher (→ 422 "value is not a valid integer"). Declare
static routes before parameterized ones.

### 7. `response_model` must be the *Response* schema, not *Create*

`response_model=TransactionCreate` would strip `id`/`created_at` from the
response. Output schemas are `*Response`; input schemas are `*Create`/`*Update`.

### 8. Reports return named dataclasses, not tuples

`tuple[Decimal, Decimal]` is unlabeled ("which is income?"). A small frozen
dataclass (`Summary(income, expense)`) is self-documenting and maps
cleanly to the response schema. The by-category report returns a list of such
rows.

### 9. Query gotchas: no Python `and`, `group_by` required

- `and`/`or` keywords don't build SQL conditions — pass conditions as separate
  `.where()` arguments (implicit AND).
- Selecting a column + `func.sum` requires `.group_by()` — Postgres rejects
  the ungrouped aggregate.
- Result rows unpack as tuples; `.scalar_one_or_none()` for lookups,
  `.scalars().all()` for lists.

### 10. `StrEnum` values are lowercase

`TransactionType(StrEnum)` with `auto()` yields values `"income"`/`"expense"` —
Pydantic validates against the *value*, so JSON clients must send lowercase,
not `"EXPENSE"`. (Test payloads included.)

### 11. Path params identify resources; query params filter

The report endpoints take `year`/`month` (and `transaction_type`) as **query
params**, not path segments: they filter one logical resource (a report), they
don't identify separate resources. Query params are type-validated
automatically (`?month=bad` → 422, `?transaction_type=bogus` → 422 via the
enum), can be required or defaulted, and — unlike path params — can't collide
with other routes. Full reasoning in `topics/fastapi-basics.md` ("Path vs
query parameters").

### 12. FK integrity: the DB constraint is the enforcer, the service is the messenger

Deleting a category that transactions reference raises the question: where is
the integrity rule enforced? The answer is **both layers, two different jobs**:

- **The database is the hard guarantee.** A `ForeignKey` with no `ondelete`
  defaults to `ON DELETE NO ACTION`: Postgres *refuses* the delete itself,
  atomically and race-free. This was already in place — the model needed no
  change for safety.
- **The service check is the UX layer.** It turns the raw DB `IntegrityError`
  (which would surface as a 500 with internals leaking) into a clean 409 with a
  human-readable message.

**Pre-check vs EAFP (Easier to Ask Forgiveness than Permission):**

- A service *pre-check* ("does any transaction reference this category?") has a
  **race condition**: between the check and the delete, another request can
  insert a referencing transaction. The DB constraint is the only thing that
  closes that window.
- The EAFP shape deletes directly and translates the `IntegrityError`:

```python
db.delete(category)
try:
    db.commit()
except IntegrityError as e:
    db.rollback()
    raise CategoryHasTransactionsError(...) from e
```

This is safe *because* the constraint exists — EAFP is not an alternative to
the DB constraint, it's what makes the constraint usable. Keep both: the
constraint is the enforcer, the exception handler is the polite messenger.
The pre-check's job (distinguishing "doesn't exist" → 404 from "has
transactions" → 409) stays as the existence check before the delete.

**When EAFP is wrong:** if multiple constraints could fire on the same
statement, a bare `IntegrityError` is ambiguous. It's only safe to translate
unconditionally when the constraint set is unambiguous (here, transactions is
the only FK pointing at categories).

### 13. Query filters as a value object

When a list endpoint grows optional filters (`year`, `month`, `q`,
`transaction_type`, `category_id`), pass them to the service as **one
dataclass**, not as a growing list of positional parameters:

```python
@dataclass
class TransactionFilters:
    q: str | None = None
    year: int | None = None
    month: int | None = None
    transaction_type: TransactionType | None = None
    category_id: int | None = None
```

The service builds the query by appending conditions only for the filters that
are set:

```python
conditions: list[ColumnElement[bool]] = []
if filters.q:
    conditions.append(Transaction.description.ilike(f"%{filters.q}%"))
if filters.category_id:
    conditions.append(Transaction.category_id == filters.category_id)
# ...
query = select(Transaction).where(*conditions).order_by(...)
```

Why this pays off:

- **The filter set is the contract** — one value object names all the ways a
  list can be filtered; adding a filter means adding one field, not changing
  every call site.
- **Composable conditions** — `.where(*conditions)` with an empty list is a
  valid "no filter" query; no special-casing the unfiltered path.
- **Consistent with the reports** — `DataRange` for trends, `TransactionFilters`
  for lists: compound inputs are value objects, not parameter lists.
- **Validation lives in the service** — e.g. "month without year" is a domain
  rule: `raise MonthWithoutYearError` in the service, translated to 400 in the
  router. (Note: `if filters.month:` alone can't build a range without a year —
  the rule must be explicit.)

Naming note (lesson 11's rule, applied to filters): query params are short and
semantic (`q`, not `description_str` — the Python type never belongs in the API
contract). The period stays out of names: `year`/`month` are params, and when
both are present the service builds the `>= first day, < first day of next
month` range — the same date-range pattern used everywhere else.

### 14. Test the boundary cases — the "passed by luck" trap

The comparison endpoint (`current` vs `previous` month) had a subtle bug:

```python
previous_year = current_year - 1          # ← ALWAYS decremented
previous_month = 12 if current_month == 1 else current_month - 1
```

The year was decremented unconditionally, so comparing August 2026 looked up
**July 2025**. The test suite *had* a January-rollover test — and it passed!
Because for January the unconditional `-1` happens to be correct. The bug only
surfaced when a **non-January** comparison test was added.

Two lessons:

- **A test that passes is not proof of correctness** — it's proof only of the
  cases it exercises. The January test passed "by luck" because the buggy line
  coincided with the correct behavior for that specific input.
- **Test the boundary *and* the middle.** Boundary cases (January→December
  rollover) are essential, but they can mask bugs that only appear away from
  the boundary. A table of representative cases — January, a mid-year month,
  December — covers both.

This is the "assert the outcome, not the steps" principle from the pytest
topic applied to date math: the outcome for August is what caught it, not the
code path.

### 15. Derived data: normalize, don't sync

The drift bug (lesson 14's cousin) taught a schema lesson: when a value is
*derivable* from another value through a foreign key, storing both copies is a
**denormalized duplicate** — and every duplicate must be kept in sync by
application code, which means one day a sync path will be forgotten.

The fix wasn't more sync code; it was **removing the duplicate** (ADR 0003):

- `transaction_type` is stored only on `Category`.
- `Transaction` exposes it as a derived `@property` reading
  `self.category.transaction_type` through a `relationship()`.
- The API read contract is unchanged (`TransactionResponse` still has the
  field, populated from the property); the write contract drops it (the client
  picks a category, the type follows).
- Reports group by `categories.transaction_type` via a join.

The payoff: the mismatch is now **structurally unrepresentable** — no service
check, no exception, no 422, no drift possible. Retyping a category
reclassifies its transactions automatically (accepted deliberately for this
app; an audited ledger would instead keep the type as an immutable snapshot).

Three general lessons:

- **"Keep it in sync" is a design smell.** If a value is derivable, derive it —
  sync code is where consistency bugs hide.
- **Schema-enforced rules beat code-enforced rules.** A constraint or a
  missing-column impossibility is stronger than any service check, because it
  can't be forgotten.
- **Properties over relationships hide cost.** The derived `@property` looks
  like a plain field but lazy-loads the category on every access — a list of
  transactions now does N+1 queries (see `topics/n-plus-one.md`). The fix is
  eager loading (`selectinload`), not changing the design.

---

## Optional deeper reading

The `topics/` folder contains general, standalone deep-dives — a bonus, not
required. New this module:

- `topics/fastapi-basics.md` — routers, dependencies, status codes, response
  lifecycle.
- `topics/pydantic-schemas.md` — v2 validation, `from_attributes`,
  Base/Create/Update/Response.
- `topics/sqlalchemy-sessions.md` — the engine/sessionmaker/Session stack,
  flush/commit/refresh, `expire_on_commit`, and the `get_db` pattern.
- `topics/n-plus-one.md` — lazy loading, the N+1 problem, `selectinload`/eager
  loading, and how to spot it in the query log. (Triggered by the derived
  `transaction_type` property, ADR 0003.)
- `topics/pytest-basics.md` — discovery, fixtures (incl. the `yield` form and
  scopes), `parametrize`, `conftest.py`, running tests, and what makes tests
  good.
- `topics/generators.md` — Python mastery: how `yield` and the `get_db`
  pattern work.

(From Module 2: `topics/docker-basics.md`, `topics/sqlalchemy-models.md`,
`topics/alembic.md`, `topics/pydantic-settings.md`, `topics/sync-vs-async.md`,
`topics/descriptors.md`.)

---

## What to do on your own (the exercise)

1. **`database.py`** — add the sync engine, sessionmaker (`expire_on_commit=False`),
   and `get_db` dependency from the Module 2 wiki.
2. **Schemas** (`schemas/`) — `CategoryCreate`/`CategoryResponse`,
   `TransactionCreate`/`TransactionUpdate`/`TransactionResponse`, plus response
   schemas for the two reports. Follow the `Base`/`Create`/`Update`/`Response`
   naming with `from_attributes=True` on responses. Money as `Decimal`.
   **Field naming trap**: name the transaction's date field `occurred_on` — a
   field named `date` shadows the `date` type in its own annotation and crashes
   at import (lesson 2 below).
3. **Services** (`services/`) — plain functions taking `db: Session`:
   - categories: create, list
   - transactions: create, get, list, update, delete
   - reports: monthly income-vs-expense, monthly spending by category
   - domain exceptions for not-found and type-mismatch
4. **API** (`api/`) — a `main.py` app + routers for `/categories` and
   `/transactions` (including the report endpoints), thin, with the error
   translation from services.
5. **Tests** (`tests/`) — `conftest.py` with the test-DB fixtures and
   `dependency_overrides`, then tests covering happy paths, the type-mismatch
   invariant, 404s, 422s, and report correctness.

Keep the pipeline green: `uv run ruff check .`, `uv run mypy .`, `uv run pytest`.

When done, send me your code and I'll review it.
