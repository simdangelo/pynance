# Module 9 — Docker deploy & readiness (the manual/VPS path)

> **Where this fits:** `09-deploy-guide.md` is the general deployment guide —
> the map of all strategies (PaaS, VPS, serverless, ...). This file is the
> deep dive into **strategy C (manual VPS + Docker Compose + reverse proxy)**,
> the most educational path, implemented end to end in this project.

Pynance has run on your machine the whole time: Postgres in a container,
backend on `:8000`, frontend on `:5173`, all reachable only through
`localhost`. This module is the step that changes everything: making it
reachable on the internet — a real service a browser anywhere can load over
HTTPS.

That step is mostly *not* about code. It's about packaging (Docker images
that run without your dev setup), a **reverse proxy** that terminates TLS and
fronts the app, **secrets** that don't live in the repo, and a handful of
hardening decisions. This file teaches the concepts, then gives you the
exercise. It builds directly on Module 2 (Docker basics: images, containers,
volumes, compose networking) — re-read `02-persistence.md` if any of that is
fuzzy.

---

## How your app runs today: addresses, ports, and two doorbells

To understand what changes when we deploy, you first need the mental model of
how programs on a computer talk to each other.

Imagine a big apartment building. To reach a specific person you need two
pieces of information: the **building's street address**, which finds the
*computer* on the network (an IP address — `192.168.1.5` is an address, just
like "123 Main Street"), and the **apartment number**, which finds *one
specific program* on that computer (a port — `:8000` is a port, just like
"apartment 3B"). A computer has one IP address but thousands of possible
ports, 0 through 65535. Different programs listen on different ports so they
don't step on each other — it's like each apartment having its own doorbell.
When you write `http://localhost:5173`, you're saying: *talk to the machine
at `localhost`, ring doorbell number 5173.*

`localhost` is a special name that always refers to **the computer you're on
right now**. Technically it maps to the IP `127.0.0.1`, and it isn't a magic
place — it's literally your own machine, looked at from your own machine. So
`localhost:8000` means "the program on my own machine that answers at port
8000."

And why are there two ports? Because during development we run **two separate
programs**: the backend (FastAPI) answers at `localhost:8000`, and the
frontend (the Vite dev server) answers at `localhost:5173`. Each is its own
process, so each gets its own doorbell. Two ports, two programs. (The Vite
dev server does something clever in the middle: when the browser asks it for
`/api/...`, it *forwards* the request to the backend on `:8000` and returns
the answer. That's the "Vite proxy" from earlier modules — and the reason the
browser only ever talks to `:5173`, which is why CORS was unnecessary.)

The consequence is that every piece of the app lives on your own machine and
is only reachable *from* your own machine. Postgres, backend and frontend all
run on the same computer, all reachable only via `localhost:...`. Nothing
outside your computer can reach any of this: if your phone tried to load
`localhost:5173`, it would fail — `localhost` on your phone means *the phone
itself*, not your PC. This is exactly why a deployed app needs the whole
"reverse proxy + domain + HTTPS" machinery this module is about: it moves the
app from "reachable only by me, on my machine" to "reachable by anyone, on
the internet."

---

## The shape of a deployed app: one public entry point

On the internet, the three separate things you have today — the Postgres
container, the backend process, the frontend — become **one entry point**:
the reverse proxy. The browser talks only to the proxy; the proxy forwards to
the backend; the backend talks to Postgres. Nothing else is reachable from
outside.

```
                 internet
                    │
              ┌─────▼─────┐
              │  reverse  │   (your domain:443, HTTPS)
              │  proxy    │
              └─────┬─────┘
                    │  :8000 (private)
              ┌─────▼─────┐
              │  backend  │   FastAPI, serves /api/* + built frontend
              └─────┬─────┘
                    │  :5432 (private)
              ┌─────▼─────┐
              │  postgres │
              └───────────┘
```

A reverse proxy, plainly, is a program that sits *in front of* your backend
and forwards requests to it. "Reverse" because the direction is
internet → proxy → backend: the browser never knows (or needs to know) the
backend exists. Three properties of this shape are worth internalizing.

