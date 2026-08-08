# SQLAlchemy Sessions and Database Connections — a proper setup

A general guide to the SQLAlchemy session/engine stack and how to wire it into a
web application correctly. Covers `engine`, `sessionmaker`, `Session`,
`flush`/`commit`/`refresh`/`rollback`, `expire_on_commit`, and the `get_db`
dependency pattern. No project-specific assumptions.

---

## The three-layer stack

SQLAlchemy has three distinct objects, and confusing them is the root of most
setup bugs:

| Object | What it is | Lifetime |
|---|---|---|
| `Engine` | the connection factory: knows the URL, driver, and connection pool | created once, app-wide |
| `sessionmaker` | a *factory* for sessions, bound to an engine with shared configuration | created once, app-wide |
| `Session` | your working unit: tracks objects, holds the transaction | **short-lived, per request / per operation** |

### Engine — created once

```python
from sqlalchemy import create_engine

engine = create_engine("postgresql+psycopg://user:pass@host/db")
```

The engine is cheap to create and should be created **once** at application
startup and reused forever. It owns the **connection pool**: it keeps a small
set of real database connections ready to hand out, so a new `Session` doesn't
pay the TCP/handshake cost every time. You almost never interact with the
engine directly — you give it to a sessionmaker.

### Sessionmaker — created once

```python
from sqlalchemy.orm import sessionmaker

SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
```

A `sessionmaker` is a configurable factory: same engine, same defaults, for
every session it creates. Think of it as a "session template". Configure it
**once**, reuse it everywhere. This is the object the rest of the app depends
on — not the engine.

### Session — created per operation, never shared

```python
session = SessionLocal()
```

The `Session` is the unit of work: it tracks the objects you've added, holds
the transaction open, and flushes changes to the database. The rules:

- **Create a new one per request** (or per logical operation).
- **Never share one across requests or threads** — sessions are not
  thread-safe, and a shared session mixes unrelated transactions together.
- **Always close it** — closing returns the pooled connection to the pool.
  Leaking sessions leaks pooled connections until the pool exhausts.

---

## The unit of work: what happens when you save

The single biggest source of confusion is the difference between `add`,
`flush`, `commit`, and `refresh`. They do different things at different times:

```python
session = SessionLocal()

obj = Widget(name="x")
session.add(obj)  # 1. track the object in the session

session.flush()  # 2. send INSERT to the DB, *inside* the open transaction
print(obj.id)  #    now available: the DB generated it during flush

session.commit()  # 3. end the transaction: changes become permanent
session.refresh(obj)  # 4. re-read the row from the DB (server-side defaults,
#    triggers, values the DB computed)
session.close()  # 5. release the connection back to the pool
```

### `add` — tracking, not SQL

`session.add(obj)` just tells the session "keep an eye on this object". No SQL
runs. The object is *pending* until a flush.

### `flush` — the actual INSERT/UPDATE

`flush` sends pending SQL to the database **inside the current transaction**.
This is when auto-generated values arrive: an auto-incrementing `id`, Python
side `default=...` values, and server-side defaults become visible on the
object *after* the flush. The transaction is still open, so the change is not
yet durable — and not yet visible to other connections (unless you commit).

### `commit` — make it permanent

`commit` ends the transaction and makes the changes durable. After commit, the
transaction is gone; the next statement starts a new one implicitly.

### `refresh` — re-read from the database

`refresh(obj)` reloads the object's attributes from the actual database row.
Use it when the database computed values you need in your response: server
defaults, triggers, or columns the DB fills in. If you never call it, you
return stale (or `None`) values for anything the DB generated after your flush.

### `rollback` — abandon the transaction

`rollback` discards the current transaction's uncommitted work. The standard
pattern is `try: ... commit() except: rollback(); raise`.

---

## `autoflush` and `expire_on_commit` — the two knobs that confuse everyone

### `autoflush` (default: True)

When you run a *query* against a session, SQLAlchemy first flushes any pending
changes so the query sees consistent data. Handy, but surprising: a query can
trigger writes you didn't expect, and in web apps it can fire at awkward
moments (e.g. during response serialization). Many teams set
`autoflush=False` and flush explicitly. Either is defensible — the trap is not
knowing which one you have.

