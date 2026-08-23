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
  the template. (All confirmed at module start; wiki: `04-recurring-transactions.md`.)

**Dependencies:** only `Transaction` + `Category` (no assets needed).

**Design questions open:** whether a template targets an asset once assets
exist (slot left for it).

---

## 2. Assets — `in progress`

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
  asset, plus **transfers** between assets (the transfer concept returns —
  it was deferred in Module 2).
- Transaction gains a **required** `asset_id` (default Liquid, existing rows
  backfilled); **transfers are a separate two-FK entity** (source/destination),
  editable/deletable, self-transfer forbidden.
- Recurring-template asset integration is **deferred** to a later decision.

**Dependencies:** the asset decision is an ADR + wiki (it reverses the
"no accounts" call from Module 2).

---

## 3. Net worth — `planned`

**Goal:** total of all asset balances.

- Sum of asset balances, presented over time (trend) later.

---

## 4. Allocation view — `planned`

**Goal:** "where my money is" (Liquid / Savings / ETF / Bonds ...).

- Group-by asset type over balances — a pie/breakdown, per the asset types
  already modeled.

---

## Deferred (explicitly out of scope for now)

| Feature | Why deferred | When it might return |
|---|---|---|
| **Budgets** (planned vs actual per category) | User doesn't budget currently | If budgeting becomes a need; slots on top of `summary-by-category` |
| **Forecasting / projections** | Needs budgets + recurring + assets | After 1–4 above |
| **Interest rates on assets** | The app records what *is*, it doesn't simulate what *will be*; banks compute balances | "Advanced" section; a rate field + an accrual generator |
| **Investment holdings / performance** (quantity × price per fund) | Price feeds, cost basis — a rabbit hole | If ever; allocation (step 4) covers the near-term need |
| **Multi-currency** | Single currency (ADR 0001); investments may strain it | When a real multi-currency asset appears |

---

## Ordering rationale

Recurring (step 1) is self-contained and doesn't need assets. Assets (step 2)
are the foundation for everything money-location related. Net worth (3) is a
simple derivation over 2. Allocation (4) is a grouping over 2. Steps 2–4 are
one coherent "where is my money" module; step 1 can land before or alongside
it.