**Only the proxy is public.** Postgres and the backend listen on a private
Docker network; the host never exposes their ports to the internet, and the
only published port is the proxy's `443`. To make sense of that, you need
what "publishing a port" means: it's taking a port that exists *inside* a
container and opening it on the host machine, so the outside world can reach
it. Your current `docker-compose.yaml` publishes Postgres on
`${POSTGRES_PORT}:5432` — that's how `psql` from your terminal can reach the
container. In prod you *stop* publishing the DB port: the backend reaches
Postgres by its service name on the private network instead (more on that
later). A port that is **not** published is invisible from outside — the
doorbell exists, but nobody on the street can ring it.

**The backend serves the built frontend.** This was decided back in the
"Frontend ↔ Backend Communication" section of AGENTS.md: in prod, `npm run
build` produces `frontend/dist/`, and FastAPI serves that directory as static
files in addition to its `/api/*` routes. One process, one origin — which is
exactly what the HttpOnly session cookie (ADR 0005) needs, and why no CORS
is required (ADR 0006).

**The proxy terminates TLS.** The browser connects over `https://`; the proxy
decrypts and forwards plain HTTP to the backend on the private network. The
backend never sees raw TLS — it just needs to know it's behind one (a point
that comes back in Part 3). "Terminating TLS" means the proxy is the one that
does the HTTPS encrypt/decrypt work, so your backend doesn't have to: to the
backend, the connection looks like plain HTTP arriving from the proxy. It's
like a building doorman who checks your ID at the entrance so each apartment
doesn't have to re-check it.

---

## Packaging: turning your apps into images that run anywhere

"Runs on my machine" fails on a server because your machine is *not* there:
no `uv`, no Node, no `.venv`. A Docker image must contain everything the app
needs to run, nothing else. An image, plainly, is a self-contained, frozen
snapshot of everything needed to run a program: the operating-system bits,
Python or Node, the installed libraries, the code. You can copy it to any
machine that runs Docker and the program will run the same way, because the
machine's own setup no longer matters — *everything* traveled with the image.
(A container is just a running instance of an image, like a running program
is an instance of its executable file.) And "nothing else" matters for real
reasons: a bloated image is slower to build, slower to ship, harder to secure
(more software = more attack surface), and may contain tools an attacker
could abuse if the app is ever compromised.

### The backend image: build-time and run-time dependencies

Your backend needs a lot *to build* — ruff, mypy, pytest, the whole
`pyproject.toml` dev group — but very little *to run*: the runtime
dependencies plus the code. **Multi-stage builds** solve exactly this. The
Dockerfile describes two recipes: the first builds everything (installs all
dependencies, even the dev ones); the second starts fresh from a clean base
image and only *copies the finished results* out of the first one — never the
dev tools. The final image contains just the runtime result.

```
STAGE 1 "build":  python:3.14-slim + uv → installs all deps (incl. dev)
                       │
                       ▼   (copies just: installed runtime site-packages + app code)
STAGE 2 "runtime": python:3.14-slim + those site-packages + code
                       │
                       ▼
                 final image ≈ 3 layers, no compilers, no dev tools
```

To understand why the two recipes work the way they do, you need one more
idea: an image is built as a **stack of layers**, each layer a small change
(install Python, add the dependencies, copy the code). Docker caches layers,
so if nothing in a layer changed, it reuses the cached one instead of redoing
the work. That single fact drives several of the tricks below.

Concretely with `uv`, the build stage runs `uv sync` (which installs the
locked dependency set), and the runtime stage copies the resulting
`.venv`-equivalent. Four details matter:

- **`--no-dev`** keeps ruff/mypy/pytest out of the runtime image. They are
  build-time only.
- **Copy the lockfile first, then the code** — because of layer caching. If
  you copy the code *before* installing dependencies, then any code change
  invalidates the cache of every layer after it, including the expensive
  dependency install. Copy the lockfile, install dependencies, *then* copy
  the code: code changes only re-run the last, cheap layer, and rebuilds take
  minutes instead of a fresh install every time.
- **`USER` non-root** — run as an unprivileged user. An image that runs as
  `root` hands an attacker a root shell if they exploit the app. A single
  `USER 10001` line does it; the number is used (rather than a name) because
  10001 exists in the base image, while named users depend on the image
  having that user defined.
