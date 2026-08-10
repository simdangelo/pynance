# ADR 0003 — Transaction type derived from the category

## Status
Accepted

## Context
A transaction has a direction (income vs expense) and so does a category. In
ADR 0001, both were stored explicitly: `transactions.transaction_type` and
`categories.transaction_type`, with a service-level invariant that they must
match.

A bug surfaced: updating a category's type (e.g. income → expense) did not
touch the transactions referencing it, leaving them with the old type. The
invariant was enforced in only one direction — the transaction service checked
the category's type on create/update, but nothing checked the reverse. The two
copies of "what type is this" could silently drift.

This is the classic symptom of a denormalized duplicate: `transaction_type` on
`transactions` is functionally dependent on `category_id` through the
foreign key, so it is derivable — and every derivable column stored twice must
be kept in sync by application code. Normalization exists precisely to remove
this class of update anomaly.

## Decision
- **`transaction_type` is removed from `transactions`.** The category is the
  single source of truth for direction.
- `Transaction` gains a `category` relationship and a derived
  `transaction_type` property that reads `self.category.transaction_type`.
- The API contract on **read is unchanged**: `TransactionResponse` still
  includes `transaction_type`, populated from the derived property.
- The API contract on **write changes**: `TransactionCreate`/`TransactionUpdate`
  no longer accept `transaction_type` — the client picks a category and the
  type follows. It is structurally impossible to create a mismatched pair.
- Reports (summary, trend, by-category) group by `categories.transaction_type`
  via a join instead of reading a column off `transactions`.
- `TransactionTypeMismatchError` and its 422 responses are removed — the
  failure mode no longer exists.

## Alternatives considered
- **Snapshot (keep the column, make it immutable)**: the type is a fact
  captured at creation; retyping a category does not rewrite history. Rejected:
  the user's domain expectation is that history follows the category, and a
  personal budget tracker is not an audited ledger requiring historical
  immutability. (Noted as the principled alternative if auditing ever matters.)
- **Cascade (keep the column, sync on category update)**: keeps the duplicate
  and merely moves the sync code to the other side. Rejected: it preserves the
  maintenance burden and the drift risk instead of eliminating them.

## Consequences
- The drift bug becomes structurally unrepresentable — the strongest form of
  enforcement (the schema itself prevents the violation, stronger than any
  service check).
- Retyping a category retroactively reclassifies its transactions, including
  past reports. Accepted deliberately for this app's scale and semantics.
- One new migration drops the column (and the now-unused enum).
- Slightly more complex report queries (join instead of a column read).
- The transaction form loses a redundant field; the client can no longer
  express a mismatched pair.

## Supersedes
- The direction-modeling portion of **ADR 0001** (its Decimal decision is
  unaffected).
