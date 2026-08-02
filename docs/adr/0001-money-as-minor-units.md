# ADR 0001 — Money as Decimal (never float)

## Status
Accepted (revised: originally "integer minor units", changed to Decimal before
any implementation landed; direction model revised to typed categories)

## Context
Pynance tracks amounts (transaction amounts, balances, category totals). Money
has a well-known pitfall in code: floating-point representation cannot exactly
represent most decimal fractions (e.g. 0.1 + 0.2 != 0.3), so accumulating
floats drifts over time. Budget math — summing many transactions per month — is
exactly the workload where float drift becomes visible.

Two exact alternatives exist: integer minor units (cents) and `Decimal`.

## Decision
- Amounts are stored and computed as **`decimal.Decimal`**, never floats.
- Stored in the database as `Numeric(12, 2)` (exact, not float).
- Amounts are stored **unsigned/positive**; direction (income vs expense) is
  carried by a `transaction_type` column, and categories are typed by direction
  (income categories vs expense categories). Direction is resolved at report
  time, never from the amount's sign.
- Single currency for now; multiple currencies, if ever, are a separate decision.
- **Never construct a `Decimal` from a float** (`Decimal(0.1)` reintroduces the
  bug). Build from strings or ints: `Decimal("12.34")`.

## Alternatives considered
- **Integer minor units (cents)**: also exact, and what the ADR originally
  picked. Simpler arithmetic and trivially a DB integer, but every boundary
  must convert to/from decimal form for display. Equally valid; chosen against
  in favor of `Decimal` because `Decimal` reads more naturally for money values
  and is the more widely-taught convention.
- **Float**: rejected outright — the drift problem is the entire reason this
  ADR exists.

## Consequences
- No floating-point money drift anywhere in the codebase.
- Money arithmetic is exact, but precision must be managed (e.g. rounding with
  `Decimal.quantize` where needed).
- `schemas/` (Module 3+) will present money in decimal form to API consumers.