- **A `.dockerignore`** — exclude `.venv`, `.git`, `tests`, `local/`,
  `*.pyc`, `.mypy_cache`, `.ruff_cache`. The "build context" is the project
  folder the Docker daemon copies in when you run `docker build`, and `COPY`
  can grab anything from it; `.dockerignore` tells the daemon what to skip,
  like a `.gitignore` for the image. Without one, your `.env` with secrets
  could end up inside the image.

Three things the build taught us that the plan did not:

- **The `ghcr.io/astral-sh/uv` image has no Python-pinned tags** — `uv:0.9-python3.14`
  (and `uv:python3.14`, `uv:3.14`) simply do not exist, only `latest` (and
  plain version tags). The robust way to get a *specific* Python with uv is
  to start from `python:3.14-slim` and copy the uv binary out of the uv
  image: `COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv`.
  This pins Python to 3.14 (the version the project requires) and uses uv
  everywhere, without depending on whatever `uv:latest` happens to bundle.
- **A Dockerfile that builds both apps needs the repo root as its build
  context.** If one `COPY frontend/...` and one `COPY backend/...` appear in
  the same file, `docker build` must be pointed at the repository root (and
  `.dockerignore` lives there, not in `backend/`). The classic per-app
  context only works when each image builds one app.
- **A build stage must contain every file a later stage copies from it.** The
  `backend-deps` stage exists to produce `.venv`; if the runtime stage then
  does `COPY --from=backend-deps ... /app/pynance`, the deps stage must
  itself have copied `pynance/` in. An easy mistake is to copy only
  `pyproject.toml`/`uv.lock` into the deps stage and let the runtime `COPY
  --from` fail with "file not found" — the stage is the *source* of every
  artifact the runtime expects.

### The frontend image: it's not a Node runtime

The frontend's prod form is **static files** — `dist/`: HTML, JS, CSS,
assets. "Static" means the files don't change per request: no logic, no
database. The browser downloads the HTML/JS/CSS and runs the UI itself,
calling the backend's `/api/*` for data. This is exactly how the Vite dev
server works today — the *dev* server compiles on the fly, the *prod* version
just has the already-compiled files sitting in `dist/`, ready to be served
as-is. Serving them doesn't need Node at all. So the frontend's image is a
build stage that runs Node to compile, and a runtime stage that is just a
static-file server — or, better, no image at all, since the backend serves
`dist/`.

Two classic shapes exist:

1. **"Frontend files live in the backend image"** — the backend build stage
   builds the frontend and copies `dist/` next to the FastAPI app. One image,
   one container, one origin. Simplest.
2. **Frontend served by its own container** (nginx) — a separate image, and
   the proxy routes `/` to the frontend container and `/api/*` to the
   backend. More moving parts, and it breaks single-origin unless the proxy
   is the single origin.

For this project, shape 1 is the coherent one: it's what "FastAPI serves the
built frontend" already decided. You'll still write the frontend's
*multi-stage* Dockerfile to build it — it just lands inside the backend
image.

### "The backend serves the frontend" is code you must write

Saying "FastAPI serves the built frontend" is not automatically true — it's a
small feature that has to be added to the app. If the image contains
`frontend-dist/` but the backend never mounts it, the container serves only
`/api/*` and everything else 404s. What shape 1 requires in the API:

- **Mount the static directory only if it exists.** In dev there is no
  `frontend-dist/` (Vite dev server serves the app), so the static routes
  must be a no-op there — otherwise the catch-all below would swallow every
  dev request. A module-level `if (FRONTEND_DIST).is_dir():` guards it.
- **Serve `/assets/*` as a static mount**, separate from the catch-all. The
  built JS/CSS/fonts live under `dist/assets/` with hashed names.
- **A catch-all `/{path:path}` returns `index.html` for anything that is not
  a real file.** This is the SPA fallback: the browser requests
  `/transactions`, the server has no such route, and it must hand back
  `index.html` so React Router can render the page. The catch-all is
  registered **after** the API routers, or it would capture `/api/*` too.
- **Return the real file when it exists, `index.html` otherwise** — so a
  stray path that looks like a file (e.g. `/favicon.svg`) serves the actual
  file instead of the HTML shell.

