# Module 1: Project Setup & Tooling

## What this module is about

Before any feature code exists, a project needs a **foundation**: a reproducible
development environment that any machine — including a future CI server and
whoever else may contribute — can bring up with one or two commands. In the Python
world this used to mean juggling several loosely-coupled tools: `virtualenv`,
`pip`, `requirements.txt` + `pip-tools` for the lockfile, `black` for formatting,
`isort` for imports, `flake8`/`pylint` for linting, and so on. Each was a separate
piece of config with its own CLI and its own opinions.

That has consolidated. Modern Python projects center on a single declarative file,
**`pyproject.toml`** (PEP 621/631), and a small set of fast, overlapping tools that
all read from it. This module's job is to make you comfortable with each tool in
that stack and why it's there, then have you wire them up as an empty skeleton that
later modules will fill in.

Why this order in the roadmap: the skeleton of empty folders *is* the architecture.
Encoding the layers as directories on day one means every later module is just
"fill in this part of the skeleton", which keeps the vertical slices from drifting
into a mess. Tooling first also means you never write code that then has to be
reformatted or un-typed retroactively.

---

## 1. `pyproject.toml` — the single source of truth

`pyproject.toml` is the config file the whole modern toolchain reads. It holds:

- project metadata (name, version, requires-python) under `[project]`
- runtime dependencies under `[project.dependencies]`
- dev/extra dependencies under `[project.optional-dependencies]`
- tool-specific config under per-tool tables: `[tool.uv]`, `[tool.ruff]`,
  `[tool.mypy]`, `[tool.pytest.ini_options]`, etc.

It replaces the `requirements.txt` + `setup.py` + `.flake8`/`setup.cfg`/
`pyproject` sprawl. One file, one place to look, shared by every tool.

**Trade-offs / why not the old way:** `requirements.txt` is just a list of pins — it
has no notion of project metadata, extras, or per-tool config. `setup.py` is code,
not data, and invites cleverness. The ecosystem converged on `pyproject.toml` as
the standard; fighting it means fighting every tool's defaults.

**Best practices for writing one:**
- Declare a `[build-system]` table — the PEP 517 backend that actually builds the
  project. `uv init` generates it; don't delete it.
- `name` must be lowercase and PEP 503-normalized (hyphens, not underscores or
  camelCase). For this project: `pynance`.
- `version` — keep a simple static string until you genuinely need dynamic
  versioning. Don't fetch it from git or a file on day one.
- `requires-python` — always a **floor** (`>=3.14`), never an exact pin. An exact
  `==` locks every contributor onto one interpreter; a floor admits compatible
  older and newer Pythons.
- `dependencies` — runtime dependencies only, expressed as **ranges** (`>=`,
  `~=`), never hand-written exact pins. The exact resolved versions belong in
  `uv.lock`, which is generated, reproducible, and updated via `uv`. Hand-pinning
  in the manifest duplicates the lockfile's job and makes upgrades a chore.
- Dev-only tooling (pytest, ruff, mypy, ...) goes in a separate dev group — see §2 —
  never in `dependencies`.
- Keep all tool config in the same file (`[tool.uv]`, `[tool.ruff]`,
  `[tool.mypy]`, `[tool.pytest.ini_options]`) instead of scattering `.ini`/`.cfg`
  files around.

**Pitfalls:**
- Mixing a `requirements.txt` *and* `pyproject.toml` for the same project — you end
  up with two sources of truth that drift apart. Pick one (for this project: the
  `pyproject.toml` managed by `uv`).
- Not pinning `requires-python` — you need a floor (the project uses `>=3.14`).

---

## 2. `uv` — the project manager

`uv` is a single Rust binary that replaces `pip`, `virtualenv`, `pip-tools`, and —
for most purposes — `poetry`. Given a `pyproject.toml` and a `uv.lock` file, it can
recreate the exact environment on any machine.

Why it exists: the old workflow required *four* separate tools plus remembering when
to run each (`pip install`, `virtualenv activate`, `pip-compile`, `pip-sync`).
`uv` does all of it, fast, and its lockfile pins both transitive dependencies and
hashes, giving you **reproducibility**.

The core commands you'll live with:

