# ADR 0005 — HttpOnly cookie server-side sessions (not JWT)

## Status
Accepted

## Context
Pynance gains real user accounts (Module 5 / wiki 07). The app is currently
single-user; the goal is to deploy it publicly as a small, single-instance
service. Two session mechanisms were candidates: server-side sessions in an
HttpOnly cookie, and JSON Web Tokens (JWTs).

The deciding factors were security and revocation:

- **Revocation.** A server-side session can be deleted instantly (logout, log
  out everywhere, revoke a compromised session). A JWT is self-contained and
  remains valid until it expires, so revocation requires a blacklist or
  waiting out the expiry.
- **XSS exposure.** The session token lives in an **HttpOnly** cookie, which
  JavaScript cannot read. JWTs are commonly stored in `localStorage`, which
  JS *can* read — so an XSS hole can exfiltrate the token.
- **Simplicity.** HttpOnly cookie + a DB row is easy to reason about and
  debug. JWT introduces refresh tokens, expiry handling, and signing-key
  management.

JWT's real advantage — statelessness and horizontal scale — only matters for
an application that runs across many server instances. Pynance, even in a
public production deployment, is a single-instance service, so that
advantage does not apply.

## Decision
- **Authentication uses server-side sessions.** A `sessions` table maps a
  random token to a user; login creates a row, logout deletes it.
- **The token is delivered in an `HttpOnly` cookie** with `Secure` (in prod)
  and `SameSite=Lax` for CSRF protection. The cookie is set on login and
  cleared on logout.
- **Passwords are hashed** with Argon2 (via `argon2-cffi`), never stored or
  logged in plaintext. A `User` table holds `email` (unique),
  `password_hash`, `created_at`.
- **`get_current_user` is a dependency** resolving the user from the cookie +
  session; it gates all protected routes and passes `user_id` down to service
  functions.
- **Cross-user access returns 404, not 403.** If a row exists but belongs to
  another user, the service behaves as if the row does not exist. This avoids
  leaking that another user's data exists at all — the safer choice for
  private finance data (the reference project used 403, which is more
  explicit but reveals existence; we diverge deliberately).
- **All existing entities gain a `user_id` FK** (transactions, categories,
  assets, transfers, recurring templates). Services scope every query by
  `user_id`; create sets it; get/update/delete return 404 when the row isn't
  the caller's. The migration backfills existing rows to the current single
  user, then makes the column NOT NULL.

## Alternatives considered
- **JWT in `localStorage`** — rejected: non-revocable, and the token is
  readable by JS (XSS risk). The stateless benefit is irrelevant at this scale.
- **JWT in an HttpOnly cookie** — a hybrid that fixes XSS but still has the
  revocation problem. Rejected because revocation was the stronger argument
  for server-side sessions.
- **Single shared password / no accounts** — rejected: the module's goal is
  per-user data, which real accounts are required for.

## Consequences
- A DB lookup per authenticated request (accepted: negligible at this scale).
- One new `users` + `sessions` table, and `user_id` added to five entities
  with a backfill migration.
- Every existing service function, router, and test must be updated to pass
  and enforce `user_id` — the bulk of the work.
- The frontend gains a login/register screen (agent-written) and must send
  the cookie (same-origin via the existing Vite proxy / FastAPI static
  serving, so no CORS work needed).

## References
- Wiki: `docs/wiki/sessions-jwt-vs-cookies.md`
- Reverses the implied single-user assumption from earlier modules; the
  deferred `owner_id` guidance in AGENTS.md is now realized.
- Idioms adapted from the reference FastAPI tutorial at
  `/home/mrbeaver/dev/fastapi-tutorial-by-corey-schafer` (pwdlib/Argon2
  hashing, `CurrentUser` annotated dependency, scoping on write,
  case-insensitive login, "incorrect email or password"). That project uses
  JWT Bearer tokens; we reuse its structure but keep **cookie sessions** for
  the reasons above — the tutorial is a public blog (posts readable by
  everyone), whereas Pynance is private finance data.