---

## The reverse proxy and HTTPS

This is the part with the most real-world weight, and where "localhost works
but the internet breaks" happens. The proxy has two jobs: **TLS
termination** (speak HTTPS to the browser, plain HTTP to the backend) and
**routing** (everything on `your-domain` goes to the backend, which serves
both `/api/*` and the static frontend).

### Certificates: not optional, and free

HTTPS is what makes the HttpOnly session cookie `Secure` (ADR 0005) safe to
send. A **certificate** is a small file that proves "this server really is
`your-domain.com`": it anchors the encryption between browser and server, and
the browser trusts it because it was signed by a **Certificate Authority**
(CA) — a globally trusted organization. Without a valid cert, the browser
shows a scary "your connection is not secure" warning. The standard free CA
is **Let's Encrypt**, which will sign your cert automatically, but only after
verifying you control the domain — that's why the whole thing needs a real
domain, not just an IP address: the cert is tied to the domain, and the
browser looks the domain up (via DNS) to find the server's IP.

Two ways to get certs onto the proxy:

- **Caddy** — the pragmatic choice for this project. It *auto-provisions and
  renews* Let's Encrypt certs for you. You write a five-line `Caddyfile`
  (`your-domain { reverse_proxy backend:8000 }`) and it just works: the whole
  TLS ceremony — ACME, renewals, `http→https` redirect — is handled.
- **nginx + certbot** — the classic stack, more manual: you install certbot,
  obtain a cert, configure `ssl_certificate` paths, set up auto-renewal via
  cron. More control, more ceremony.

For a single-domain personal app, Caddy's automation is worth it. nginx is
the better choice only if you want the same tooling your future work will
likely see, or need its fine-grained config. **This is a decision to record
in an ADR** (this module requires one).

### The host and port gotchas that break it

Several things work on `localhost` and silently break on the internet. They
come up again in the checklist, but each deserves a word here:

- **The backend must trust the proxy.** Behind the proxy, every request's IP
  looks like the proxy's. The `X-Forwarded-For` header (added by the proxy)
  carries the real client IP, but the backend ignores it unless told to — in
  uvicorn, that's `--proxy-headers` plus `--forwarded-allow-ips` (or trusting
  a known IP range). Without it, logs show the proxy as every client, and
  anything that uses the request IP (rate limiting, later) sees the proxy
  too.

  One detail verified in practice: **the proxy overwrites a client-supplied
  `X-Forwarded-For`** with the address it actually sees, so a caller cannot
  spoof their IP by sending the header themselves. `--forwarded-allow-ips`
  scoped to the proxy's fixed IP makes the trust explicit — the backend only
  believes the header when the connection really came from the proxy.
- **`allowed_hosts` must include the real domain.** `TrustedHostMiddleware`
  (Module 8) currently allows `localhost`/`127.0.0.1`. A request with
  `Host: your-domain` will be **rejected with 400** until you add the domain
  to `ALLOWED_HOSTS` in `.env`.
- **The session cookie needs `secure=True` in prod.** Today the cookie is set
  without `secure` — fine on `http://localhost`, wrong over HTTPS. In prod it
  must be `Secure` so the browser only ever sends it over HTTPS. That's a
  real change in the auth code, gated on a setting rather than hardcoded.
- **Redirect `http://` → `https://`.** Caddy does this by default; with nginx
  it's a config block. Nobody should reach the app over plain HTTP.

---

## Secrets, the full stack, and startup order

### Secrets come from the environment

Secrets — the Postgres password, the Telegram token — come from the
**environment**, never the image or the repo. An *environment variable*,
plainly, is a named value handed to a program at startup and readable while
it runs (in Python, `os.environ`); it's how you pass config without
hardcoding it. Today your backend reads `.env` via `pydantic-settings`; in
Docker, `docker compose` also reads `.env` for `${VAR}` interpolation, and
passes the values into the containers' environment. The program doesn't care
where a variable came from — file or compose — it just reads its environment.
The rules that follow from this:

- `.env` is gitignored (it is). The repo holds `.env.example` with the
  *names*, no values.