- `uv init` — scaffold a new project (creates `pyproject.toml`)
- `uv add <pkg>` — add a dependency to `[project.dependencies]` and install it
- `uv sync` — create/update the `.venv` to exactly match the lockfile
- `uv run <cmd>` — run a command *inside* the project's virtual environment
- `uv python install <version>` — download and manage Python interpreters

**Dev dependencies — what's only for devs, and why keep it separate:**
Development drags in a second set of tools that should never ship in production:
`pytest`, `ruff`, `mypy`, and later `pre-commit`. In `pyproject.toml` these live in
a dedicated **dev group**, never in `dependencies`:

- `uv add --dev <pkg>` — add a package to the dev group. `uv` writes it to
  `[dependency-groups]` (PEP 735) by default; the older equivalent is
  `[project.optional-dependencies]` with a `dev` key. Both work, but the
  `[dependency-groups]` table is the modern convention.
- `uv sync` — installs *everything* (runtime + dev). This is the command you run
  while coding.
- `uv sync --no-dev` — installs **runtime dependencies only**. This is what a
  production/CI deployment would run, and it's exactly why the split matters.

Why bother:
- A runtime-only install (`uv sync --no-dev`) is smaller, faster, and carries no
  test/lint tooling — fewer dependencies to update, less attack surface.
- The manifest itself shows the boundary: what the app needs to *run* vs what *you*
  need to *develop* it.
- It's the prerequisite for the multi-stage Docker build in Module 6, where the
  runtime image should contain only runtime dependencies.

**Where to run `uv init` in this project (monorepo):**
Run it **inside `backend/`**, not at the repo root:

- `uv init` creates a single Python project (`pyproject.toml`, `uv.lock`, `.venv`).
  The Python project here is the backend — the repo root also holds `frontend/` (a
  Node project) and `docs/`, which must stay free of Python project artifacts.
  Entangling the whole monorepo with one `pyproject.toml` would force every
  directory under one Python project's lockfile and venv.
- Pass `--name pynance`. Without it, uv names the project after the folder, giving
  you `backend` — you want the PEP 503-normalized `pynance` to match the
  `pynance/` package.
- Everything lands at `backend/pyproject.toml` + `backend/uv.lock` +
  `backend/.venv` (commit the lockfile; gitignore the rest).
- **`pre-commit` is the exception** to the "everything under `backend/`" rule: its
  `.pre-commit-config.yaml` lives at the repo **root**, because git hooks are
  repository-level, not per-Python-project.

**Project vs package — two different "pynances":**
`uv init --name pynance` does **not** create a `pynance/` code directory. The name
only sets `name = "pynance"` in `pyproject.toml`; uv also drops a `main.py`
placeholder, but no package. These are distinct concepts:

- **The uv project** = the `backend/` directory — the *container* holding
  `pyproject.toml`, `uv.lock`, `.venv`. It defines *how the environment is built*.
