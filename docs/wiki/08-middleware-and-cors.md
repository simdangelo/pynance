# Module 8 — Middleware & CORS

A request travels a **path** before it reaches your route handler. This
module is about the things that inspect or modify it *along that path* —
and about the one browser-enforced rule (CORS) that can break your API for
no obvious reason. The good news for Pynance: you likely need almost none of
the CORS machinery, for reasons the architecture already decided. But you
*should* add a few middleware pieces — they're the "hardening" layer that
makes a real deployment safer and more debuggable.

This file is self-contained: read it, then do the exercise at the bottom.

---

## Part 1: what middleware is (the onion)

Middleware is code that runs **before your route handler and after it**,
wrapping every request. Think of it as layers of an onion: the request goes
*in* through the layers, reaches the core (your route), and the response
goes *out* through the same layers in reverse.

```
request  ──► [middleware 1] ──► [middleware 2] ──► [route handler]
response ◄── [middleware 1] ◄── [middleware 2] ◄── [route handler]
```

Why does order matter? Because each layer can decide to **stop** the
request (return a response without ever reaching the route), and each layer
sees the response of everything *inside* it on the way out. That's what
makes middleware good for cross-cutting concerns — things that apply to
*every* route, not one specific one:

- logging every request (method, path, status, duration)
- adding a `X-Request-ID` header so a single request is traceable across
  logs
- checking the `Host` header (rejecting requests for unknown hosts)
- rate limiting
- authentication (though Pynance does auth via a dependency instead —
  see below)

In Starlette/FastAPI, the lowest-level primitive is **pure ASGI
middleware** — a function that takes the *next* handler and a request,
and can do whatever it wants before/after. On top of that, FastAPI gives
you `app.middleware("http")` as a shortcut for HTTP-only middleware, and
Starlette ships ready-made middlewares you can just add:

```python
from starlette.middleware.trustedhost import TrustedHostMiddleware

app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "pynance.local"])
```

The signature of the shortcut form is worth internalizing, because it shows
the onion shape exactly:

```python
@app.middleware("http")
async def add_timing_header(request: Request, call_next: Callable) -> Response:
    start = time.perf_counter()
    response = await call_next(request)      # let the onion continue inward
    response.headers["X-Process-Time"] = f"{time.perf_counter() - start:.4f}"
    return response                          # ...and outward
```

`call_next` is the "rest of the onion". Everything before it runs on the
way in; everything after it runs on the way out.

### Middleware vs dependencies — which one?

Both run "before the route", so how do you choose? A **dependency**
(`Depends(...)`) is *per-route*: you opt in on the routes that need it, and
it runs inside the router with access to the request, path params, and the
route's own context. A **middleware** is *global*: it runs for **every**
request whether the route wants it or not, but it has no idea which route
it's heading to (or whether one exists at all).

So: use dependencies for things tied to a route's *semantics* (Pynance's
`get_current_user` — only protected routes need it, and it needs the
session cookie). Use middleware for things tied to the *transport* — they
must apply to everything (logging, security headers, host checks),
including requests that will 404.

### Pitfall: don't put business logic in middleware

Middleware is transport plumbing. Parsing bodies, validating input,
querying the DB for a use case — that belongs in routes/dependencies/
services. Middleware that grows business logic becomes untestable and slow
(a request that hits a 404 static file still drags through all of it). Keep
middleware to the few generic concerns below.

---

## Part 2: CORS — and why you almost certainly don't need it

