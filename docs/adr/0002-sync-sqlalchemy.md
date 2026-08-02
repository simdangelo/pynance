# ADR 0002 — Synchronous SQLAlchemy (for now)

## Status
Accepted

## Context
AGENTS.md deliberately left DB access style open, to be decided via wiki + ADR
rather than assumed. The two options:

- **Sync** SQLAlchemy (`Session`, `sessionmaker`, blocking queries) with plain
  `def` FastAPI endpoints. FastAPI runs sync endpoints in a threadpool, so it still
  handles concurrent requests — they just execute on worker threads.
- **Async** SQLAlchemy (`AsyncSession`, `async_sessionmaker`, `await
  db.execute(...)`) with `async def` endpoints, relying on an event loop for
  concurrency.

The reference project (Corey Schafer's FastAPI tutorial) is fully async. That is a
data point in favor of async's viability, but not a reason in itself to adopt it.

## Decision
- **Synchronous** SQLAlchemy with sync `def` endpoints.
- Rationale: the app is a single-user personal budget tracker. Concurrency
  requirements are trivial, so the main benefit of async — scalable I/O-bound
  concurrency — does not apply. Sync code is significantly simpler to write,
  debug, and reason about, which matters for a learning project: no `async/await`
  sprinkled through the stack, no `anyio` test fixtures, simpler mental model of
  sessions and transactions.
- This is a *revisable* decision: if the app is ever deployed publicly and sync
  becomes a bottleneck, migrating to async is a real option. It is not free — it
  means rewriting endpoints, the session factory, and every `db.execute` call with
  `await` — but the service-layer logic and test cases transfer.

## Alternatives considered
- **Async SQLAlchemy** (as in the reference tutorial): rejected for now. The
  complexity is real and the scale doesn't justify it. The tutorial's async stack
  also pulls in `anyio`, async engine/session plumbing, and async test clients for
  no benefit at this project's scale.

## Consequences
- Simpler code everywhere: sync `def` endpoints, `Session` dependency, sync
  `TestClient` in tests.
- Concurrency for sync endpoints comes from FastAPI's threadpool — sufficient for
  a single user, with a documented upgrade path to async if scale ever demands it.
