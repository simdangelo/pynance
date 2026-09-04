# ADR 0006 — No CORS; TrustedHost + request logging with X-Request-ID

## Status
Accepted

## Context
Module 8 (middleware & CORS) of the learning roadmap. The module's surface
was two things: the CORS browser security mechanism, and generic HTTP
middleware. The app is about to move toward a public deployment (Module 6),
so the question was what, if anything, to add at the transport layer *now*.

Two facts shaped the decision:

- **The app is single-origin by design** (AGENTS.md, "Frontend ↔ Backend
  Communication"): in dev the Vite dev server proxies `/api/*` to the
  backend; in prod FastAPI serves the built static bundle *and* the API from
  one port. The browser therefore never talks to two origins, so the CORS
  mechanism — which exists only to police browser cross-origin requests —
  never triggers. CORS middleware would be complexity that solves a
  non-problem, and a misconfigured `allow_origins` list (the classic
  `"*"` + `credentials=True` trap) would quietly expose the HttpOnly session
  cookie to other origins.
- **A hardening/observability baseline is cheap and wanted.** Once reachable
  on the internet, the app should reject requests for unknown `Host`
  headers, and single-request traceability across logs is the backbone of
  debugging a deployed app.

## Decision
- **No CORS middleware.** The single-origin setup (Vite proxy in dev,
  static serving in prod) is kept; CORS is only added if that setup ever
  breaks (frontend on a separate origin/CDN), as an explicit, documented
  exception.
- **`TrustedHostMiddleware`** is added, with `allowed_hosts` read from
  settings (`config.py`, default `["localhost", "127.0.0.1"]`). Unknown
  `Host` headers get `400 Invalid host header` before reaching any route.
- **A request-logging middleware** is added (`@app.middleware("http")`) that:
  - generates an `X-Request-ID` (UUID) per request and sets it as a response
    header, so a request is traceable across logs;
  - logs `method path -> status (duration_ms) request_id=...` for every
    request via Python `logging`;
  - logs at `WARNING` when a request exceeds 500ms, otherwise `INFO`.
- **No auth middleware.** Authentication stays in the per-route
  `CurrentUser` dependency (it needs the session cookie and is route-scoped);
  auth-in-middleware was considered and rejected (below).

## Alternatives considered
- **Add CORS "just in case"** — rejected: it solves a problem that does not
  exist at a single origin, and with credentials it is a security footgun.
  If it is ever needed, it will be its own deliberate decision.
- **Auth as global middleware** — rejected: auth needs the cookie and is a
  per-route semantic (only some routes require it), which is exactly what
  the `CurrentUser` dependency is for. Global middleware would apply auth to
  everything and complicate the login/logout flow.
- **Security headers / GZip / rate limiting in the app** — rejected: these
  are the reverse proxy's job (Module 6), and doing them in the app would be
  redundant once a proxy fronts the service.
- **Skipping middleware entirely** — rejected: `TrustedHostMiddleware` is
  one line of real hardening, and the request logger (with `X-Request-ID`)
  is the cheapest debugging win available before deployment.

## Consequences
- Requests for unknown `Host` values now return `400` before any route or DB
  work; the dev setup must keep `localhost`/`127.0.0.1` in `allowed_hosts`
  (the Vite proxy forwards the browser's `Host`, so `localhost` covers both
  `:5173` and `:8000`). Tests had to use `TestClient(..., base_url="http://localhost")`
  instead of the default `testserver` host.
- Every HTTP request now carries an `X-Request-ID` response header and
  produces a structured log line; slow requests (>500ms) are easy to spot.
- At deploy time (Module 6), the real domain is added to `allowed_hosts` in
  the environment, and the reverse proxy (which will terminate TLS) takes
  over security headers, rate limiting, and client-IP trust
  (`X-Forwarded-For`), which the logger does not yet account for.
- No API or frontend changes beyond none — this is purely a backend transport
  concern; the API contract is unchanged.

## References
- Wiki: `docs/wiki/middleware-http.md` e `docs/wiki/cors.md`
- Builds on ADR 0005 (HttpOnly cookie sessions) — same-origin is what makes
  the cookie work without CORS.
- The single-origin rationale is fixed in AGENTS.md, "Frontend ↔ Backend
  Communication".