**CORS (Cross-Origin Resource Sharing)** is not something you "turn on to
be safe" — it's a **browser** security mechanism. The browser enforces a
rule: a page served from origin A may only make `fetch`/`XHR` calls to
origin B if B explicitly says it's OK, via `Access-Control-Allow-Origin`
headers. Without that header, the browser **blocks the response** (the
request may reach the server, but the JS can't read the result).

"Origin" = **scheme + host + port** together. `http://localhost:5173` and
`http://localhost:8000` are different origins, even on the same machine.

The catch: **CORS is irrelevant for server-to-server or non-browser
clients** (curl, your Telegram bot, a phone app). It only exists because
browsers sandbox one web page from another.

### When does an app need CORS middleware?

Only when the **frontend origin ≠ backend origin** and the frontend is
served in a *browser*. Then `CORSMiddleware` must be added, and the
`allow_origins` list must be **exact** — `"*"` with `credentials=True` is
invalid (browsers refuse wildcard origins with credentials), which is
exactly the trap people hit when they add cookie auth + CORS at the same
time.

### Why Pynance doesn't need it (already decided)

The architecture (AGENTS.md, "Frontend ↔ Backend Communication") deliberately
uses a **single origin** in both environments:

- **Dev:** Vite dev server proxies `/api/*` to the backend. The browser
  only ever talks to `localhost:5173`; the proxy is a server-to-server hop,
  which CORS doesn't apply to.
- **Prod:** FastAPI serves the built `frontend/dist/` static files *and*
  the `/api/*` routes from the same port. One origin, full stop.

The cookie-based session (ADR 0005) works precisely *because* of this:
the `HttpOnly` session cookie is same-origin, no `SameSite=None` + `Secure`
acrobatics required. **Adding CORS middleware now would be adding
complexity that solves a non-problem** — and worse, misconfigured CORS
would quietly reopen your session cookie to other origins. Leave it out.

**If** that single-origin setup ever breaks (frontend moved to a CDN,
separate subdomains), *then* CORS becomes necessary — and that decision
should be made deliberately, not as a default. That's the documented
exception in AGENTS.md, and it would be a new ADR.

---

## Part 3: what to actually add

Since CORS is out, the module is about the generic hardening/observability
middleware worth having in production — most of which is one `add_middleware`
call each:

### 1. `TrustedHostMiddleware` — reject requests for unknown hosts

By default FastAPI will happily respond to any `Host` header. That's fine
on your LAN, but once the app is reachable on the internet, an attacker can
send requests with `Host: evil.com` and the app will serve them (which
matters for absolute-URL generation, password-reset links, cache poisoning,
and general confusion). `TrustedHostMiddleware` checks the `Host` header
against an allow-list and returns `400` otherwise.

```python
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1"])
```

In dev, the Vite proxy forwards the browser's `Host: localhost:5173` to the
backend — the *port is stripped* when comparing, so `"localhost"` matches
both. When you deploy (Module 6), you add your real domain here.

### 2. A tiny request logger — the cheapest debugging win in the project

One small `@app.middleware("http")` that logs `method path -> status (duration)`
for every request. For a dev machine and a single user it's borderline
essential: it's how you see what the frontend is actually calling, and how
you notice a runaway loop of requests. Later (Module 6) this becomes the
foundation for a structured logger.

### 3. `X-Request-ID` — trace one request across logs

Generate a UUID per request, add it as a response header, and include it in
the log line. Now when a bug report says "it broke at 14:02", you can grep
the logs for one request. Two lines of code in the same middleware as the
logger (set it before `call_next`, log it after).

### 4. (Optional, cheap) security headers

Starlette has `GZipMiddleware` (compression) — skip it at this scale. If you
want a quick hardening win, a 5-line middleware setting
`X-Content-Type-Options: nosniff` is cheap. Don't over-invest here;
Module 6 covers real TLS/reverse-proxy hardening.

**An explicit non-goal:** auth in middleware. Pynance does auth via the
`CurrentUser` dependency per-route (needs the cookie, per-route semantics) —
correctly so. Don't "simplify" it into global middleware.

---

## Pitfalls (recap)

1. **Middleware order matters** — think onion: a middleware added *later*
   wraps everything added *before* it. TrustedHost should be an outer layer
   (reject early); the logger can be anywhere.
2. **Don't reinvent CORS** — if you never have two browser origins, you
   never need it. Adding it "just in case" is a security footgun with
   credentials.
3. **`"*"` + credentials is invalid** — if you *do* ever add CORS with
   cookie auth, `allow_origins` must be an exact list, never `"*"`.
4. **Middleware ≠ business logic** — keep it to transport concerns.
5. **`async def` middleware only calls `call_next` once** — calling it twice
   (or not at all) is a bug; the onion must pass through exactly once.
6. **Host header check has a dev gotcha** — the Vite proxy forwards the
   browser's Host (with port); TrustedHost strips ports, so list bare
   hostnames.
7. **Uvicorn configures only its own loggers** — uvicorn's default logging
   leaves the *root* logger at `WARNING` with no handler for app loggers, so
   your `logger.info(...)` lines are **silently dropped**. Fix: give the
   `pynance` logger its own `StreamHandler` and level (the `_setup_logging()`
   helper in `main.py`), with `propagate = False` so lines print exactly once.
8. **TestClient's default host is `testserver`** — `TrustedHostMiddleware`
   rejects it with 400, breaking every test. Use
   `TestClient(app, base_url="http://localhost")` in the test fixtures
   (this is why `tests/conftest.py` and the hand-built `TestClient` in
   `tests/test_auth.py` pass `base_url`).
9. **A handler for base `Exception` lives in the *outermost* middleware** —
   FastAPI/Starlette route the base-`Exception` handler to
   `ServerErrorMiddleware`, *outside* your custom middleware. So a 500 still
   reaches the client, but your middleware's "after `call_next`" code never
   runs for it: no `X-Request-ID` header, no duration log line. Handle it in
   both places — wrap `call_next` in `try/except` to log error + duration
   inside the middleware, and set the `X-Request-ID` header on the
   `JSONResponse` the exception handler returns.

---

## The exercise

This exercise was **completed as an unblock step** — the pieces live in
`backend/pynance/api/main.py` (plus `allowed_hosts` in `backend/pynance/config.py`):

1. `TrustedHostMiddleware` with `allowed_hosts` covering your dev setup
   (`localhost`, `127.0.0.1`) — read from `Settings` so the real domain can
   be added via `.env` at deploy time.
2. A small `@app.middleware("http")` that:
   - generates an `X-Request-ID` (UUID) and sets it as a response header;
   - logs `method path -> status` plus the request id and duration;
   - uses Python's `logging` (a module-level `logger = logging.getLogger(__name__)`).
3. Confirm in the dev terminal that requests now print a line per request.
   If you *don't* see your app's log lines under uvicorn, it's pitfall #7
   (uvicorn only configures its own loggers) — the `_setup_logging()` helper
   fixes it.

Tooling checkpoints (run from `backend/`):

```bash
uv run ruff check .
uv run mypy .
uv run pytest        # should stay green: middleware must not break any existing test
```

Then start the app and hit a couple of endpoints (`/api/categories`,
a nonexistent path like `/api/nope`) — you should see log lines, and the
`X-Request-ID` header in the browser devtools → Network.

What's deliberately **not** in the exercise: no CORS middleware, no auth
middleware. If you find yourself adding either, stop and re-read this file.

---

## After you're done

**Done in this project** (unblock step). ADR 0006 records the decision:
**no CORS middleware (single-origin by design); TrustedHostMiddleware +
request logging with X-Request-ID as the hardening baseline.** See
`docs/adr/0006-no-cors-trusted-host-and-request-logging.md`.

The actual implementation went slightly beyond the exercise, and the extra
pieces are worth knowing about:

- **A health endpoint** (`GET /api/health` → `{"status": "ok"}`) — the
  liveness check a reverse proxy or uptime monitor will hit. It's
  unauthenticated by design (the proxy calls it, not a user).
- **User context in the log line.** `get_current_user` sets
  `request.state.user_id`; the middleware reads it after `call_next` and
  logs `user_id=...`. Anonymous requests (login, register, health) log
  `user_id=None`. This answers "who did it?" — the missing piece noted in
  the observability analysis.
- **Exception correlation.** `call_next` is wrapped in `try/except` so a 500
  still produces a log line (with duration) inside the middleware, and an
  `@app.exception_handler(Exception)` logs the full traceback with the same
  `request_id` + `user_id` and returns a `500` JSON with the `X-Request-ID`
  header — so even errors are traceable end to end.

The two ERROR lines you'll see for one 500 (middleware + exception handler)
are intentional: the first carries the duration, the second the traceback,
and the shared `request_id` links them.