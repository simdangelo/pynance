# `pydantic-settings` for Configuration

A general guide to `pydantic-settings` — the standard way to manage application
configuration in Pydantic/FastAPI-style Python projects. It reads config from
environment variables (typically via a `.env` file) and validates them into a
typed settings object. No project-specific assumptions.

---

## Why a settings object instead of `os.environ` scattered around

Raw environment access spreads like this:

```python
# everywhere, unchecked
import os

engine = create_engine(os.environ["DATABASE_URL"])
secret = os.environ["SECRET_KEY"]
```

Problems: every read is a string (no type safety), a typo in a key fails only at
runtime, there's no single place listing *what* config exists, and secrets are
easy to print/log by accident. A settings object fixes all of that:

```python
# one place, typed, validated
class Settings(BaseSettings):
    database_url: str
    secret_key: SecretStr


settings = Settings()  # reads .env / env vars, validates
```

Now `settings.database_url` is a `str` you know exists (validation ran at
startup), `settings.secret_key` is a `SecretStr` that redacts itself when
printed, and type checkers know the type of every setting.

## How it works

```python
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    database_url: str
    secret_key: SecretStr
    some_optional: int = 10  # defaults are allowed
```

- Every field maps to an environment variable of the same name (case-insensitive).
- `env_file=".env"` makes it also read from a `.env` file; real environment
  variables take precedence.
- **A field with no default and no value → validation error at import.** That's
  the feature that catches a missing `DATABASE_URL` early, instead of a
  confusing connection failure later.
- Required fields without defaults force you to provide them; optional ones
  carry defaults.

### `SecretStr`

Secrets (DB password, API key) are typed `SecretStr`, not `str`. The value is
real, but printing the object shows `**********` — so a stray `print(settings)`
or a log line doesn't leak credentials. Get the real value explicitly:
`.get_secret_value()`.

### Environment precedence

For a local `.env`, this order holds (roughly): **real env vars > `.env`
file > default values in the class.** That's exactly what you want for
testing — a test can set a variable in the environment and override the `.env`
value without touching any file.

## Where the `.env` file lives

`pydantic-settings` reads `.env` relative to the current working directory, so
the file should live where the app runs from. The `.env` file is **gitignored**
— it contains secrets. You commit a `.env.example` (or document required vars in
the README) instead, so other environments know what to provide.

## Trade-offs and alternatives

- **`pydantic-settings` vs raw `os.environ`**: typed, validated, centralized,
  self-documenting. The standard choice for FastAPI projects.
- **`pydantic-settings` vs a config file (YAML/TOML)**: env vars are the
  12-factor way to configure an app and play well with containers (you pass env
  vars to containers). A config *file* tends to get committed, drift from
  environment, and be the wrong tool for secrets. `.env` + env vars wins.
- **`pydantic-settings` vs `python-dotenv` alone**: `python-dotenv` just loads
  `.env` into `os.environ` — no typing, no validation, no settings object.
  `pydantic-settings` builds on the same idea with Pydantic's validation.

## Pitfalls

- **Missing a required field → app dies at import.** This is correct behavior,
  not a bug — but it's why the `.env` file or env vars must exist before
  anything runs.
- **Forgetting the field in `Settings`** → it stays invisible to the app. The
  class is the contract; every env var you use should be declared.
- **Default for a secret** → never give `secret_key` a default that ends up
  committed. Required (no default) for real secrets.
- **`.env` committed to git** → leaks secrets. Keep it gitignored; commit only
  an example.
- **`SecretStr` vs `str`** — a setting that is a credential but typed `str`
  defeats the redaction. Use `SecretStr` for anything sensitive.

## Minimal illustrative example

The *shape* of a settings module and its use:

```python
# config.py
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str
    secret_key: SecretStr
    debug: bool = False


settings = Settings()
```

```python
# elsewhere
from config import settings

engine = create_engine(settings.database_url)  # typed str
key = settings.secret_key.get_secret_value()  # explicit unwrap
print(settings)  # secret_key=**********
```

The instantiated `settings` object is a single shared instance imported
wherever config is needed — simple, and easy to override in tests by setting
env vars before importing it.
