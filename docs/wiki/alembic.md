# Alembic Migrations

A general guide to Alembic — the standard migration tool for SQLAlchemy-based
projects. Once an app is live, its schema changes: a new column, a new table, a
renamed field. Alembic manages those changes as versioned, replayable scripts,
so any environment (dev, prod, a fresh clone) can be brought to the exact schema
the code expects. No project-specific assumptions.

---

## Why migrations exist (and why `create_all` isn't enough)

`Base.metadata.create_all(engine)` creates tables that don't exist yet. But it
does **nothing** about tables that *do* exist:

- Add a column to a model → rerun `create_all` → nothing happens. The database
  still has the old shape, and the code queries a column that isn't there.
- Rename a column → `create_all` won't know, won't fix, won't tell you.

Migrations solve this with *history*. Each change is a numbered migration
("revision") describing exactly how to transform the schema (add column X,
create table Y) and how to undo it. Apply them in order and every environment
ends up identical — including environments you haven't created yet.

## The core commands

```bash
alembic revision --autogenerate -m "add items table"
alembic upgrade head
```

- `revision --autogenerate` compares your current models against the database
  and **drafts** a migration script for you.
- `upgrade head` applies all pending revisions up to the latest.

Two crucial caveats about autogenerate:

1. **Always review the generated script before applying it.** Autogenerate is a
   helpful draft, not gospel — it can miss index changes, server defaults,
   renames (it sees a drop + add where you meant a rename), and other things.
2. **Never edit an applied migration.** Once a revision is applied to any
   environment, it's history. Fix forward: write a new revision.

## How it's wired

- `alembic.ini` — the tool's config (where the DB URL comes from, where
  migrations live).
- `alembic/env.py` — the script Alembic runs each time. It's where the URL is
  injected and — critically — where your models must be **imported** so that
  autogenerate can see them. If `env.py` doesn't import your models, Alembic
  sees an empty metadata and generates empty migrations.
- `alembic/versions/` — the migration scripts themselves.

The `env.py` wiring is a classic setup step: it needs to (a) read the database
URL from the same settings source as the app (so migrations and the app agree
on where the DB is), and (b) `import` every model module so `Base.metadata` is
populated.

## The upgrade/downgrade contract

Every migration script has two functions:

```python
def upgrade() -> None:
    # apply the change (e.g. op.create_table, op.add_column)

def downgrade() -> None:
    # undo the change (e.g. op.drop_table, op.drop_column)
```

The contract: `upgrade` then `downgrade` returns the database to its previous
state. Downgrades matter even if you think you'll never use them — they're the
undo button during development and the safety net for bad deploys.

## Trade-offs and alternatives

- **Alembic vs `create_all`**: `create_all` is fine for tests (fresh DB each
  time, current models are the truth) but useless for evolution. Alembic is for
  production-style schema history. Many projects use **both**: `create_all` for
  the test database (fast, always matches current models), Alembic for the real
  database.
- **Alembic vs other migration tools**: Django has built-in migrations; Alembic
  is the standard for SQLAlchemy projects.
- **Autogenerate vs handwritten**: autogenerate for the common case (add table,
  add column) saves time; review and hand-adjust the rest. Pure-handwritten is
  slower and more error-prone; pure-autogenerate is dangerous.

## Pitfalls

- **`env.py` doesn't import your models** → autogenerate produces empty or
  wrong migrations. This is the #1 "it generated nothing" cause.
- **Applying without reviewing** → you inherit autogenerate's mistakes (missing
  `server_default`, missed index, accidental drop+add).
- **Editing an applied migration** → the migration no longer matches what other
  environments ran; `upgrade`/`downgrade` drift apart silently. Fix forward.
- **Forgetting `downgrade`** → a migration you can't undo is a debt you'll pay
  when a bad change ships.

## Minimal illustrative example

The *shape* of a migration (what autogenerate might draft; review before
applying):

```python
revision = "abc123"
down_revision = None  # the previous revision's id


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("categories")
```

`down_revision` chains revisions into history. The first migration has
`down_revision = None`; every later one names its predecessor — that chain is
what lets Alembic know where each environment currently is and what to apply
next.
