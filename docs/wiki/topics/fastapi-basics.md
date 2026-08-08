# FastAPI Basics

A general guide to FastAPI's core concepts: what it is, how routers and
dependencies work, status codes, and how it parses and serializes. No
project-specific assumptions.

---

## What FastAPI is

FastAPI is a Python web framework for building JSON APIs. Its defining
properties:

- **Type-annotation-driven**: you declare what a route expects (a Pydantic
  model for the body, `int` for a path param) and FastAPI parses, validates,
  and documents it for you. No manual JSON parsing.
- **Automatic validation and errors**: invalid input produces a `422
  Unprocessable Entity` response without you writing any code.
- **Automatic OpenAPI docs**: `/docs` (Swagger UI) and `/redoc` are generated
  from your type annotations — the API is self-documenting.
- **Async and sync support**: `def` endpoints run in a threadpool; `async def`
  run on the event loop. Both are valid.

## The core pieces

### The app and the router

```python
from fastapi import FastAPI

app = FastAPI()


@app.get("/health")
def health():
    return {"status": "ok"}
```

An `APIRouter` lets you group related endpoints into a module and attach it to
the app:

```python
from fastapi import APIRouter

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("")
def list_categories(): ...
```

```python
# in the app
app.include_router(categories.router)
```

- `prefix` — every path in this router starts with it.
- `tags` — grouping label for the docs.
- The router is a plain object; the app pulls it in with `include_router`.

### Path and query parameters

FastAPI reads types from the signature:

```python
@router.get("/{item_id}")
def get_item(item_id: int): ...
```

`item_id` is declared `int`, so FastAPI parses it from the URL path and
validates it's an integer. Query parameters are just non-path parameters with
defaults:

```python
@router.get("")
def list_items(skip: int = 0, limit: int = 10): ...
```

`Query(...)` adds constraints:

```python
from fastapi import Query

def list_items(limit: int = Query(ge=1, le=100)):
    ...
```

### Path vs query parameters — how to choose

The general rule: **path = identifies a resource; query = filters or options
for a request.**

- **Path params** (`/items/{item_id}`) pick out *one* specific resource. The
  value is part of the URL structure — it must be something that identifies
  the resource itself (an id).
- **Query params** (`/items?skip=0&limit=10`) *filter or configure* a request
  over a collection or a report: pagination, date ranges, sort order, type
  filters. They're optional knobs, not resource identifiers.

Consequences of the choice:

- Query params are **optional by default** — a parameter without a default is
  required (missing → automatic 422); with a default, the client may omit it.
  Path params are always required (a URL without the segment doesn't match).
- Query params are type-validated automatically: `year: int` rejects
  `?year=abc` with 422; an `Enum` parameter rejects unknown values with 422.
- Query params don't affect route matching, so they can't collide with other
  routes. Path params can (see the static-vs-parameterized pitfall below).
- A *report* endpoint (`/transactions/summary?year=2026&month=8`) uses query
  params for its filters — the report is one logical resource, and year/month
  are filters over it, not identifiers of separate resources.

A useful heuristic: if two URLs with different values "point at the same thing
with different settings", the value belongs in the query string. If they point
at *different things*, it belongs in the path.

### The request body

Declare the body as a Pydantic model — FastAPI parses, validates, and gives you
the instance:

```python
from pydantic import BaseModel


class ItemCreate(BaseModel):
    name: str
    price: float


@router.post("", status_code=201)
def create_item(item: ItemCreate): ...
```

### Responses

Two mechanisms, often used together:

- `response_model=SomeModel` — FastAPI serializes whatever you return into this
  schema (and validates it). Combined with Pydantic's `from_attributes=True`,
  you can return a SQLAlchemy model and FastAPI shapes it.
- `status_code` — the HTTP status for success. Common choices: `200` (default),
  `201` (created), `204` (no content), `404`, `422`, `500`.

## Dependencies

`Depends(...)` is FastAPI's dependency injection. A function declared as a
parameter via `Depends` runs before the endpoint and its return value is passed
in:

```python
from fastapi import Depends


def get_db():
    db = setup()
    try:
        yield db
    finally:
        cleanup(db)


@router.get("")
def list_items(db: Session = Depends(get_db)): ...
```

A dependency can be a **generator** (`yield`) — the code before `yield` runs at
request start, the code after runs when the request finishes. That's the
standard way to manage resources with a per-request lifetime (like a database
session).

Dependencies compose: a dependency can itself depend on other dependencies.
FastAPI builds the whole tree and resolves each once per request.

## Errors

`HTTPException` is the way to signal a failure response:

```python
from fastapi import HTTPException, status

raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
```

Validation errors (bad body, wrong types) produce `422` automatically. The
`detail` field becomes the JSON body's `detail`.

## The request/response lifecycle

1. Request arrives.
2. FastAPI resolves dependencies (running generator dependencies from start to
   their `yield`).
3. It parses and validates path/query/body parameters from the signature.
4. The endpoint function runs, returning a value (or raising).
5. FastAPI serializes the return value into `response_model`.
6. Generator dependencies' cleanup code (after `yield`) runs.

## Pitfalls

- **Forgetting `status_code=201`** on creates → you get a default 200, which is
  wrong for resource creation.
- **Blocking calls in `async def` endpoints** — if you use async, a sync DB
  call blocks the whole event loop. Prefer sync `def` endpoints with a sync
  session, or go all-in on async consistently.
- **Returning ORM objects without a response model** → FastAPI can serialize
  them, but without `response_model`/`from_attributes` you lose the shape
  control (and risk leaking fields). Always declare `response_model`.
- **Deep module paths** — keep routers thin and put the real work in services;
  a router full of logic becomes unmaintainable.
- **Static routes before parameterized ones** — if `/{item_id}` is declared
  before `/summary`, a request to `/summary` is captured by `/{item_id}` and
  fails int parsing (422). FastAPI matches in declaration order; declare
  static paths first.
- **`204 No Content` must not have a body** — combining `response_model` with
  `status_code=204` raises an assertion error at startup. A 204 route returns
  `None` and has no response model.
- **`response_model` vs the return annotation** — the return annotation is for
  mypy/readers; `response_model` is what FastAPI actually serializes. If they
  disagree (e.g. annotation is an ORM model, model is a schema), the response
  model wins. Keep them consistent.
