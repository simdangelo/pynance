# ADR 0009 — Asset taxonomy and buckets: two independent axes

## Status
Accepted

## Context
The current asset model has a single `AssetType` enum (`liquid`, `savings`,
`etf`) on `Asset` (ADR 0004). That one field answers two different questions
at once:

- **what the instrument is** — `etf` is a nature, a fact of the domain;
- **what the money is for** — `liquid` / `savings` are roles, i.e. how the
  owner treats that money.

The conflation worked while the app only tracked a checking account and a
savings account, but it has no answer for a money-market ETF: it is an ETF by
nature, while its role is a liquidity parking (or an emergency reserve, or a
short-term investment — depending on the owner). The same instrument can play
different roles for different people, and one enum cannot express that.

The need behind this change is concrete: the owner is starting to invest
(deposit accounts, money-market / bond / equity ETFs, single bonds) and wants
to open the app and immediately read **how much is spendable, how much is a
safety reserve, how much is invested** — a question the current three-value
enum answers badly. Any fixed "strategy" taxonomy (e.g. the popular 4-pillar
approach) was explicitly rejected as a schema foundation: it is a planning
heuristic, not a data taxonomy, and would have to be migrated the day the
strategy changes.

## Decision
Model the domain with **two independent axes**:

- **`AssetClass`** (objective taxonomy, code-owned, extensible): what the
  instrument is — `CURRENT_ACCOUNT`, `DEPOSIT_ACCOUNT`, `MONEY_MARKET_ETF`,
  `GOVERNMENT_BOND`, `CORPORATE_BOND`, `BOND_ETF`, `EQUITY_ETF`, `STOCK`,
  `OTHER`. Stored as a
  **non-native enum** (`Enum(..., native_enum=False, create_constraint=True,
  length=32)` → `VARCHAR` + `CHECK`) because this taxonomy is expected to
  grow, and native Postgres enums make adding values painful
  (`ALTER TYPE ... ADD VALUE`, not transactional). Replaces `AssetType`.
  *(2026-09-26: `CASH` and `REAL_ESTATE` were dropped — migration
  `554b153fdbda`; existing rows were reclassified to `CURRENT_ACCOUNT` /
  `OTHER`. The mechanism is unchanged, only the value list.)*
- **`Bucket`** (policy, user-owned, configurable): *a table*, not an enum —
  per-user rows with `name`, optional `description`, a `liquidity_category`,
  `sort_order`, `created_at`. Users can rename, add, and delete buckets.
  This is where strategy lives, so changing strategy is a data change, never
  a schema change.
- **`LiquidityCategory`** (fixed, three values): `LIQUID`, `RESERVE`,
  `INVESTED`, stored as a **native enum**. Three values, not two: merging
  "what I can spend now" and "my safety net" into one number answers neither
  question. `RESERVE` is a policy statement (liquidatable but deliberately
  not spent), not a claim of zero risk. Being a stable accounting-level
  split, it stays native.
- **`Asset.bucket_id` is required** (FK `NOT NULL`). The derived headline
  (`LIQUID` / `RESERVE` / `INVESTED` totals) depends on the bucket, so an
  asset without a bucket would silently drop out of the totals — the exact
  trap ADR 0004 rejected for an optional `asset_id`. The API requires
  `bucket_id` on asset create (the UI preselects the first bucket);
  programmatic creation paths (import, seed) resolve the user's default
  bucket explicitly. No "unassigned assets" state exists.
- **`Asset.liquidity_category` is derived, never stored**: a Python
  `@property` reading `bucket.liquidity_category`. Reassigning an asset's
  bucket reclassifies it everywhere with no data migration. SQL-level
  aggregations (allocation reports) join `buckets` instead of relying on the
  property.
- **Bucket deletion is guarded at the service layer**, mirroring the
  asset-with-transactions rule: deleting a bucket that still has assets
  returns **409** unless a `reassign_to` bucket is given, in which case the
  assets move first (the `NOT NULL` invariant is never broken).
- **Default buckets are neutral, not Coletti's 4 pillars**:
  "Liquidità quotidiana" (`LIQUID`), "Fondo di emergenza" (`RESERVE`),
  "Investimenti" (`INVESTED`). They are seeded **once at registration** and
  are immediately editable. Existing users get them from the migration.
  No lazy "ensure on read" side effect (a GET that writes is a smell); an
  idempotent seeding helper may exist for data migrations only.
