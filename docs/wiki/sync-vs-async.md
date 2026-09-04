# Sync vs Async in Python Web Backends

A general guide to the synchronous vs asynchronous programming distinction in
Python web backends, and how the two stack up for database access. It teaches
the concepts and trade-offs; it does not make a recommendation for any specific
project.

---

## What the distinction actually is

Python runs code on threads by default. When a sync function needs to wait
(disk I/O, a network request, a database query), the thread simply blocks until
the result arrives. For a long wait, that thread sits idle.

Async (`async def` / `await`) is a different way to wait: instead of blocking a
thread, the code says "I'm waiting — go do something else meanwhile." The event
loop juggles many in-flight operations on few threads, resuming each one when
its result is ready. It lets one thread handle many concurrent I/O operations.

The key phrase: **async buys concurrency, not speed.** It helps when you have
*many things waiting on I/O at the same time* (hundreds of simultaneous
requests, each mostly idle). It doesn't make a single operation faster.

## Sync vs async in the FastAPI context

FastAPI supports both, and the rules are simple:

- `def` endpoint → FastAPI runs it in a **threadpool** (a pool of worker
  threads). Blocking is fine; each request gets a thread.
- `async def` endpoint → runs on the **event loop**. To benefit, every call
  inside must be async too (`await` on async libraries). If an `async def`
  endpoint makes a *blocking* call (sync DB query), it blocks the whole loop —
  that's the classic async footgun.

For SQLAlchemy specifically, there are two stacks:

| | Sync SQLAlchemy | Async SQLAlchemy |
|---|---|---|
| Session | `Session` / `sessionmaker` | `AsyncSession` / `async_sessionmaker` |
| Queries | `db.execute(...)` | `await db.execute(...)` |
| Model style | identical | identical |
| Complexity | plain | `async`/`await` everywhere, `anyio` for tests |

The *models* are the same; what changes is how you obtain and use the session.

## The trade-offs

**Async pros**
- Scales to very high concurrent I/O-bound load (e.g. a public API with
  thousands of simultaneous users).
- One event loop, less per-request memory than a thread per request.

**Async cons**
- Much harder to debug: `async`/`await` propagation, the event loop's execution
  order, and "why is this blocking the loop" all bite newcomers.
- More moving parts: async engine/session, async test clients, `anyio`.
- Migrating sync libraries into async code is awkward; every dependency must
  have an async variant.

**Sync pros**
- Simple, linear, debuggable: `db.execute()` returns the answer. Stack traces
  read top-to-bottom.
- Sync SQLAlchemy is more mature and better documented.
- A framework threadpool gives concurrency for free — adequate for a
  single-user app or low-traffic service.

**Sync cons**
- A thread per in-flight request: fine at low concurrency, wasteful at very high
  concurrency.

## How to decide

The main question: **do you have high concurrent I/O-bound load?** If the answer
is no — a personal app, an internal tool, a low-traffic API — sync wins on
simplicity. If the answer is yes — a public API with thousands of concurrent
users — async earns its complexity. The choice is also *revisable*: migrating
later is real work (rewrite endpoints, the session factory, every query with
`await`), but business logic and test cases transfer.

## Pitfalls regardless of choice

- **Blocking the event loop** (if async): a sync DB call in an `async def`
  endpoint freezes every other request. Never mix sync I/O into the loop.
- **Forgetting `expire_on_commit=False`**: after `db.commit()`, attribute
  access re-queries the DB. With async that's an extra round-trip; configure it
  away.
- **Session lifecycle**: one session per request, never shared across requests
  or threads. This is what a `get_db` dependency pattern enforces.

## Minimal illustrative example

The *shape* of a sync session setup:

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

engine = create_engine("postgresql+psycopg://user:pass@db/dbname")
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

Compare with the async equivalent — same ideas, but `async def`, `await`, and an
async engine/session factory. The model classes you'd write are identical either
way, which is exactly why "sync vs async" is a *plumbing* decision, not a
*modeling* decision.
