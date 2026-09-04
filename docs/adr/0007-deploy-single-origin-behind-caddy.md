# ADR 0007 — Deploy architecture: single origin behind a Caddy proxy

## Status
Accepted

## Context
Pynance is moving from "runs on my machine" (Module 9's starting point) to a
service that can be reached on the internet over HTTPS. The stack today is a
Postgres container, a FastAPI backend on `:8000`, and a Vite frontend on
`:5173`, all only reachable through `localhost`. The deployment had to
decide: what goes in which image, who terminates TLS, where the built
frontend lives, and how secrets reach the running services.

Prior decisions shape the answers. AGENTS.md fixed that in production the
backend serves the built frontend (single origin), which is what makes the
HttpOnly session cookie (ADR 0005) and the no-CORS choice (ADR 0006) work.
ADR 0006 also reserved security headers and IP trust for the reverse proxy,
not the app.

## Decision
- **One public entry point: a Caddy reverse proxy** terminating TLS and
  routing everything on `DOMAIN` to the backend. Caddy auto-provisions and
  renews Let's Encrypt certificates for `DOMAIN` (an env var), redirects
  `http://` to `https://` by default, and serves HSTS +
  `X-Content-Type-Options: nosniff`. It is the only service publishing ports
  to the host (`:80`/`:443`).
- **Single origin: the backend serves the built frontend.** The backend
  image is multi-stage: a Node stage builds the frontend (`dist/`), a uv
  stage installs backend dependencies, and a slim Python runtime stage copies
  only the runtime artifacts (site-packages, app code, migration files) plus
  `dist/`. The runtime runs as a non-root user (`UID 10001`). FastAPI mounts
  `frontend-dist/` (a catch-all serving `index.html` for SPA routes) only
  when that directory exists, so dev and tests are unaffected.
- **Postgres is not exposed in production.** The DB lives on the private
  compose network; its port is published only via a separate
  `docker-compose.dev.yaml` override, so local `psql`/`pytest` still work.
- **The backend trusts the proxy's `X-Forwarded-For`.** The compose network
  uses a fixed subnet (`172.20.0.0/24`), the proxy gets a fixed IP
  (`172.20.0.5`), and uvicorn runs with `--proxy-headers` and
  `--forwarded-allow-ips=172.20.0.5` so logs show real client IPs without
  trusting arbitrary clients.
- **Secrets only via environment.** `.env` stays gitignored (only
  `.env.example` is committed); compose injects values as container env, and
  the backend's `Settings` reads them. Nothing secret is baked into an image
  layer.
- **`secure_cookies` is a setting.** `SECURE_COOKIES=true` in the prod
  `.env` makes the session cookie `Secure` (sent only over HTTPS); it stays
  `false` for local HTTP dev.
- **`ALLOWED_HOSTS` includes the domain.** TrustedHostMiddleware
  (ADR 0006) is fed `["<DOMAIN>", "localhost", "127.0.0.1"]` from compose,
  so real requests are not rejected with 400.
- **Migrations run on startup.** The backend image's `entrypoint.sh` runs
  `alembic upgrade head` then starts uvicorn, gated on the DB healthcheck.
- **The Telegram bot is an optional container.** Same image, `profiles:
  ["bot"]`, runs `python -m pynance.bot.main`; the profile keeps it out of
  the default stack.

## Alternatives considered
- **nginx + certbot instead of Caddy** — rejected for this project: Caddy's
  automatic certificate provisioning/renewal and `http→https` redirect remove
  the TLS ceremony that nginx + certbot require (certbot install, cron
  renewal). nginx remains the choice if we ever need fine-grained config or
  want to match typical workplace tooling.
- **Frontend in its own nginx container** — rejected: it breaks the
  single-origin design (which the session cookie and no-CORS decision depend
  on) unless the proxy becomes a split router with two upstreams. The
  backend-serving-dist shape keeps one image, one container, one origin.
- **Publishing the Postgres port in the prod compose** — rejected: nothing
  outside the private network should reach the DB. Dev keeps an override
  file.
- **`--forwarded-allow-ips="*"`** — rejected: trusting any client lets a
  caller spoof `X-Forwarded-For`. Scoped to the proxy's fixed IP instead.
- **Separate `secure_cookies` hardcoded** — rejected: a setting lets the
  same codebase run over HTTP locally and HTTPS in prod without code changes.

## Consequences
- Deploying is now `docker compose build && docker compose up -d`; the stack
  is db + backend (with frontend) + Caddy, plus an opt-in bot container.
- The backend image builds both apps: frontend changes trigger a Node build
  in the image. Builds are slower but the result is a single deployable.
- Local dev requires the `-f docker-compose.dev.yaml` override (or the DB
  port is not published); README documents both flows.
- First-time HTTPS needs `DOMAIN` to resolve to the server so Let's Encrypt
  can validate it; local testing can use `localhost` with Caddy's local CA.
- A new static-serving path was added to the API (`static_assets` router,
  `frontend-dist/`) — it is a no-op in dev and covered by the existing 100
  tests (which pass unchanged).
- `secure_cookies=true` is required in prod; forgetting it leaves the cookie
  `Secure`-less (a hardening gap), which the hardening checklist in wiki 09
  calls out.

## References
- Wiki: `docs/wiki/deploy-guide.md`; Journal: `docs/journal/09-docker-deploy-and-readiness.md`
- Builds on ADR 0005 (cookie sessions), ADR 0006 (no CORS; proxy takes
  headers/IP trust), and the single-origin rule in AGENTS.md.