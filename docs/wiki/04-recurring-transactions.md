# Module 4 — Recurring Transactions

The first *product* feature built on the learning modules (tracked in
`docs/ROADMAP.md`). Recurring transactions answer a simple need: rent, salary,
subscriptions repeat on a schedule, and re-entering them every month is
wasteful and error-prone. This module introduces the **template/generator**
pattern — the first entity that *produces other entities*.

This file is self-contained: read it, then do the exercise at the bottom.

---

## The concept

A recurring transaction is not a transaction — it's a **template** that
*generates* transactions. The template holds the repeating definition (what,
how much, how often, from when), and generating creates ordinary
`Transaction` rows from it.

The key design principle, decided upfront:

> **The template is a factory, not a parent.** Once a transaction is
> generated, it's completely independent — editable, deletable, reportable —
> with no link back to the template. The template only creates; it never
> re-syncs or updates what it made.

Why: a "linked and re-generate" model silently overwrites user edits (you
adjusted last month's rent to the real amount; re-generating would clobber
it). Independent rows keep the template simple and the transactions honest —
and they fit the existing reporting pipeline with zero changes, because
generated rows *are* normal transactions.

## The data model

```
RecurringTemplate
├── id
├── description
├── amount            (Decimal, ADR 0001)
├── category_id       (FK → categories — the type is derived from the category)
├── frequency         (enum: monthly / weekly / yearly / custom)
├── interval          (int, used by custom: every N frequency-units)
├── next_occurrence   (date — the template's pointer)
├── active            (bool — pause without deleting)
└── created_at
```

Two fields deserve attention:

- **`next_occurrence` is the template's state.** It's the pointer that says
  "the next transaction to generate is on this date". Generating advances it
  by the frequency. This is what makes the whole feature work: overdue
  detection is just `next_occurrence < today`.
- **`active` vs deleting.** You don't delete a template you might resume
  (you moved, but rent resumes? unlikely — but a paused gym membership is
  common). `active=False` pauses generation without losing history.

## Generation: the generate-next model

The single operation is "generate the next occurrence":

1. Take the template (it must be `active`).
2. Create a `Transaction` from the template's fields, with
   `occurred_on = template.next_occurrence`.
3. **Advance** `next_occurrence` by the frequency.
4. Return the generated transaction.

Because it's a single, explicit action, nothing happens silently. Forgetting
is handled by **overdue detection**, not automation: the API exposes each
template's `overdue` (computed: `next_occurrence < today`), and the frontend
can surface "Rent is overdue — generate it?".

### Frequency math

The tricky part is advancing the date. Frequency rules:

- **monthly** → `next = next + 1 month` (careful with month lengths: what does
  "monthly from Jan 31" mean? Feb 28? This is the classic edge case — decide
  and document your behavior. A common simple choice: clamp to the last day
  of the month, or skip to the 1st of the next month. Both are defensible;
  pick one).
- **weekly** → `next = next + 7 days`.
- **yearly** → `next = next + 1 year` (Feb 29 → Feb 28 on non-leap years —
  same clamping question).
- **custom** → `next = next + interval × unit` (e.g. interval=2, unit=weekly →
  every 2 weeks).

Date arithmetic in Python has traps here (`timedelta` has no "add a month" —
you must build it from `date` parts). This is a good place for a small,
well-tested helper function.

## The API shape

```
POST   /recurring-templates          → 201, the template
GET    /recurring-templates          → list (each with computed overdue + next_occurrence)
PATCH  /recurring-templates/{id}     → 200 (edit amount, category, frequency, active)
DELETE /recurring-templates/{id}     → 204
POST   /recurring-templates/{id}/generate   → 201, the generated Transaction
```

Notes:

- `generate` is the one action that crosses from templates to transactions —
  the router calls a service that creates a `Transaction`, so it returns a
  `TransactionResponse` (not a template response).
- The template response should include the **computed** `overdue` field —
  that's business logic (backend), not frontend.
- Naming follows `docs/NAMING.md`: `create/get/list/update/delete` + the
  `generate` action on the resource.

## Service layer

Four service functions (plus the generator):

- `create_template`, `list_templates`, `update_template`, `delete_template` —
  CRUD, same shape as categories (you've done this three times).
- `generate_next(db, template_id)` — the interesting one:
  1. fetch the template (raise `TemplateNotFoundError` if missing)
  2. if `not template.active` → raise a domain exception (a paused template
     can't generate — the frontend should tell the user)
  3. build the `Transaction`
  4. advance `next_occurrence`
  5. commit (both the new transaction *and* the advanced pointer — one
     transaction, in the DB sense: either both happen or neither)

The `overdue` field: computed per template in the list query (Python-side:
`template.next_occurrence < date.today()`) — no DB magic needed.

## Edge cases worth handling deliberately

- **Paused template + generate request** → domain exception, not silent
  success. The user needs to know *why* nothing was created.
- **Generate twice** → the pointer advances each time, so you get two
  transactions for two different dates — never a duplicate. (This is the
  guarantee the generate-next model gives you: idempotency per occurrence,
  because the pointer moved.)
- **Editing a template's amount after generating** → affects *future*
  generations only; already-generated rows keep their amount. This is a
  consequence of "independent once generated" — worth stating explicitly in
  the UI copy later.

## Pitfalls

- **Reusing the template's `created_at`-style defaults naively** — remember
  the transaction needs `occurred_on = next_occurrence`, not today.
- **Forgetting to commit the pointer advance** — if you commit the new
  transaction but not the advanced `next_occurrence`, the next generate
  produces a duplicate. One `db.commit()` after both changes.
- **`timedelta` and months** — `timedelta(days=30)` is *not* "one month".
  Build the month math from `date` components and test the clamping.
- **`overdue` as a stored column** — it's derived (from `next_occurrence` +
  today). Never store it; compute it. Same principle as ADR 0003.
- **Deleting instead of deactivating** — lose the history. Pause with
  `active=False`.

---

## What to do on your own (the exercise)

1. **Model** — `RecurringTemplate` in `models/recurring_template.py` (one
   file per entity, facade `__init__` per convention). Enum for frequency.
   Migration via Alembic (generate, review, apply).
2. **Service** — CRUD + `generate_next` + the frequency-advance helper
   (with clamping decision documented). Domain exceptions for
   `TemplateNotFoundError` and (paused-template) generation.
3. **API** — the 6 routes above, thin, with error translation.
4. **Tests** — CRUD happy paths + 404s; **generate**: creates a transaction
   with the right `occurred_on`, advances the pointer, refuses when paused;
   the monthly-clamp edge case (Jan 31 → Feb 28); `overdue` flag flips as
   expected.

Send me your code when done. The next module (Assets) builds on what you
learn here.