- **The Python package** = the `backend/pynance/` directory — the *importable code*
  that holds the four layers (`api/`, `schemas/`, `services/`, `models/`). It
  defines *what the code is*. You create it by hand (that's the "What to do on your
  own" exercise); `uv init` never makes it.

```
backend/
├── pyproject.toml      ← uv project manifest (created by uv init)
├── uv.lock             ← created by uv init
├── .venv/              ← created by uv sync
├── main.py             ← placeholder from uv init; delete it
└── pynance/            ← the package, created by you, by hand
    ├── api/
    ├── schemas/
    ├── services/
    └── models/
```

Why both must exist and match: `name = "pynance"` tells uv/mypy/pytest that the
importable package is `pynance`. Code inside the package imports it as
`from pynance.services import ...`, and pytest needs `pynance` on `sys.path` to
discover it — that link is the manifest's `name` matching the package folder name.

Two side notes:
- `uv init --package` *would* auto-generate a package — but under `backend/src/
  pynance/` (the "src layout"). `AGENTS.md` fixes the **flat** layout
  (`backend/pynance/`), so we create it ourselves instead. (src vs flat layout is a
  real trade-off, covered in Module 6's wiki when packaging for deployment.)
- The flat layout means imports run as `pynance.api`, `pynance.services`, etc., not
  `backend.pynance.api`. The `backend/` folder is just a container and is never
  part of import paths.

**Trade-offs:**
- `uv` vs `poetry`: both manage envs + lockfiles. `uv` is dramatically faster and
  reads standard `pyproject.toml` (Poetry historically used its own `[tool.poetry]`
  table and its own file format). `uv` also powers the de-facto-standard `pip`
  ecosystem (`uv pip install`), so it degrades gracefully into "a fast pip".
- `uv` vs plain `pip` + `venv`: fewer moving parts and one canonical way to run
  commands (`uv run`), but hides the mechanics of venvs behind a layer. For a
  learning project that's fine — the key concepts (venv, lockfile, pinning) are the
  same, and you'll meet the raw versions of them again in Docker (Module 6).

**Pitfalls:**
- **Never** reach for bare `pip` or `python` once the project uses `uv` — you'll
  install into the wrong interpreter or bypass the lockfile. Always `uv run ...`
  (for this project, always `uv run pytest`, `uv run ruff check .`, etc.).
- Not committing `uv.lock`. The lockfile is the reproducibility contract — without
  it, "works on my machine" comes back.
- Forgetting `uv sync` after editing `pyproject.toml` by hand — re-sync to reconcile
  the venv with the manifest.

---

## 3. `ruff` — linter and formatter

`ruff` is an extremely fast (Rust) linter that also ships a formatter. It absorbs
what used to be `black` (formatting), `isort` (import sorting), `flake8` +
dozens of plugins (lint rules), and more, all under one config in `pyproject.toml`.

**Linting vs formatting — don't confuse them:**
- `ruff check` — linting: finds *problems* (undefined names, unused imports,
  bug-prone patterns). It can auto-fix some of them (`--fix`).
- `ruff format` — formatting: rewrites the *style* (spacing, line breaks) with zero
  semantic change.

They're two commands with two jobs. A common mistake is running one and expecting
the other's behaviour.

**Why it exists:** style arguments (spaces vs tabs, where to wrap) are noise; a
machine-enforced uniform style removes them from code review. Linting catches real
bugs early — an unused import, a `print()` left in, a variable redefined.

**Trade-offs:** `ruff` vs `black`+`flake8`+`isort`: far fewer moving parts and much
faster; its formatting is near-identical to `black` (a few deliberate divergences).
`ruff` vs `pylint`: `pylint` is slower and more opinionated, with rules the community
often finds noisy; `ruff` selects the high-signal rules by default and lets you opt
into more via config.

**Pitfalls:**
- Not setting `line-length` to match the project's convention (this project: 100).
- Not pinning a rule set. Defaults cover the essentials; a production project
  usually widens the net (e.g. add the `UP` modernize rules, `B` bugbear rules,
  `I` isort rules for import ordering).
- Committing code that fails `ruff format` — configure it as a pre-commit hook (see
  §6) so it can't slip through.

---

## 4. `mypy` — static type checking

`mypy` is the de-facto-standard static type checker for Python. It analyzes your
code *without running it* and verifies that the type annotations you wrote are
consistent: that you don't pass a `str` where the function expects `int`, that
every code path returns the declared type, etc.

Why it exists (and why it matters specifically for a *backend*): Python's dynamism
is great for prototyping and terrible for a long-lived codebase. A typo like
`return self.balance - amount` returning `None` by accident, or a function that
sometimes returns a string and sometimes an int, is a runtime crash in production
and often a subtle one. Mypy moves a whole class of these bugs from "discovered by
users at runtime" to "caught by `uv run mypy` before commit." It also makes
refactoring safe and gives the IDE (via type info) accurate autocomplete and
navigation.

**How to get value out of it:**
- Enable **strict mode** (`strict = true` in `[tool.mypy]`). Strict mode turns on
  the meaningful checks: disallowing implicit `Any`, requiring annotations on
  functions, checking untyped calls, etc. Without strict mode, mypy silently skips
  unannotated code and gives you a false sense of safety.
- Annotate everything from day one. On a greenfield project there is no legacy
  untyped code — the entire codebase can be strict from the first commit. That is a
  rare and valuable situation; don't waste it.
- No `Any` unless truly unavoidable, and when it is unavoidable, document *why*.

**Trade-offs / alternatives:**
- **`pyright`** (Microsoft) and its fork **`basedpyright`**: faster, and in some
  edge cases more accurate than mypy; this is what VS Code's Python/Pylance
  language server uses. The catch: it's a Node-based tool (needs a separate runtime)
  and is less entrenched as a CLI/CI gate; mypy is the conservative, ecosystem
  standard and configures cleanly from `pyproject.toml`.
- Decision for this project: **mypy** (confirmed during Module 1) — it matches
  `AGENTS.md`, integrates with `uv run`, and the strict-mode discipline is what you
  actually learn.

**Pitfalls:**
- Running mypy without `strict = true` and assuming you're safe.
- Using `# type: ignore` to silence problems instead of fixing them.
- **Never** using `Any` as a "I'm not sure what type this is" escape hatch — that
  silently disables checking for everything it touches.

---

## 5. `pytest` — the test framework

`pytest` is the standard test runner for Python. It's a strict improvement over the
stdlib `unittest` for new projects:

- **Discovery by convention**: files named `test_*.py`, functions named `test_*`.
  No test suite registration boilerplate.
- **Plain `assert`**: no `self.assertEqual(...)` — pytest rewrites assertions so a
  bare `assert x == y` gives you a rich failure diff.
- **Fixtures**: declarative setup/teardown via `@pytest.fixture`, with automatic
  cleanup and scoping (per-test, per-module, per-session).
- **Parametrization**: `@pytest.mark.parametrize` runs the same test over many
  inputs with almost no duplication.

Why it exists: tests are the safety net that makes the *refactor with confidence*
promise from §4 real. The project's testing strategy (per `AGENTS.md`) is:
**tests exercise the app through the HTTP layer with `TestClient`/`AsyncClient`,
against a real Postgres test database, with `app.dependency_overrides` swapping the
database dependency** (the FastAPI-documented approach). Worth internalizing now,
even before any code exists: the layered architecture exists so that testing can
go through the API while business logic stays in `services/`.

**Trade-offs:** `pytest` vs `unittest` (stdlib): `unittest` is built in and familiar
but verbose, with class-based fixtures that encourage implicit state. `pytest` is
the ecosystem standard for new projects. `hypothesis` (property-based) is a later
rabbit hole; don't add it in Module 1.

**Pitfalls:**
- Tests that depend on shared mutable state across tests — a fixture that returns
  a fresh object per test is what you want; a module-level list that accumulates is
  a bug farm.
- Testing implementation details (private functions) instead of behaviour — tests
  should lock down *what* the code does, so they don't break when you refactor *how*.
- Skipping TDD: writing tests after the fact is fine for coverage, but the
  discipline that really pays off is writing the failing test first and watching it
  go green. The roadmap uses TDD as the preferred style where exercises allow it.

---

## 6. The empty layered skeleton

`AGENTS.md` fixes four packages under `backend/pynance/` from Module 1 onward:

```
api/            presentation layer   — FastAPI routers (added in Module 3)
schemas/        Pydantic API contract (Module 3)
services/       business logic       (Module 3)
models/         SQLAlchemy models    (Module 2)
```

Creating these as **empty packages** now (each with an `__init__.py`, no feature
code) is not busywork. It achieves two things:

1. It makes the architecture a **physical fact** — you cannot accidentally put
   business logic in `api/` if `api/` doesn't exist yet in the layout you're
   building towards. The skeleton is a constant visual reminder of the layer rules.
2. It lets `uv`, `ruff`, `mypy`, and `pytest` be wired up and verified end-to-end
   (imports resolve, tests discover, mypy passes on an empty tree) *before* any
   real code exists. When Module 2 arrives, the only new thing is the code, not the
   plumbing.

**Pitfalls:**
- Adding feature code "just to see it work" before the module that's supposed to
  introduce it. Modules build on each other deliberately; jumping ahead undercuts
  the learning loop.
- Leaving packages as plain directories *without* `__init__.py` — they stop being
  importable packages and the layered imports in later modules break in confusing
  ways.

---

## 7. `pre-commit` — quality gates before the commit

`pre-commit` is a framework that installs **git hooks**: scripts that run
automatically before each `git commit` and can block it if checks fail.

Why it exists: tools only protect you if they actually run. `pre-commit` is the
"you can't forget" layer — instead of remembering to run `ruff format` and `mypy`
manually, the hook does it on every commit. It manages its own isolated
environments for each hook, so your machine's Python state doesn't matter.

Config lives in a `.pre-commit-config.yaml` at the project root: a list of repos
(hooks), their revisions, and which hooks to run.

**Trade-offs:** pre-commit vs CI-only: pre-commit is local and fast-failing, but it
only runs on *your* machine. CI is the authoritative gate that runs everywhere. You
want both: pre-commit for the tight loop, CI for the source of truth (CI isn't in
scope until a later module, so for now pre-commit is the only gate).

**Pitfalls:**
- Installing the hooks file but forgetting `uv run pre-commit install` — the config is
  inert until installed. `uv run pre-commit install` registers the hooks for that repo.
- Adding a hook that auto-modifies your files (e.g. `ruff check --fix`) without
  ever running it once across the whole tree (`uv run pre-commit run --all-files`),
  so the first commit you make gets rewritten under you.
- Slow hooks grinding every commit to a halt — keep the list short and fast.
- Two kinds of hooks, two philosophies:
  - **Mirror hooks** (e.g. `ruff-pre-commit`): pre-commit installs the tool into
    its own isolated environment, *not* your `.venv`. Great when the tool has no
    dependency on your project's packages (ruff lints syntax; it never imports
    your third-party deps).
  - **Local `language: system` hooks** (e.g. mypy via `uv run`): run a command
    in your real environment. Needed when the tool *must* see your project's
    dependencies (mypy must import `sqlalchemy`, `pydantic`, etc.). The mirror
    alternative — listing every dependency in `additional_dependencies` — is
    fragile: you'd re-list each package every time you add one. Running mypy
    through `uv run` avoids that forever.

---

## Developer cheat-sheet — the commands you run while coding

Everything below is run from `backend/`, and **always** through `uv run` — never
bare `python` or `pip`. That includes the pre-commit commands: the pre-commit
binary is installed in `backend/`'s venv (it's a dev dependency of the `pynance`
project), so it must be invoked through `uv run` from `backend/` — not from the
repo root, where uv has no project to find. pre-commit still locates the
`.pre-commit-config.yaml` at the repo root by walking up the tree, and installs the
git hooks into the repo's `.git/hooks` regardless:

