# The N+1 Problem (and lazy loading in ORMs)

A general guide to one of the classic ORM performance traps, triggered in this
project by the derived `transaction_type` property (ADR 0003). Understanding it
matters because it's the most common way a clean-looking ORM model silently
becomes slow as data grows.

---

## What the problem is

An ORM makes relationships look like plain attributes: `transaction.category`
"just works". But each access can hide a **database query** — the relationship
is **lazy-loaded** by default: SQLAlchemy fetches it the first time you touch
it.

The trap: when you load a *list* of rows and then read a relationship on each
one, you get one query for the list **plus one query per row**:

```python
transactions = db.execute(select(Transaction)).scalars().all()
# → 1 query: SELECT * FROM transactions

for t in transactions:
    print(t.category.name)   # → N queries: SELECT * FROM categories WHERE id=...
```

That's the **N+1**: `N` extra queries on top of the initial `1`. With 10
transactions: 11 queries. With 1000: 1001. The code looks identical either way
— only the query log reveals it.

## Why it happens (lazy loading)

SQLAlchemy relationships default to **lazy loading**: the related object is
fetched on first attribute access, not with the main query. For a *single*
object that's fine — one extra query is acceptable. For a *collection*, the
cost multiplies per element. The feature is convenient and the cost is
invisible until it isn't.

## Where this project hit it

`Transaction.transaction_type` is a `@property` that returns
`self.category.transaction_type` (ADR 0003: the type is derived, not stored).
Reading the property on one transaction lazy-loads its category. `list_transactions`
returns many transactions — and serializing each one reads the property:
**1 + N queries**. The `get_transactions` list endpoint and the transaction
table in the frontend both trigger it.

The property is the right *design* (one source of truth); the N+1 is a
*loading strategy* issue, fixable without changing the design.

## The fix: eager loading

Tell SQLAlchemy to fetch the relationship *in the same query* instead of
lazily. The standard tool is `selectinload` (a second `SELECT ... WHERE id IN
(...)` — one extra query total, regardless of N):

```python
from sqlalchemy.orm import selectinload

query = (
    select(Transaction)
    .options(selectinload(Transaction.category))
    .where(*conditions)
)
```

Now `t.category` is already loaded — no per-row query. 1 + N becomes 2 queries,
flat, no matter how many rows.

When to use `selectinload` vs the other strategies:

| Strategy | What it does | Use when |
|---|---|---|
| (default) lazy | fetch on access | single objects, rarely-accessed relationships |
| `selectinload` | second query with `IN (...)`, loads all | **lists of objects with a relationship you'll read** |
| `joinedload` | single query with `JOIN` | you always need the related data, small result sets |

For our case, `selectinload` is the right default: it's flat-cost and doesn't
complicate the query.

## How to know you have it (and that the fix worked)

- **Echo SQL**: `engine = create_engine(url, echo=True)` prints every query to
  the console — count the lines per request. One request → 1+N lines = N+1.
- **Query count in tests**: assert the number of queries a handler issues (the
  `assert_num_queries`-style tools exist in testing libraries) — turns the
  regression into a test.

## General rules

- **A relationship read inside a loop over ORM objects is the N+1 signature.**
  If you see `for x in rows: x.related`, expect N+1 and eager-load.
- **Eager load only what you read.** `selectinload` on a relationship you
  never touch is wasted work.
- **Properties that reach into relationships** (like our `transaction_type`)
  are sneaky: the N+1 is hidden behind an attribute read that looks like a
  plain field. Code review can't see it; the query log can.
- **It's not premature optimization to fix N+1**: it's the difference between
  an endpoint that scales linearly and one that scales *quadratically* in
  queries. The code change is one line.

## Minimal illustrative example

```python
# models
class Author(Base):
    __tablename__ = "authors"
    id: Mapped[int] = mapped_column(primary_key=True)

class Book(Base):
    __tablename__ = "books"
    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("authors.id"))
    author: Mapped[Author] = relationship()

# N+1 — one query per book
books = db.execute(select(Book)).scalars().all()
for book in books:
    print(book.author.id)

# Fixed — two queries total
books = db.execute(select(Book).options(selectinload(Book.author))).scalars().all()
for book in books:
    print(book.author.id)
```

The same data, the same result — one version does N+1 queries, the other 2.
That's the whole lesson: **lazy loading is convenient, eager loading is
deliberate, and N+1 is what happens when you confuse the two.**
