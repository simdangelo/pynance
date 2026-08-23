# ADR 0004 — Assets and transfers

## Status
Accepted

## Context
Transactions record *what* happened but never *where* the money was. The app
can say "you spent €450 last month" but not "you have €1,200 in checking."
Module 2 deliberately deferred accounts; this ADR reverses that call now that
the transaction model is stable (ADR 0003 gave it a clean direction model).

Two design traps had to be avoided explicitly:

1. **Storing balances.** A balance is a derived value (a function of every
   past transaction). Storing it creates a denormalized duplicate with a
   sync burden and drift bugs — the exact failure class ADR 0003 removed from
   `transaction_type`.
2. **Modeling a transfer as a transaction.** Moving money between accounts is
   neither income nor expense. Forcing it into `transactions` breaks ADR
   0003's single-source-of-truth for direction, or requires a hacky
   "transfer" category.

## Decision
- **One `Asset` table** with a `type` enum (`liquid`, `savings`, `etf`) and a
  unique name. Flexibility comes from data (new pools = new rows; new kinds =
  one enum value), not schema.
- **Balances are derived, never stored.** A service computes
  `balance = (income − expense in transactions) + (transfers in) −
  (transfers out)` per asset; the API exposes it on `AssetResponse`.
  Net worth = Σ asset balances.
- **Each asset has an optional `opening_balance`** (NOT NULL, default 0),
  editable like any field. It is the asset's initial condition — the amount
  that existed before transaction tracking began — and the balance formula
  includes it:
  `balance = opening_balance + (income − expense) + (transfers in) −
  (transfers out)`. It is a *fact* (the seed), not a derived value, so it
  does not violate the no-stored-balances rule. Without it, an account that
  predates tracking would show a wrong (near-zero) balance.
  **Limitation accepted:** balances are only reconstructible from the
  tracking start onward; the period before that is unrecoverable by any
  design.
- **`Transfer` is a separate two-FK entity** (`source_asset_id`,
  `destination_asset_id`, `amount`, `description`, `occurred_on`), not a
  transaction type and not a category. It has no category and no income/expense
  semantics — it only rebalances pools.
- **`Transaction.asset_id` is required**, FK → assets. A default `liquid`
  asset is created in the migration and all existing transactions are
  backfilled to it.
- **Self-transfers are forbidden** (`source != destination`), validated in the
  service on create *and* update (422/400).
- **Transfers are editable and deletable** like transactions.
- **Deleting an asset with references is refused** (409) until its
  transactions/transfers are moved, mirroring the category-with-transactions
  rule.
- **Recurring templates are not touched** in this module. The roadmap's open
  slot (templates targeting an asset, or transfer templates) stays open and is
  a later, separate decision.

## Alternatives considered
- **Storing `balance` on `Asset`** — rejected: denormalized duplicate with the
  ADR 0003 drift problem.
- **Transfer as a transaction with a transfer category** — rejected: breaks
  the income/expense model, requires a category that means nothing for
  reporting, and cannot naturally express a two-sided movement.
- **Two linked `Transaction` rows for a transfer** (outflow + inflow) — would
  pollute transaction reports and category stats with non-spending entries.
  Rejected in favor of a dedicated entity.
- **`asset_id` optional** — rejected: creates a permanent "unassigned" bucket
  whose money silently drops out of balances. Required with Liquid default
  matches how the owner actually uses the app and keeps balances complete.

## Consequences
- New `assets` and `transfers` tables; `transactions.asset_id` NOT NULL; a
  backfill migration (create default liquid asset → backfill → apply
  constraint).
- Transaction create/update now require a valid `asset_id` (404 if unknown);
  the API contract on read includes `asset_id`.
- A transfer changes two asset balances but not net worth — a checkable
  invariant in tests.
- Reports (summary/trend) are unchanged: they measure category flow, which
  assets don't affect.
- Slightly more complex reads (balance computation per asset), accepted for a
  single-user app.

## Supersedes
- The "no accounts" stance from **Module 2** (not itself an ADR).

## References
- ADR 0001 (money as Decimal), ADR 0003 (direction derived from category) —
  the transfer sign conventions build on both.
