# Python Mastery Note — Generators and `yield`

*Folded into Module 3 because FastAPI's dependency injection uses generator
functions (`get_db` yields a session), and understanding generators demystifies
why that pattern works.*

---

## The two ways a function can return

A normal function returns once:

```python
def get_thing():
    return "value"
```

A **generator function** — one that contains `yield` — doesn't return a value;
it returns an *iterator* that produces values one at a time, pausing between
each:

```python
def countdown(n: int):
    while n > 0:
        yield n
        n -= 1


for x in countdown(3):  # prints 3, 2, 1
    print(x)
```

Each `yield` **pauses** the function, handing a value to the caller. The next
iteration **resumes** it right after that `yield`, with all local state intact.
That pause/resume is the entire superpower.

## What makes generators useful

1. **Lazy production**: values are produced on demand, one at a time, instead
   of building a whole list in memory. Great for huge sequences or streams.
2. **Pause/resume with state**: the function's locals survive across `yield`s,
   so you get stateful iteration without a class.
3. **`yield` in the middle of logic**: the function runs arbitrary code before
   the first `yield` and after the last one — which is exactly what resource
   management needs.

## The `yield` resource pattern (what `get_db` does)

A generator whose body is *setup → yield → teardown* gives you "run this before,
run that after":

```python
def get_db():
    db = SessionLocal()  # setup: runs first
    try:
        yield db  # the consumer gets the session here
    finally:
        db.close()  # teardown: runs when iteration ends


# consuming it manually:
gen = get_db()
session = next(gen)  # setup runs; we get the session
# ... use session ...
gen.close()  # teardown runs (finally)
```

FastAPI's dependency injection uses exactly this: when a dependency is a
generator, FastAPI calls `next()` to get the value, runs the endpoint, then
closes the generator — so `finally: db.close()` runs after every request. The
`try/finally` guarantees cleanup even if the endpoint raises.

This is a **context-manager-like** guarantee, but expressed with a generator.
Python's own `contextlib.contextmanager` decorator exists precisely to turn this
generator shape into a `with`-style context manager.

## `yield` vs `return` in a generator

A generator function can contain both. `return` ends iteration (with an
optional `StopIteration` value); `yield` suspends and continues. In the
resource pattern, the `finally` block after the last `yield` runs when
iteration ends — via `next()` exhaustion, `gen.close()`, or the `for` loop
finishing.

## Practical takeaways

- If a function "returns different things at different times" while keeping
  state, it's probably a generator.
- The `setup → yield → teardown` shape is the idiomatic way to write
  resource-lifetime code without manual context-manager classes.
- You consume generators with `for`, `next()`, `list()`, or `sum()` — anything
  that iterates.
- **Common pitfall**: forgetting that calling a generator function does *not*
  run its body. It returns a generator object; the body runs only on the first
  `next()`. (FastAPI hides this — but if you ever call `get_db()` yourself,
  you must drive it or close it.)
- `send()` and `throw()` exist for advanced two-way communication; you'll
  almost never need them. Understanding pause/resume covers 99% of real usage.

## Further reading

For the context-manager angle, also see how `@contextmanager` turns this exact
shape into a `with` statement — the two are two sides of the same coin.
