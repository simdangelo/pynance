# Pydantic v2 — Schemas and Validation

A general guide to Pydantic v2, the data validation library FastAPI builds on.
Pydantic defines *schemas*: typed models that validate incoming data and shape
outgoing data. No project-specific assumptions.

---

## What Pydantic does

Pydantic turns a plain class declaration into a **validator**: when you
construct an instance from untrusted input, it checks every field against its
type annotation and converts/coerces where sensible.

```python
from pydantic import BaseModel


class Item(BaseModel):
    name: str
    quantity: int


item = Item(name="book", quantity="3")  # "3" is coerced to int 3
```

- Wrong type that can't coerce → `ValidationError`.
- Extra fields are ignored by default (v2), unknown fields error only if you
  opt in.
- Missing required fields error immediately.

## Key features

### Field constraints

`Field(...)` adds declarative rules:

```python
from pydantic import BaseModel, Field


class Item(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    quantity: int = Field(ge=0, le=1000)
    tags: list[str] = Field(default_factory=list)
```

Constraints live in the annotation layer, validated at construction.

### `model_dump` and `model_validate`

- `model_dump()` → dict of the data.
- `model_dump(exclude_unset=True)` → only the fields the caller actually
  provided. This is the standard trick for partial updates: you know *what
  changed*, so you only write those fields.
- `model_validate(obj)` → build a model from an existing object. When the model
  has `from_attributes=True`, this works on arbitrary objects by reading
  attributes — the bridge between an ORM model and a response schema.

### `from_attributes` — reading from arbitrary objects

```python
from pydantic import BaseModel, ConfigDict


class ItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
```

Now `ItemResponse.model_validate(some_orm_object)` reads `.id` and `.name` off
it. This is how FastAPI APIs shape database results into JSON: the response
schema is the contract, the ORM object is the source, and `model_validate` is
the seam.

### Strictness and coercion

Pydantic v2 coerces by default: `"3"` → `3`, `True` → `1`. Usually that's
helpful at an API boundary (JSON numbers may arrive as strings), but it can hide
bugs. Use `Field(strict=True)` (or a strict config) where coercion would be
dangerous — e.g. you never want a string silently accepted where an int belongs.

## Schema design conventions

### Base/Create/Update/Response

A widely-used pattern:

```python
class ItemBase(BaseModel):
    name: str


class ItemCreate(ItemBase):
    pass


class ItemUpdate(BaseModel):
    name: str | None = None  # partial update: every field optional


class ItemResponse(ItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
```

- `Base` — the shared fields.
- `Create` — what the API accepts when creating (may add fields like a
  password, never a server-assigned `id`).
- `Update` — everything optional (partial updates).
- `Response` — what the API returns (includes server-assigned fields like `id`,
  `created_at`), with `from_attributes=True`.

This keeps *accepted* fields separate from *returned* fields — the classic
"don't let clients set their own id/created_at" protection.

### One schema file per concern

Group schemas by domain entity (e.g. `schemas/category.py`,
`schemas/transaction.py`), with the package `__init__.py` as a facade
re-exporting the public set — the same facade convention as models.

## Pitfalls

- **No `from_attributes` on a response schema** → `model_validate(orm_object)`
  fails; you'd have to build dicts by hand everywhere.
- **Reusing `Create` as `Response`** → clients can set fields they shouldn't
  (id, timestamps), and you leak server internals. Separate the schemas.
- **Mutating a `BaseModel` thinking it validates on every change** — Pydantic
  validates at construction, not on attribute assignment. Changing
  `item.name = 123` later isn't re-validated (unless you use `validate_assignment`).
- **Mutable defaults** — `Field(default=[])` shares one list across instances.
  Use `Field(default_factory=list)`.
- **`Decimal` precision** — build money `Decimal`s from strings
  (`Decimal("12.34")`), never floats, or you reintroduce the float bug at the
  boundary.
- **A field name shadowing its own type annotation** — with lazy annotation
  evaluation (PEP 649, Python 3.14), a field named like a type it uses breaks:
  `date: date | None = None` evaluates `None | None` (the default binds the
  name before the annotation is evaluated) → `TypeError` at import. Don't name
  fields after types you import (`date`, `type`, `id` if `id()` is needed...).
- **`StrEnum` values vs names** — `StrEnum` members have *values* that may
  differ from their names (`auto()` produces lowercase values). Pydantic
  validates against the **value**, so JSON must send `"expense"`, not
  `"EXPENSE"`. When in doubt, check `MyEnum.__members__` or the values.