- No secret ever sits inside an image layer. Images are cached and shared —
  a secret baked into a layer leaks. That's why secrets are passed only at
  run time, via environment.
- `SecretStr` fields (Postgres password, Telegram token) already avoid
  printing values in logs and schemas.

### The full compose stack

Today `docker-compose.yaml` has just `db`. The deploy stack adds a backend
service and a proxy. To read it, you need how services find each other: on a
Docker network, every service is reachable from other services by its *name*.
So the backend connects to Postgres via `db` — no `localhost`, no published
port — and the proxy reaches the backend via `backend`. These names work
exactly like hostnames; the "address" is `service-name:port` (e.g.
`backend:8000`). That is why published ports become unnecessary on the
private network: the name is the address.

- **`backend`** is built from the multi-stage Dockerfile, declares
  `depends_on: db` with `condition: service_healthy`, runs migrations then
  uvicorn on the private network, and publishes **no port** to the host —
  the proxy reaches it by service name.
- **`proxy`** (Caddy or nginx) publishes the *only* ports: `:443` (and `:80`
  for the redirect), and declares `depends_on: backend`.
- The Postgres port is currently published for dev convenience
  (`"${POSTGRES_PORT}:5432"`). In production you stop publishing it — nothing
  outside the private network should reach the DB. (Keep a dev compose or a
  flag if you still want local `psql`.)
- **Volumes** — containers are temporary: when one is deleted, everything
  written inside it disappears. A volume is storage *outside* the container
  that survives its life. Postgres data and TLS certs are exactly the kind of
  thing you never want to lose on a restart, so they live in volumes: the
  Postgres data volume already exists, and you add one for the proxy's cert
  storage.
- **Restart policy** — `restart: always` on services (already on `db`) so the
  stack comes back up after a reboot or crash.

### Startup order and migrations

The backend must run `alembic upgrade head` **before** serving, and only
after the DB is healthy. Two patterns exist. The **entrypoint script** — the
image's `CMD` runs a small `entrypoint.sh` that does `alembic upgrade head`
then `uvicorn ...` — is simple, and the DB healthcheck in compose makes sure
Postgres is accepting connections first. The **sidecar** is a separate
one-shot container that migrates, and the app depends on it: cleaner
separation, more moving parts. For Pynance the entrypoint script is enough.

One nuance about migrations and volumes. If the `postgres_data` volume is new
(the first deploy), the database is empty and `upgrade head` applies all
migrations from scratch. If the volume already has your data (you moved the
app to a server), the same command applies only the migrations that haven't
run yet. Alembic tracks what has been applied, so the command is safe either
way — it never re-runs an applied migration.

### Operational surprises from running it

Two things only show up when you actually run the stack:

- **Restarting the DB under a live backend gives transient 500s.** If you
  `docker compose restart db` while the backend keeps running, its connection
  pool holds dead connections, and requests fail for a short window with
  `AdminShutdown` errors before the pool rebuilds. Not a bug — the pool
  recovers by itself. Just don't panic; re-issue the request or wait a second.
- **Running compose without the dev override drops the published DB port.**
  `docker compose up` uses the base (prod) file by default — the one that
  does *not* publish the Postgres port. So `docker compose --profile bot up`
  or any plain `up` recreates the DB container without `5432` exposed, and
  your local `psql`/`pytest` suddenly can't connect. The fix is
  consistency: always start with `-f docker-compose.yaml -f
  docker-compose.dev.yaml` in dev (or `--profile bot` on top of both).

---

## The hardening checklist

Things that are fine on `localhost` and wrong on the internet, each already
touched by earlier modules or this one:

- **TLS everywhere** (proxy) plus the `http→https` redirect.
- **`Secure` session cookie** in prod (this module).
- **Host header allow-list** with the real domain (`TrustedHostMiddleware`).
- **No published Postgres port**; the DB only on the private network.
- **Non-root user** in the backend image.
- **Secrets only via environment**; `.env` gitignored; `.env.example` has
  names only.
- **Logs go to stdout** (already done), which the proxy and the Docker
  runtime collect — no file logging inside the image.
