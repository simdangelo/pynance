# Product Roadmap — Pynance

The **learning roadmap** (backend modules) lives in `AGENTS.md` and is fixed.
This document tracks the **product feature plan**: the business capabilities
being built on top of the learning modules. It is the source of truth for
"What the app should do next" — ordered by dependency, not by module.

Status legend: `planned` → `in progress` → `done`.

---

## 1. Recurring transactions — `done`

**Goal:** record payments/income that repeat (rent, salary, subscriptions)
without re-entering them.

**Design decisions (made):**
- A recurring item is a **template** (description, amount, category,
  frequency, next occurrence) that **generates normal transactions** — the
  generated rows are ordinary transactions: editable, deletable, reportable.
- **Generation is on-demand, not automatic** — the user triggers "generate
  next occurrence". No scheduler, no silent duplication. Skipping a month is
  trivial.
- **Due detection is a backend-computed field**: each template exposes
  `next_occurrence` and `due` (`next_occurrence <= today`), so the frontend
  can show "Rent is due — record it?" without computing business logic
  itself.
- Frequencies: monthly/weekly/yearly + custom interval. Generate-next
  advances the template's pointer. Generated rows are fully independent of
  the template.

**Dependencies:** only `Transaction` + `Category` (no assets needed).

**Design questions open:** whether a template targets an asset once assets
exist (slot left for it).

---

## 2. Assets & transfers — `done`

**Goal:** model *where money is* (the foundation for net worth and
allocation).

**Design decisions (made):**
- **One `Asset` table** with a `type` enum (`liquid`, `savings`, `etf`; more
  values can be added later) and a name. Flexibility comes from data, not
  schema: adding bitcoin later = adding an enum value; splitting Liquid into
  two bank accounts = adding a row.
- **Cash/bank/debit/prepaid/PayPal collapse into a single `Liquid` asset.**
  No per-bank split for now (add rows later if needed).
- **Balances are derived from transactions**, not stored: income/expense per
  asset, plus **transfers** between assets.
- Transaction has a **required** `asset_id`; **transfers are a separate
  two-FK entity** (source/destination), editable/deletable, self-transfer
  forbidden.
- Recurring-template asset integration is **deferred** to a later decision.

**Dependencies:** the asset decision is an ADR + wiki (it reverses the
"no accounts" call from Module 2).

---

## 3. Net worth — `done`

**Goal:** total of all asset balances.

- Sum of asset balances, presented **over time** (trend) on the dashboard's
  "Net worth" tab, with a configurable time range (ALL/5Y/1Y/YTD).

---

## 4. Allocation view — `done`

**Goal:** "where my money is" (Liquid / Savings / ETF / Bonds ...).

- Group-by asset type over balances — a donut chart on the dashboard,
  per the asset types already modeled.

---

## 5. User accounts (auth) — `done`

**Goal:** real per-user accounts, so each person's data is private and the
app is no longer a single-user tool.

**Design decisions (made):**
- **HttpOnly-cookie server-side sessions**, not JWT (revocable, XSS-safe at
  this scale). Argon2 password hashing. Registered in ADR 0005.
- **Every entity is scoped by `user_id`**; cross-user access returns 404
  (doesn't reveal existence).
- Single-origin app (ADR 0006): no CORS work needed.

**Dependencies:** this was a learning module (Module 5) and a product
capability at once.

---

## 6. Telegram bot — `done` (single-user), `planned` (multi-user)

**Goal:** register transactions from the phone, without opening the PC, so
nothing gets forgotten.

**Design decisions (made, v1 single-user):**
- **Structured commands**: `/expense 5.50 groceries`, `/income 100 salary`,
  `/balance`. Parsing is explicit and unambiguous.
- The bot is a **separate process using long-polling** (no webhook/HTTPS).
- It is a **third presentation layer**: it calls the same service layer,
  never re-implementing business logic.
- Identity: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ALLOWED_CHAT_ID`; any other
  chat is ignored.
- **Scope (v1):** expense, income, balance.

**Multi-user future (planned):** map `chat_id → user` with a "connect your
Telegram account" flow; the single-user `TELEGRAM_ALLOWED_CHAT_ID` gives way
to a link between the chat and a logged-in account. This is the natural next
step now that auth (step 5) exists.

---

## 7. Import from CSV/Excel — `done`

**Goal:** bulk-load transactions from a spreadsheet instead of entering them
one by one.

**Design decisions (made):**
- **CSV and `.xlsx`** accepted; preview of the first rows before importing.
- Amount parsing accepts both European (`1.234,56`) and dot-decimal
  (`2.50`) formats.
- Import is **scoped to the current user** and creates categories/assets as
  needed; reports how many rows were imported/skipped.

---

## 8. Production deployment — `done`

**Goal:** make the app reachable on the internet.

**Design decisions (made):**
- **Single origin**: the backend image serves both the API and the built
  frontend (ADR 0007). One service, one URL, no CORS.
- **PaaS (Render)**: free tier, HTTPS automatic. See ADR 0007 and the
  deploy journal.
- **CI via GitHub Actions** (ruff, mypy, pytest) on every push; **CD via
  the platform** on push to `main`.

**Open items:** the Render free Postgres expires after 90 days — move to a
permanent free Postgres (Neon/Supabase) by changing `DATABASE_URL` only.

---

## Deferred (explicitly out of scope for now)

| Feature | Why deferred | When it might return |
|---|---|---|
| **Telegram bot in production** | Not part of the first deploy (long-polling process doesn't fit a plain web service) | After the multi-user bot (step 6) and a decision on how to run it in prod |
| **Budgets** (planned vs actual per category) | User doesn't budget currently | If budgeting becomes a need; slots on top of `summary-by-category` |
| **Forecasting / projections** | Needs budgets + recurring + assets | After 1–8 above |
| **Interest rates on assets** | The app records what *is*, it doesn't simulate what *will be*; banks compute balances | "Advanced" section; a rate field + an accrual generator |
| **Investment holdings / performance** (quantity × price per fund) | Price feeds, cost basis — a rabbit hole | If ever; allocation (step 4) covers the near-term need |
| **Multi-currency** | Single currency (ADR 0001); investments may strain it | When a real multi-currency asset appears |

---

## Ordering rationale

Recurring (step 1) is self-contained and doesn't need assets. Assets (step 2)
are the foundation for everything money-location related. Net worth (3) and
allocation (4) are simple derivations over 2. Auth (5) is the prerequisite
for any multi-user feature (including the bot). Import (7) and the deploy
(8) are enabling capabilities. The next feature work sits on top of these:
multi-user bot, then the long-deferred product features as needs appear.