| Task | Command |
| --- | --- |
| Sync the environment (first time, or after editing deps) | `uv sync` |
| Add a runtime dependency | `uv add <pkg>` |
| Add a dev-only dependency | `uv add --dev <pkg>` |
| Run the tests | `uv run pytest` |
| Run a single test | `uv run pytest tests/... -v` |
| Lint (find problems) | `uv run ruff check .` |
| Auto-fix lintable problems | `uv run ruff check . --fix` |
| Format (fix style) | `uv run ruff format .` |
| Verify formatting without touching files | `uv run ruff format --check .` |
| Type-check | `uv run mypy .` |
| Install the git hooks once | `uv run pre-commit install` |
| Run all hooks on the whole tree | `uv run pre-commit run --all-files` |
| Run hooks on staged files only (what a commit triggers) | `uv run pre-commit run` |
| Run a single hook | `uv run pre-commit run <hook-id>` |
| Bump hook revisions to latest | `uv run pre-commit autoupdate` |

A typical coding loop: `uv run pytest` to confirm behaviour, `uv run mypy .` after
adding annotations, then `uv run ruff check . --fix` + `uv run ruff format .` before
committing. The pre-commit hooks (§7) run the same checks automatically on every
`git commit` — the manual commands just catch problems earlier. The table will grow
when later modules add `alembic` (migrations) and `uvicorn` (running the server).

