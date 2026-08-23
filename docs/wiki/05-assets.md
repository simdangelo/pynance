# Module 5 — Assets: where your money lives

The second *product* feature (tracked in `docs/ROADMAP.md`). Recurring
transactions handled *when* money flows; Assets handles *where* it sits. This
module introduces two new ideas: a **place to put money** (assets) and a
**movement between places** (transfers). It reverses an early call — Module 2
deliberately skipped accounts. This is what "keeping an eye toward
`owner_id`-style relationships without adding them prematurely" looks like in
practice: the schema grew in the right shape first, and now the concept lands
cleanly on top.

This file is self-contained: read it, then do the exercise at the bottom.

---

## The problem

A transaction record says *what* happened (€4.50, groceries). It never says
*where* the money was. For budgeting that's fine, but for "do I have enough
for rent this month?" you need to know how much sits in your checking account
versus your savings. And you want that answer *now*, at a glance.

Two traps await any naive solution:

1. **Storing balances.** "Current balance: €1,234.56" looks harmless, but a
   balance is a *derived* value — a function of every past transaction. Store
   it and you have the same denormalized-duplicate problem ADR 0003 killed on
   `transaction_type`: two sources of truth that must be kept in sync, with
   drift bugs lurking in the sync.
2. **Modeling a transfer as a transaction.** "Move €500 from checking to
   savings" is *not* income or expense. It's a rebalancing. Force it into the
   transaction table and you're back to the ADR 0003 trap (is it income or
   expense? what category?) — or you hack around it.

## The concept: assets, and transfers

### Asset — a named money pool

One table, `Asset`:

```
Asset
├── id
├── name              (unique — "Checking", "Emergency fund")
├── type              (enum: liquid / savings / etf)
├── opening_balance   (decimal, default 0 — see "Opening balances" below)
└── created_at
```

Flexibility comes from *data*, not schema: two bank accounts = two rows with
type `liquid`. Adding a new kind of pool later (crypto, bonds) = one new enum
value. No schema surgery.

The type is a **classification**, not a behavior switch. The app treats all
assets the same; the type is there for grouping, reporting, and (later) the
allocation view.

### Transaction gains a home

Every transaction belongs to an asset — money came from somewhere and went
somewhere. `Transaction` gains `asset_id` (FK → assets), **required**, with a
convention that the default is a single `liquid` asset. For most people almost
every transaction lands in the same pool; that's fine. The column earns its
keep the moment a bonus is paid into savings or you pay a bill from a
different account.

### Transfer — movement between pools

A transfer is its own entity, not a transaction:

```
Transfer
├── id
├── source_asset_id      (FK → assets)
├── destination_asset_id (FK → assets)
├── amount
├── description
├── occurred_on
└── created_at
```

- `source != destination` — a self-transfer is meaningless; reject it.
- No category, no income/expense. It only rebalances where money sits.
- It's editable and deletable like a transaction — you can record it wrong and
  fix it.

## Balances: derived, never stored

The rule from ADR 0003 and the recurring module's `due` flag applies again:
**a balance is a computation, not a column.**

For one asset:

```
balance = opening_balance + (income transactions in asset − expense transactions in asset)
          + (transfers in) − (transfers out)
```