- **`X-Forwarded-For` trusted** so logs show real client IPs.
- **Security headers** at the proxy — HSTS (so browsers only ever use HTTPS)
  and `X-Content-Type-Options: nosniff`. Both are a few lines in Caddy or
  nginx. They belong to the proxy, not the app (ADR 0006 reserved this for
  the proxy).

Deliberately out of scope for now (no need at this scale): rate limiting at
the proxy (fine to note for later), a monitoring stack (Prometheus/Grafana),
and multi-instance scaling.

---

## Pitfalls (recap)

1. **Building instead of copying** — dev deps (ruff/mypy/pytest) end up in
   the runtime image. Multi-stage + `--no-dev` fixes it.
2. **Secrets in image layers** — anything `ENV`/`COPY`-ed into a build stage
   that isn't the final stage still leaks via the layer cache. Only pass
   secrets at run time via environment.
3. **Cookie without `secure` over HTTPS** — the session cookie works on
   localhost and *looks* fine in prod, but should be `Secure`. Gate on a
   setting, don't hardcode.
4. **`allowed_hosts` not updated** — the app 400s every real request until
   the domain is added. Easy to miss because localhost tests pass.
5. **Postgres port published in prod** — the DB must not be reachable from
   the internet. Stop publishing it in the deploy compose.
6. **Wrong client IPs** — without `--proxy-headers`/trusted proxy IPs, the
   backend logs the proxy as every client. IPs matter for security later.
7. **Running as root** — an exploited app gives root. `USER` non-root in the
   runtime stage.
8. **TLS is not "nice to have"** — it's what makes the auth cookie and the
   whole deployment safe. No TLS = don't deploy. Caddy makes it free and
   automatic.

---

## The exercise

**Part A — package the backend.** Write a multi-stage `backend/Dockerfile`:
a build stage (python 3.14, uv, `uv sync`) and a runtime stage that copies
only runtime deps + code, runs non-root, and includes an `entrypoint.sh`
running `alembic upgrade head` then uvicorn. Add `backend/.dockerignore`.

**Part B — package the frontend.** Write a multi-stage `frontend/Dockerfile`
that builds `dist/` with Node. Decide and record (see the ADR step) whether
the frontend files land in the backend image (single-origin, recommended) or
in their own container. If single-origin, **also implement the static
serving in the API** (see "The backend serves the frontend is code you must
write" above): mount `assets/`, add the SPA catch-all *after* the API
routers, and guard it so it's a no-op when `frontend-dist/` doesn't exist.

**Part C — full compose.** Extend `docker-compose.yaml` into the deploy
stack: `db` (keep, but make the port configurable/optional), `backend`
(private network, `depends_on: db` healthy, restarts), `proxy` (only
published `:443`/`:80`, cert volume). Stop publishing the Postgres port in
the prod compose.

**Part D — the prod-only config knobs.**
- Add a setting (e.g. `secure_cookies: bool`) and make `login`'s
  `set_cookie` use `secure=settings.secure_cookies`. Keep it `False` for
  local dev, `True` in prod `.env`.
- Set `ALLOWED_HOSTS` in the prod `.env` to your domain.
- Run uvicorn with `--proxy-headers` (and scope `--forwarded-allow-ips` to
  the proxy's network) in the container CMD.

**Part E — hardening at the proxy.** In the proxy config: `http→https`
redirect, HSTS + `X-Content-Type-Options: nosniff` headers, and (Caddy)
auto-TLS. Verify with `https://your-domain/api/health` returning
`{"status":"ok"}`.

Tooling checkpoints (from the repo root):

```bash
docker compose build
docker compose up -d
docker compose ps            # all healthy/running
curl -k https://localhost/api/health   # or https://your-domain if DNS is set
```

Test the flow end to end: register a user, log in (the cookie should be
`Secure` in devtools), import your spreadsheet, see the dashboard. Then check
the backend logs show *real* client IPs (not the proxy's), and
`https://your-domain` redirects to HTTPS.

## After you're done

Write **ADR 0007** recording the deploy architecture decisions: the reverse
proxy choice (Caddy vs nginx) and why; where the frontend lives
(single-origin in the backend image vs separate container);
secrets-only-via-environment; Postgres port not published; `secure_cookies`
gated on a setting. Use the standard ADR template (Context, Decision,
Alternatives considered, Consequences).