---

## The project's config files, annotated

These are the actual files in the repo, explained block by block.

### `backend/pyproject.toml`

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

The PEP 517 build backend declaration. This is what makes `pynance` an
**installable package**: with it present, `uv sync` builds the project and installs
it (editable) into the venv, so `import pynance` works from any directory and mypy
and pytest can resolve the package reliably.

```toml
[project]
name = "pynance"
version = "0.1.0"
description = "Pynance - a personal finance tracking application"
readme = "README.md"
requires-python = ">=3.14"
dependencies = []
```

Project metadata. `name` is PEP 503-normalized (lowercase, no underscores) and
matches the package folder. `requires-python` is a floor, not a pin. Runtime
dependencies are empty for now — nothing real to run yet.

```toml
[dependency-groups]
dev = [
    "mypy>=2.3.0",
    "pre-commit>=4.0",
    "pytest>=9.1.1",
    "ruff>=0.16.1",
]
```

The PEP 735 dev group: tooling that's needed to *develop* but never to *run* the
app. Installed by default with `uv sync`, skipped with `uv sync --no-dev`. Versions
are floors (`>=`), exact resolution lives in `uv.lock`.

```toml
[tool.hatch.build.targets.wheel]
packages = ["pynance"]
```

Tells hatchling exactly which directory is the package. This is what makes the
**flat layout** (`backend/pynance/` instead of `backend/src/pynance/`) buildable.

