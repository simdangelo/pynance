# Naming Convention — APIs, Services, Dataclasses

A quick reference for naming backend operations consistently. Applies to:
service functions, FastAPI endpoints, report dataclasses, and Pydantic
response schemas.

---

## CRUD

```
create_<entity>   POST   /<entities>
get_<entity>      GET    /<entities>/{id}
list_<entities>   GET    /<entities>
update_<entity>   PATCH  /<entities>/{id}
delete_<entity>   DELETE /<entities>/{id}
```

Rules:
- Use `list_`, **not** `get_` plural, for collections.
- Singular = one by id; plural = collection.

## Reports

```
get_<metric>[_by_<dimension>]
```

Metrics (fixed vocabulary):

| Metric | Meaning | Example |
|---|---|---|
| `summary` | totals for one period | `get_summary` → `GET /summary` |
| `trend` | totals across periods | `get_trend` → `GET /trend` |
| `comparison` | two periods side by side | `get_comparison` → `GET /comparison` |

Dimensions (optional suffix): `_by_category`, `_by_type`, ...

- The **period is always query params** (`month`/`year`/`start_date`/`end_date`),
  never in the name or path.
- Hyphens in URLs (`/summary-by-category`), underscores in Python
  (`get_summary_by_category`).

## Dataclasses and response schemas

Mirror the metric name, suffix `...Row` for one item of a list result:

| Dataclass | Response schema |
|---|---|
| `Summary` | `SummaryResponse` |
| `SummaryByCategoryRow` | `SummaryByCategoryRowResponse` |
| `TrendPoint` | `TrendPointResponse` |
| `TrendByCategory` | `TrendByCategoryResponse` |
| `Comparison` | `ComparisonResponse` |

The time unit (e.g. `monthly`) goes in the **data** (`TrendPoint.year/month`),
not the name — future granularities keep the same shape.

## Examples in this project

```
get_summary            GET /api/transactions/summary?year=&month=
get_summary_by_category GET /api/transactions/summary-by-category?transaction_type=&year=&month=
get_trend              GET /api/transactions/trend?start_date=&end_date=
get_trend_by_category  GET /api/transactions/trend-by-category?start_date=&end_date=
get_comparison         GET /api/transactions/comparison?year=&month=
```

## Extending

- New metric: add to the vocabulary (e.g. `forecast`).
- New dimension: `_by_<dimension>` suffix (e.g. `get_summary_by_type`).
- New granularity: a query param, not a new name (e.g. `?granularity=weekly`).
