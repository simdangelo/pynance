# Python Mastery Note — Descriptors: how declarative class syntax works

*A general Python deep-dive on descriptors — the mechanism behind `@property`,
`classmethod`, and library features like SQLAlchemy's `mapped_column` or Django's
field types. You can use these libraries without knowing this, but knowing it
demystifies the magic.*

---

## The question

```python
class Point:
    x = 10
```

This is a plain class attribute. But consider something like:

```python
id = mapped_column(primary_key=True)
```

On an instance, `obj.id` returns an int, and assigning to it triggers library
bookkeeping. Normal class attributes can't do that — plain attributes are just
values stored in `instance.__dict__`. Something must be intercepting attribute
access. That something is a **descriptor**.

## What a descriptor is

A descriptor is an object that lives on the *class* and defines at least one of
three special methods:

- `__get__(self, instance, owner)` — called when you read the attribute.
- `__set__(self, instance, value)` — called when you assign it.
- `__delete__(self, instance)` — called on `del`.

A class attribute whose value is such an object "wins" over the instance's
`__dict__`: when Python resolves `obj.attr`, it checks the *class* first, finds
the descriptor, and calls its `__get__` instead of returning a plain value.

```python
class Verbose:
    def __get__(self, instance, owner):
        print(f"reading {self.name!r}")
        return instance.__dict__[self.name]

    def __set__(self, instance, value):
        print(f"setting {self.name!r} to {value!r}")
        instance.__dict__[self.name] = value

    def __set_name__(self, owner, name):
        self.name = name


class Point:
    x = Verbose()
    y = Verbose()


p = Point()
p.x = 10  # setting 'x' to 10
print(p.x)  # reading 'x' → 10
```

That's the entire trick. `Verbose` is a data descriptor (defines both
`__get__` and `__set__`), so instance assignment routes through `__set__`.

## The two families of descriptors

- **Data descriptor** (defines `__set__`): takes priority over the instance
  `__dict__`. Attribute reads *and* writes route through it.
- **Non-data descriptor** (only `__get__`): read routes through it, but a plain
  instance attribute **shadows** it — which is exactly the behavior of
  `property` and `classmethod`. (This is why `@property` gives you a computed
  attribute but can't intercept assignment.)

## Where this shows up in Python you already use

- **`@property`** — a non-data descriptor built into the language. The computed
  `path`-style properties you write are `property` descriptors.
- **`classmethod`/`staticmethod`** — descriptors.
- **`functools.cached_property`** — a descriptor that computes once, then
  stores the result in `instance.__dict__` so subsequent reads skip the
  recompute (it exploits the non-data descriptor shadowing).
- **`mapped_column(...)`** — returns a descriptor. Reading `obj.column` calls
  its `__get__`, which knows how to pull the value from the row/state.
  Assigning triggers `__set__`, which marks the attribute "dirty" so the library
  can generate the right `UPDATE`.

## The practical takeaways for your code

1. **You rarely write descriptors.** They're an implementation mechanism. The
   one you'll write by hand is `@property`, and understanding why it can't
   intercept assignment (non-data descriptor) prevents confusion.
2. **Class-level magic means "descriptor."** Any library that gives you
   declarative class syntax (`mapped_column`, Django's fields, dataclasses'
   fields before 3.10) is almost certainly using descriptors or a close cousin
   (`__set_name__`).
3. **`__set_name__`** runs when the class is created, passing the attribute
   name to the descriptor — that's how a descriptor knows its own name without
   you telling it. It's also how dataclasses wire field names.

## One more: the annotation is the config

A library can also read the class's type annotations via `__annotations__` when
the class is defined, and match each annotation to its descriptor. That's the
modern design used by libraries like SQLAlchemy 2.0: annotation for type,
descriptor for behavior, class-creation-time hook to bind them. It's a clean
example of Python letting a library reshape how you declare classes — and of
why reading annotations at class-definition time is a legitimate technique.

## Reading order suggestion

If descriptors are new: read the two-line example above, then the "two
families" section. You don't need to reimplement any of it — the goal is that
declarative class syntax no longer looks like framework magic.