- **No `target_amount` / `target_months`**: goals/budgeting are explicitly
  out of scope; a target field is a future-feature hook we can add when the
  feature is actually designed.
- **No free-text `sub_category`**: unstructured text does not aggregate
  reliably (typos and variants fragment groups). Geography/sector
  drill-down is deferred to the roadmap's holdings/performance item, where
  it will get a proper controlled vocabulary.
- **Allocation is exposed as a snapshot endpoint**: `GET /api/assets/allocation`
  returning the current totals grouped `by_liquidity` and `by_bucket`. It is
  not a period report, so it does not use the `summary`/`trend`/`comparison`
  naming. Buckets get a standard CRUD under `/api/buckets`.
- **Indexes**: no single-column index on `bucket_id` / `asset_class` (low
  cardinality, and every query is per-user). If a query plan ever needs one,
  it must be composite with `user_id` (e.g. `(user_id, bucket_id)`).

## Alternatives considered
- **Extend the single enum** (add `MONEY_MARKET_ETF`, `BOND_ETF`, ...) —
  rejected: still conflates instrument and role; cannot express the same
  instrument in different roles; keeps strategy in the schema.
- **Hardcode a 4-pillar enum** — rejected: it is one planning heuristic, not
  a taxonomy; changing strategy becomes a semantic migration.
- **A generic tag/dimension system** (tags with a `dimension` column) —
  rejected: over-general for two well-known axes (YAGNI).
- **Store `liquidity_category` on `Asset`** — rejected: a duplicate to keep
  in sync with the bucket; the usual update anomaly, and reassignment would
  require a data migration (see wiki `dati-derivati`).
- **`LiquidityCategory` as a table** — rejected: it is a stable accounting
  concept, not a user policy; configurability would add surface with no use.
- **`bucket_id` nullable with an "N assets without bucket" warning** —
  rejected: the headline totals become silently incomplete; schema-level
  requiredness (with a default at creation) beats a code-level check.
- **`target_amount` / `target_months` from the start** — deferred: YAGNI,
  and `target_months` presupposes a budgeting notion we do not have.
- **Native enum for `AssetClass`** — rejected: the taxonomy will grow;
  `VARCHAR` + `CHECK` keeps additions a normal migration.

## Consequences
- New `buckets` table and `Asset.bucket_id NOT NULL`; `Asset.asset_type` is
  replaced by `asset_class` (non-native enum). Because the database holds
  fake data and can be recreated at will, the migration can be a clean
  schema change; if data is kept, it must also seed the default buckets per
  existing user and assign every existing asset to one (the old `liquid` /
  `savings` / `etf` values map to `CURRENT_ACCOUNT` / `DEPOSIT_ACCOUNT` /
  a manual choice respectively).
- New `/api/buckets` CRUD (409 on delete-with-assets, optional
  `reassign_to`) and `GET /api/assets/allocation`.
- `AssetCreate` / `AssetResponse` change: `asset_class` and `bucket_id` in,
  `asset_type` out, `liquidity_category` returned as a derived field.
- Import and seed paths must resolve a bucket for the assets they create.
- Frontend: asset dialog (asset class + bucket), assets page grouped by
  bucket/liquidity, home headline (LIQUID / RESERVE / INVESTED) plus a
  per-bucket breakdown, allocation chart by asset class.
- Tests: bucket CRUD, bucket-required invariant, delete 409/reassign,
  allocation aggregation, derived liquidity.
- The general concept is documented in `docs/wiki/asset-class-e-bucket.md`.

## Supersedes
- The `Asset.type` enum decision in **ADR 0004** (everything else in that ADR
  — derived balances, separate transfers, required `asset_id` — still stands).
- The "allocation by asset type" shape of roadmap item 4 (now allocation by
  asset class + liquidity/bucket views).

## References
- Wiki: `docs/wiki/asset-class-e-bucket.md`, `docs/wiki/dati-derivati.md`,
  `docs/wiki/n-plus-one.md`
- ADR 0004 (assets and transfers), ADR 0003 (derived direction)
- `docs/ROADMAP.md` item 9