```toml
[tool.ruff]
line-length = 100
target-version = "py314"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]
```

`line-length` matches the project convention (100). `target-version` tells ruff the
minimum Python it must accept (3.14). The lint rule set: **E** (pycodestyle
errors), **F** (pyflakes — real bugs like unused imports), **I** (import sorting),
**UP** (modernize to current Python idioms), **B** (bugbear — bug-prone patterns).

```toml
[tool.mypy]
python_version = "3.14"
strict = true
```

Strict mode on from day one, target Python pinned to 3.14.

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

`testpaths` tells pytest where to look; `pythonpath = ["."]` puts `backend/` on
`sys.path` during the test run so `import pynance` works without relying on the
editable install.

### `.pre-commit-config.yaml` — warn-only, never modifies

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.16.1
    hooks:
      - id: ruff
      - id: ruff-format
        args: [--check]

  - repo: local
    hooks:
      - id: mypy
        name: mypy
        entry: uv run --project backend mypy --config-file backend/pyproject.toml backend/pynance
        language: system
        pass_filenames: false
```

Every hook here is deliberately **non-modifying**: they report violations and fail
the commit, but never rewrite your files. Fixes are yours to make.

- `ruff` — runs `ruff check` with **no `--fix`**, so it only reports lint problems.
- `ruff-format` with `args: [--check]` — verifies formatting without rewriting.
  (Without `--check`, `ruff format` would rewrite files — that's the modification
  we're deliberately disabling.)
- `mypy` — never edits anything by definition; it only type-checks. This is a
  **local `language: system` hook**: it runs mypy *through `uv run`*, so mypy
  uses the project's real `.venv` and sees every installed dependency (adding a
  dependency needs no config change here — unlike the old `mirrors-mypy` hook,
  which would have required re-listing each package in `additional_dependencies`).
  `--project backend` tells uv where `pyproject.toml` lives (pre-commit runs from
  the repo root); `--config-file backend/pyproject.toml` points mypy at the real
  config; `pass_filenames: false` makes it check the whole `backend/pynance`
  package rather than just changed files, which is the only way strict
  type-checking stays reliable.

Note: the ruff hook rev (`v0.16.1`) tracks the ruff dev-group version — keep them
in sync when you bump. mypy needs no rev here: the local hook always uses whatever
`uv sync` installed.

A pytest fixture to illustrate the fixture concept:

```python
import pytest

@pytest.fixture
def counter():
    value = {"n": 0}
    yield value
    # teardown runs here; nothing to clean up in this case

def test_increment(counter):
    counter["n"] += 1
    assert counter["n"] == 1
```

---

## What to do on your own (the exercise)

1. From the repo root, create `backend/`, then scaffold the Python project inside
   it: `cd backend && uv init --name pynance` (or by hand), and add `pytest`,
   `mypy`, and `ruff` as dev dependencies (`uv add --dev ...`). Make sure
   `uv sync` produces a working `.venv`.
2. Create the four empty packages under `backend/pynance/` per `AGENTS.md` (each
   with `__init__.py`, **no feature code**), plus a `tests/` directory.
3. Configure `ruff` (line-length 100, a deliberate rule set) and `mypy` (`strict`)
   in `pyproject.toml`.
4. Add a **trivial** smoke test (e.g. one that passes trivially) so pytest has
   something to discover, and verify the whole pipeline: `uv run pytest`,
   `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy .`.
5. Write a `.pre-commit-config.yaml` with ruff + mypy hooks, install it (`uv run
   pre-commit install`), and verify `uv run pre-commit run --all-files` passes.

Don't solve any of this project's actual business logic yet — the point is the
plumbing, verified green.
