# SQLAlchemy 2.0 Models

A general guide to SQLAlchemy — the Python ORM (Object-Relational Mapper) that
lets you work with a database through Python classes instead of raw SQL. Covers
the SQLAlchemy 2.0 typed declarative style (`Mapped[...]` / `mapped_column`) and
the philosophy of what models should and shouldn't contain. No project-specific
assumptions.

---

## What an ORM does, in one sentence

An ORM maps a Python class to a database table and its instances to rows, so you
can write `session.add(item); session.commit()` instead of
`INSERT INTO items ...`. You think in Python objects; SQLAlchemy speaks SQL.

## The 2.0 style: `Mapped` and `mapped_column`

SQLAlchemy 2.0 modernized model declarations to be type-annotation-first. The
two pieces you'll see on every model:

- **`Mapped[T]`** — the *type* of the attribute, written as an annotation:
  `Mapped[int]`, `Mapped[str | None]`. It tells type checkers and SQLAlchemy the
  attribute's Python type.
- **`mapped_column(...)`** — the *column* configuration: database type,
  constraints, defaults. It's where "this is the primary key", "unique", "not
  null" live.

A minimal model in 2.0 style:

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

Reading it: `categories` table, `id` integer primary key, `name` varchar(100)
unique. Both the type checker and the database agree on what each attribute is.

## Things worth knowing

- **Table name** — always explicit via `__tablename__`, usually pluralized
  (`transactions`, `categories`). Never rely on an auto-generated name.
- **Nullability follows the annotation.** `Mapped[str]` = `NOT NULL`;
  `Mapped[str | None]` = nullable. This is the 2.0 design: the annotation is
  the source of truth.
- **`datetime`** — for timezone-aware columns use `DateTime(timezone=True)` and
  default from `datetime.now(UTC)`, never naive local time.
- **Integer PKs** — `id: Mapped[int] = mapped_column(primary_key=True)`. The
  auto-incrementing behavior comes from the database, which is exactly what
  `create_all`/migrations will generate.
- **Foreign keys and relationships** — a `ForeignKey("table.column")` sets the
  database-level constraint; a `relationship()` gives you the Python-level
  navigation (`item.category`). They're separate concepts that work together.
  Example *shape*:

```python
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    category: Mapped[Category | None] = relationship()
```

- **`__init__`** — you don't write one. SQLAlchemy gives every model a
  constructor that accepts keyword arguments for the mapped columns:
  `Item(name=..., category_id=...)`.

## Models are dumb data holders (the philosophy)

A widely-used convention: **no business logic methods on models beyond simple
derived properties.**

A model's job is to *represent* a row, not to *behave* like a business object.
So:

- ✅ allowed: a simple derived `@property`, e.g. a display path computed from
  other fields.
- ❌ not recommended: validation rules, cross-entity computation, "can this be
  deleted" checks.

Why? The model is an *implementation detail of persistence*, not the heart of
the domain:

1. **Business rules belong in a service layer**, where they can be tested and
   reused independent of the database.
2. **A fat model and a thin service** is how logic duplication creeps in: once
   rules live on the model, the service becomes a pass-through and the rules
   end up tested nowhere and duplicated everywhere.
3. It keeps the model **portable**: if you ever migrate away from SQLAlchemy
   (or serialize a model to a schema), you move pure data, not behavior you
   have to untangle.

Every time you're tempted to add a method to a model, ask: "is this a *computed
field*, or *business logic*?" If it's the latter, it belongs elsewhere.

## Creating the schema

SQLAlchemy models don't create tables by themselves. Two options:

- **`Base.metadata.create_all(engine)`** — creates all tables matching the
  current models. Fast and great for tests, but it doesn't track history:
  change a model and rerun, and it won't alter existing tables.
- **Migrations (Alembic)** — the production answer. Records every schema change
  as a versioned script you can apply, roll back, and replay.

## Pitfalls

- **Forgetting `__tablename__`** → SQLAlchemy infers a table name, which is
  never what you want (often the class name, uncased). Always set it.
- **Nullable annotation vs `mapped_column(nullable=...)`** — in 2.0,
  `Mapped[str]` already means NOT NULL. Don't fight it with redundant
  `nullable=False`; write the annotation correctly and use `mapped_column`'s
  explicit `nullable=` only for the rare cases that differ.
- **`default=` vs `server_default=`** — `default=` is applied by SQLAlchemy
  when you insert; `server_default=` is baked into the DDL so the *database*
  applies it. For values like `datetime.now(UTC)` you usually want Python-side
  `default=lambda: datetime.now(UTC)` (works in `create_all`, tests, and
  migrations). Understand the difference rather than picking one blindly.
- **`Mapped[list[Model]]` relationships** — relationships have cascade
  semantics that are easy to get wrong (deleting a parent shouldn't orphan or
  delete children unintentionally). Start with the simplest relationship that
  works and revisit cascades only when you need them.
- **Mutable defaults** — never `default=[]` on a relationship or column;
  it's shared across instances.

## Python mastery tie-in

The 2.0 `Mapped[...]` syntax is built on Python **descriptors**.
`mapped_column(...)` returns an object that implements `__set_name__`, `__get__`,
and `__set__` — exactly the descriptor protocol — which is how SQLAlchemy
intercepts attribute access on model instances. See the `descriptors.md` note
for what that means.
