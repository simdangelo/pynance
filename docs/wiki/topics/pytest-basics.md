# pytest — Writing Tests

A general guide to pytest, the standard test framework for Python. Covers test
discovery, `assert`, fixtures, `parametrize`, `conftest.py`, running tests, and
the habits that make tests useful. No project-specific assumptions.

---

## Why tests exist

Tests are the safety net that makes refactoring safe: they lock down *what* the
code does, so you can change *how* it does it without breaking behavior. They're
also executable documentation — a test shows how a function is supposed to be
used and what it promises.

The cycle that produces them is **TDD**: write a failing test first (it proves
the requirement), then make it pass with the minimum code, then refactor. The
test-first order matters because it forces you to think about *behavior* before
*implementation*.

## Discovery — how pytest finds tests

No registration needed. By convention:

- Files named `test_*.py` (or `*_test.py`).
- Functions named `test_*` inside them.
- Classes named `Test*` (methods `test_*` inside) — only needed for grouping.

```python
# tests/test_math.py
def test_addition():
    assert 1 + 1 == 2
```

```
$ pytest
collected 1 item
tests/test_math.py .                                            [100%]
```

## Plain `assert` — no boilerplate

pytest rewrites `assert` statements, so a failed assertion shows you the actual
values:

```python
def test_total():
    assert compute_total([1, 2, 3]) == 7
```

Fails with something like `assert 6 == 7` plus the diff. No
`self.assertEqual(...)` ceremony — this is why pytest beats the stdlib
`unittest` for new projects.

**One warning**: `assert` without a message is fine — pytest shows the values.
Don't add `assert x, "message"` everywhere; reserve messages for non-obvious
cases.

## Fixtures — setup and teardown

A **fixture** is a function that prepares something a test needs (an object, a
connection, a client) and hands it to the test as a parameter:

```python
import pytest


@pytest.fixture
def counter():
    return {"n": 0}


def test_increment(counter):
    counter["n"] += 1
    assert counter["n"] == 1
```

### The yield form — setup + teardown

A fixture with `yield` runs setup before the test and teardown after, no matter
how the test ends (pass, fail, raise):

```python
@pytest.fixture
def db_session():
    session = create_session()
    yield session          # the test receives this
    session.close()        # teardown: always runs
```

This is the workhorse for resources with a lifecycle (sessions, files,
clients) — and it's the same `yield` pattern used by FastAPI's `get_db`
dependency.

### Scope — how often a fixture runs

| Scope | Runs once per... | Use for |
|---|---|---|
| `function` (default) | test | fresh state per test |
| `module` | module | module-level setup |
| `session` | whole run | expensive one-time setup (e.g. create DB schema) |

```python
@pytest.fixture(scope="session")
def engine():
    ...
```

The default `function` scope gives isolation; wider scopes trade isolation for
speed. Start function-scoped and widen only when setup is genuinely expensive.

### Fixtures using other fixtures

A fixture can depend on another fixture — just declare it as a parameter:

```python
@pytest.fixture
def client(db_session):        # db_session runs first, result passed in
    ...
```

pytest resolves the whole dependency chain automatically.

## `parametrize` — one test, many inputs

Runs the same test body over multiple cases:

```python
import pytest


@pytest.mark.parametrize(
    "a,b,expected",
    [(1, 2, 3), (0, 0, 0), (-1, 1, 0)],
)
def test_add(a, b, expected):
    assert a + b == expected
```

Each row becomes a separate test in the report (with the values in the name), so
a failure pinpoints exactly which case broke. Use it instead of loops-within-
one-test: `assert` inside a loop stops at the first failure and hides the rest.

## `conftest.py` — shared fixtures

Fixtures live near their tests, but anything in a `tests/conftest.py` is
available to **every test file** in that directory and below — no imports
needed, just declare the fixture name as a parameter. This is where you put the
setup that the whole suite shares (app client, database session, helpers).

`conftest.py` is loaded automatically; it can also hold plain helper functions,
but those must be imported explicitly.

## Running tests

```bash
pytest                    # everything
pytest tests/test_x.py    # one file
pytest tests/test_x.py::test_thing   # one test
pytest -k "name"          # filter by name substring
pytest -x                 # stop at first failure
pytest -v                 # verbose (one line per test)
pytest --tb=short         # shorter tracebacks
```

## What makes tests *good*

- **Test behavior, not implementation.** A test should survive a refactor that
  changes *how* the code works internally. If it asserts on private functions
  or internal state, it breaks for the wrong reason.
- **Isolate tests from each other.** Each test must work in any order, run
  alone, or run with the whole suite. Shared mutable state between tests is a
  bug farm — that's what function-scoped fixtures are for.
- **One behavior per test.** If a test has three independent `assert`s, a
  failure in the first hides information about the other two. Split when the
  asserts verify different behaviors.
- **Assert the outcome, not the steps.** `assert result == expected`, not
  "the function was called with X" (unless the call itself is the contract).
- **Fix the test that fails for the right reason.** A test passing before the
  feature exists (a "false green") is worse than a failing one — it proves
  nothing. When TDD, watch the test fail first.

## Pitfalls

- **Tests depending on order** — module-level lists, files, or DB rows
  accumulated across tests. Clean up in fixtures (the `yield` teardown) so each
  test starts clean.
- **Testing implementation details** — asserts on private functions, internal
  attributes, or mock call sequences. These break on any refactor and tell you
  nothing about whether the *behavior* is right.
- **One giant test doing everything** — when it fails you learn only "something
  in the middle broke". Prefer many small focused tests.
- **`assert` with side effects** — `assert client.delete(x)` runs the delete
  and checks the result; that's fine, but be aware asserts *execute* code. And
  never put cleanup logic inside an `assert`.
- **Forgetting teardown** — a fixture that opens something and never closes it
  leaks resources across the suite. Use `yield` + cleanup in `finally`.
- **Skipping with `pytest.skip` or `@pytest.mark.skipif`** as a habit — a
  skipped test is a test that isn't testing. Skip deliberately, rarely.
- **Catching exceptions to assert them** — for "this raises", use
  `pytest.raises`:

```python
import pytest


def test_invalid_input_raises():
    with pytest.raises(ValueError):
        compute_total(-1)
```

## A minimal example end to end

```python
# myapp.py
def compute_total(items: list[int]) -> int:
    return sum(items)


def validate(x: int) -> int:
    if x < 0:
        raise ValueError("negative")
    return x
```

```python
# test_myapp.py
import pytest

from myapp import compute_total, validate


def test_compute_total_empty():
    assert compute_total([]) == 0


@pytest.mark.parametrize("items,expected", [([1], 1), ([1, 2, 3], 6)])
def test_compute_total(items, expected):
    assert compute_total(items) == expected


def test_validate_rejects_negative():
    with pytest.raises(ValueError):
        validate(-1)
```

That's the whole toolkit: discovery, assert, fixtures, parametrize, raises,
and the discipline of isolating behavior. Everything else is domain-specific
application of these pieces.