The `opening_balance` is the asset's **initial condition** — the amount that
was in it before you started tracking transactions (most accounts predate the
app; without a seed they'd show a wrong near-zero balance). It's an editable
field on the asset, default 0, and it's a *fact* (the seed), not a derived
value — so it doesn't violate the no-stored-balances rule. It's how an
account you've had for years still shows its real balance: you set the seed
once, and transactions build on it from there.

Honest limitation: balances are only reconstructible from the start of
tracking onward. The opening balance pins the account at that moment; the
period before it is unrecoverable (the data never existed). What you get is a
correct *current* and *future* net worth plus a correct trend from your
tracking start date.

Two consequences fall out:

- **Net worth** is just the sum of all asset balances.
- A transfer changes two balances but **not** net worth — money moved, not
  gained or lost. That's the invariant that keeps the model honest.

Where does this computation live? The **service layer**, per the architecture:
a service function computes balances from the models, the API shapes them into
`AssetResponse`. No stored columns, no DB triggers, no magic.

## The API shape

```
# Assets
POST   /assets          → 201, the asset (with balance)
GET    /assets          → list (each with balance)
GET    /assets/{id}     → 200 (with balance)
PATCH  /assets/{id}     → 200
DELETE /assets/{id}     → 204 (409 if the asset has transactions/transfers)

# Transfers
POST   /transfers              → 201
GET    /transfers              → list
GET    /transfers/{id}         → 200
PATCH  /transfers/{id}         → 200 (re-validates source != destination)
DELETE /transfers/{id}         → 204

# Transactions (existing, extended)
POST/PATCH/GET ... /transactions  → now include asset_id (required on create)
```

Notes:

- **Deleting an asset** is dangerous if money references it: refuse with 409
  until its transactions/transfers are moved. Same spirit as the
  category-with-transactions rule.
- **Balances on responses**: each `AssetResponse` carries its computed
  balance. The frontend renders, the backend computes — the standing rule.
- Reports (`summary`, `trend`, ...) don't change: they measure flow by
  category, which assets don't affect.

## Service layer — how to structure the functions

Follow the naming convention in `docs/NAMING.md`. Two service files, one per
entity, mirroring the models:

### `services/asset.py`

```
create_asset(db, AssetCreate)            -> Asset
get_asset(db, asset_id)                  -> Asset          (raises if missing)
list_assets(db)                          -> list[Asset]
update_asset(db, asset_id, AssetUpdate)  -> Asset          (raises if missing)
delete_asset(db, asset_id)               -> Asset          (raises if missing / referenced)
get_asset_balance(db, asset)             -> Decimal
get_asset_balances(db)                   -> dict[asset_id, Decimal]  (or parallel list)
```

Details worth thinking about:

- **`get_asset_balance` is the interesting function.** It reads two things:
  1. the net of the asset's **transactions**: sum(income) − sum(expense), and
  2. the net of its **transfers**: sum of amounts transferred in − sum
     transferred out.
  Add them and return the `Decimal`. You can do this as two aggregate queries
  (`func.sum`), or compute one `balance` per asset for *all* assets in a
  single pass (`get_asset_balances`) and have `get_asset_balance` reuse it —
  the single-pass version is the better default because it's one round-trip
  and it's what the list endpoint needs.
- **Sign of transactions comes from the category** (ADR 0003). Don't read a
  stored `transaction_type` — join through `Category.transaction_type` and
  add income, subtract expense. (Same pattern as `get_summary` in
  `services/transaction.py`.)
- **Sign of transfers is directional**: `destination == asset` adds,
  `source == asset` subtracts. A transfer contributes to *two* balances with
  opposite signs — that's exactly why net worth stays flat.
- **`delete_asset` has a guard**: before deleting, check whether any
  transaction or transfer references the asset. If yes, raise a domain
  exception (→ 409). One query each on `Transaction.asset_id` and
  `Transfer.source/destination` — or a single `select(func.count())`-style
  check. Don't let the DB orphan rows.
- **`update_asset`** is plain field copying (`model_dump(exclude_unset=True)`
  pattern, like the other update services). Renaming an asset does not touch
  its transactions — they reference by id.
- **`name` uniqueness**: `create_asset` should check for a duplicate name and
  raise a domain exception → 409 (mirror the category duplicate-name rule).
  The DB unique constraint is the backstop; the service gives the friendly
  error.

### `services/transfer.py`

```
create_transfer(db, TransferCreate)            -> Transfer  (validates source/destination)
get_transfer(db, transfer_id)                  -> Transfer  (raises if missing)
list_transfers(db, filter_params)              -> list[Transfer]
update_transfer(db, transfer_id, TransferUpdate) -> Transfer (re-validates)
delete_transfer(db, transfer_id)               -> Transfer  (raises if missing)
```

Details:

- **The self-transfer guard lives in the service**, not just the DB
  `CheckConstraint`. The constraint stops bad rows; the service turns a bad
  request into a clean `422`/domain exception with a readable message. Check
  `source != destination` on **create** and again on **update** (an update can
  change either side into the other). `Pydantic` field validation can't help
  here cleanly because the two ids come as separate fields — so validate in
  the service.
- **Both referenced assets must exist** on create and update — raise
  asset-not-found → 404 (check both, and be precise about which one).
- **`list_transfers` filters** mirror `list_transactions`: an optional
  `year`/`month` range on `occurred_on` (and remember the
  `MonthWithoutYearError` convention — month without year is an error). Use a
  `TransferFilters` dataclass in the service, matching `TransactionFilters`.
- **`delete_transfer`** has no cascade concerns — transfers reference assets,
  not the other way. Deleting a transfer just removes a movement.

### Domain exceptions (`services/exceptions.py`)

Add, following the existing naming (name ends in `Error`, plain `Exception`
subclass):

```
AssetNotFoundError            -> 404
TransferNotFoundError         -> 404
DuplicateAssetNameError       -> 409
SelfTransferError             -> 422 (or 400; pick one and be consistent)
AssetInUseError               -> 409  (delete refused while referenced)
```

Consistency note: decide whether validation failures are `422` or `400` and
use the same choice as the existing category/transaction services. The app
already uses 409 for duplicate names and "has transactions" — reuse those
codes for the analogous asset cases.

## API layer — thin routers

Two new router files: `api/routers/asset.py` and `api/routers/transfer.py`,
registered in `api/main.py`:

```
POST   /api/assets        create_asset        -> 201 AssetResponse
GET    /api/assets        list_assets         -> 200 list[AssetResponse]
GET    /api/assets/{id}   get_asset           -> 200 AssetResponse
PATCH  /api/assets/{id}   update_asset        -> 200 AssetResponse
DELETE /api/assets/{id}   delete_asset        -> 204

POST   /api/transfers     create_transfer     -> 201 TransferResponse
GET    /api/transfers     list_transfers      -> 200 list[TransferResponse]
GET    /api/transfers/{id} get_transfer       -> 200 TransferResponse
PATCH  /api/transfers/{id} update_transfer    -> 200 TransferResponse
DELETE /api/transfers/{id} delete_transfer    -> 204
```

Router rules (same as every other router):

- **No business logic, no queries, no `db.add`/`commit`.** Each endpoint
  calls exactly one service function and translates the result into a
  response schema. The `Session` only enters as `Depends(get_db)`.
- **Error translation**: wrap the service call in `try/except` mapping each
  domain exception to an HTTP code with a short `detail`. This is the only
  place `HTTPException` appears. (Look at how the recurring-template router
  translates its exceptions for the pattern.)
- **`AssetResponse` must carry the computed `balance`.** The router gets the
  asset from the service, calls `get_asset_balance` (or gets it from the
  bulk result), and builds the response. The balance is business logic — it
  must come from the service, never be re-derived in the router.
- **Transactions router change**: add `asset_id` to `TransactionCreate` /
  `TransactionUpdate` / `TransactionResponse` and to the transaction
  create/update services (validate the asset exists → 404). That's the only
  change to existing routes.

### Schemas (`schemas/asset.py`, `schemas/transfer.py`)

Follow the `Base`/`Create`/`Update`/`Response` naming (see the recurring
template schemas). `AssetResponse` adds `balance: Decimal` plus
`ConfigDict(from_attributes=True)`. `TransferResponse` references asset
**ids** (`source_asset_id`, `destination_asset_id`) — keep it to ids, the
frontend resolves names like it does for categories.

## Design decisions (recorded in ADR 0004)

- One `Asset` table + type enum (flexibility from data).
- Balances **derived**, never stored.
- `Transfer` as a **separate two-FK entity** — not a transaction type, not a
  category.
- `Transaction.asset_id` **required**; existing rows backfilled to the default
  liquid asset.
- Self-transfers **forbidden**; transfers **editable/deletable**.
- Recurring templates are **not** touched in this module (deferred — see the
  roadmap's open slot).

## Pitfalls

- **Storing a balance column** — the denormalized-duplicate trap again. Never.
  Compute on read.
- **Modeling transfers as transactions** — breaks the income/expense model and
  ADR 0003's single-source-of-truth. Keep them separate.
- **Sign conventions** — income/expense sign comes from the category (ADR
  0003); transfers sign comes from direction (in = +, out = −). Don't mix the
  two rules.
- **Forgetting the backfill** — adding a NOT NULL `asset_id` to a table with
  rows requires the migration to create the default asset and backfill before
  the constraint can be applied. Order matters in the migration.
- **Self-transfer slipping through** — validate in the service (`source !=
  destination`), both on create *and* on update.
- **Deleting an asset with references** — check for transactions/transfers
  first; refuse loudly rather than orphan rows.

---

## What to do on your own (the exercise)

1. **Model** — `Asset` and `Transfer` in `models/asset.py` and
   `models/transfer.py` (one file per entity, facade `__init__` per
   convention). Add `asset_id` to `Transaction`. `AssetType` enum alongside
   the others in `models/types.py`. Migration via Alembic (generate, review —
   **check the backfill order** — apply).
2. **Service** — `services/asset.py` (CRUD + `get_asset_balance(s)` + the
   delete guard + duplicate-name check) and `services/transfer.py` (CRUD +
   the self-transfer guard + asset-existence checks), following the detailed
   guidance above. Add the four domain exceptions.
3. **API** — thin `asset` and `transfer` routers with error translation;
   `asset_id` threaded through the existing transaction create/update/read
   path. Balances computed in the service, surfaced on `AssetResponse`.
4. **Tests** — asset CRUD + 404s + duplicate-name 409 + delete-refused 409;
   transfer CRUD + 404s + self-transfer 422 + unknown-asset 404; **the balance
   math** (income/expense mix + transfers in/out; net worth = sum of
   balances; a transfer leaves net worth unchanged); transaction create/update
   with `asset_id`; unknown asset → 404.

Send me your code when done. The next module (Net worth) is a derivation over
what you build here.