### `expire_on_commit` (default: True)

After `commit()`, SQLAlchemy **expires** every tracked object: their attributes
are marked "stale", and the next access re-queries the database for fresh
values. That's correct for long-lived sessions but dangerous in web apps:

- Accessing an attribute after commit triggers a **lazy re-query** — extra
  round-trips you didn't ask for.
- If the session is already closed (or the transaction rolled back), the
  re-query **raises an error** on what looks like a plain attribute read.

In request-scoped web apps you almost always set `expire_on_commit=False`: you
know your data is current, and you avoid the surprise queries. The reference
pattern in the ecosystem is `sessionmaker(bind=engine, expire_on_commit=False)`.

---

## The web-app pattern: a `get_db` dependency

In a web framework (FastAPI, Flask, etc.) the idiomatic wiring uses a **yield
dependency**: create the session at request start, hand it to the request
handler, clean up when the request ends.

```python
def get_db():
    session = SessionLocal()  # per-request session
    try:
        yield session  # the handler uses it here
        session.commit()  # option A: commit at teardown
    except Exception:
        session.rollback()  # failed request → discard
        raise
    finally:
        session.close()  # always release the connection
```

There are two philosophies for **who commits**, and they're both valid — but
you must pick one and be consistent:

**Option A — commit at teardown (in `get_db`).** Handlers never call commit;
the dependency commits after the handler returns. Less boilerplate, but two
caveats:

- The commit runs **after** the response was already serialized. If the handler
  returned an object whose `id`/server-defaults were never flushed, the
  response can contain `null` values even though the row was saved. You must
  `flush()` (or commit) inside the handler before returning.
- The "commit at teardown" logic is hidden from readers of the handler.

**Option B — commit in the handler/service (mainstream in FastAPI).** The code
that did the work also commits, then `refresh()`es what it returns:

```python
db.add(obj)
db.commit()
db.refresh(obj)
return obj
```

Explicit, and the response is guaranteed correct because the values are flushed
and refreshed *before* serialization. The dependency stays pure
setup/teardown.

Both keep the `rollback` on error and the `finally: close()` — that part is
non-negotiable regardless of who commits.

---

## Session lifecycle checklist

A correct web request looks like:

1. Request arrives → `get_db` creates a session.
2. Handler/service does work: `add` → `flush` → `commit` (option B).
3. `refresh` whatever the response will show that the DB generated.
4. Handler returns; response serializes from real values.
5. `get_db` teardown: on error `rollback`, always `close()`.

---

## Common pitfalls

- **Creating an engine per request** → you throw away the connection pool and
  pay connection setup every time. One engine, one sessionmaker, app-wide.
- **A shared session across requests/threads** → corrupted transactions and
  hard-to-debug race conditions. One session per request, always.
- **Forgetting `close()`** → pooled connections leak until the pool is
  exhausted and the app stops accepting connections.
- **Reading `id` before `flush`/`commit`** → `None`, because the DB hadn't
  generated it yet. Flush first.
- **Returning objects without `refresh` when the DB computed values** → `None`
  or stale values in the response.
- **`expire_on_commit=True` + closed session** → attribute access after close
  raises `DetachedInstanceError` — the classic "works in dev, crashes in prod"
  bug. Set `expire_on_commit=False` in web apps.
- **Autoflush surprises** → a query triggering unexpected writes. If you set
  `autoflush=False`, flush explicitly where needed.
- **`commit()` in both the handler and `get_db`** → double commit, or worse,
  "double commit" attempts after the transaction ended. Pick one owner.
- **Not rolling back on error** → a half-open transaction leaks and poisons the
  next request that reuses the connection.

## Minimal reference setup

```python
# db.py — created once
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

engine = create_engine("postgresql+psycopg://user:pass@host/db")
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    session = SessionLocal()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
```

```python
# a service — commits explicitly (option B)
def create_widget(db, name):
    widget = Widget(name=name)
    db.add(widget)
    db.commit()
    db.refresh(widget)
    return widget
```

That's the whole pattern: **one engine, one sessionmaker, a fresh session per
request, explicit flush/commit/refresh where the DB generates values, and
unconditional close.**
