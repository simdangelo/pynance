# Journal 01 — Setup e tooling del progetto

## Apertura

Il primo modulo del percorso: costruire la **fondazione** del backend prima che esista qualunque codice di funzionalità. L'obiettivo era un ambiente di sviluppo riproducibile (una macchina qualunque, incluso un futuro server CI, può ricrearlo con uno o due comandi) e uno **scheletro a strati vuoto** che incarni l'architettura come fatto fisico. È il modulo da cui dipendono tutti gli altri: la Persistence (02) e la Business Logic + API (03) riempiranno gli strati creati qui.

Il lavoro è confluito in un unico commit, il primo della storia del repository: `dfae580 first commit: project backbone` (2 agosto 2026).

## Le decisioni prese

Il modulo fissa un gruppo di scelte di tooling. Alcune erano già vincolanti da `AGENTS.md` (le *Fixed Technology Choices*): Python gestito con `uv`, linter `ruff`, type checking `mypy` in modalità strict, test con `pytest`, database Postgres (deciso solo in 02). Altre sono emerse lavorando:

- **`pyproject.toml` come unica fonte di verità** — al posto di `requirements.txt` + `setup.py` + file di config sparsi. Tutti i tool leggono lo stesso file, ognuno la propria tabella `[tool.*]`. Concetto generale: vedi `../wiki/pyproject-toml.md`.
- **`uv` come gestore di progetto** — sostituisce `pip`, `virtualenv`, `pip-tools` e, di fatto, `poetry`. Un solo binario, lockfile riproducibile, `uv run` per ogni comando. Concetto: `../wiki/uv.md`.
- **Dipendenze di sviluppo in un gruppo `dev` separato** (`[dependency-groups]`, PEP 735) — pytest, ruff, mypy e pre-commit non devono mai arrivare in produzione; `uv sync --no-dev` installa solo il runtime. Questo è anche il prerequisito della build multi-stage Docker, vedi `09-docker-deploy-and-readiness.md`.
- **Layout piatto** (`backend/pynance/`, non `backend/src/pynance/`) — scelto da `AGENTS.md`; `uv init --package` avrebbe generato il layout `src`, quindi il pacchetto è stato creato a mano. La distinzione progetto-vs-pacchetto è spiegata in `../wiki/uv.md`; il trade-off con il layout `src` è rimandato al journal del deploy (`09-docker-deploy-and-readiness.md`).
- **`ruff` con regole esplicite** (E, F, I, UP, B) e `line-length` a 100 — vedi `../wiki/ruff-mypy.md`.
- **`mypy` strict dal primo giorno** — vedi `../wiki/ruff-mypy.md`.
- **Struttura a strati come scheletro vuoto** — `api/`, `schemas/`, `services/`, `models/` come pacchetti importabili senza feature code. Concetto: `../wiki/layered-structure.md`.
- **`pre-commit` come gate di qualità locale** — hook ruff + mypy, tutti non-modificanti. Concetto: `../wiki/pre-commit.md`.
- **Test attraverso l'HTTP layer contro un Postgres reale** — la strategia di test di `AGENTS.md`, qui solo anticipata (non c'è ancora nulla da testare); il concetto pytest è in `../wiki/pytest-basics.md`.

Due ADR erano già presenti nel commit iniziale, pur riguardando moduli successivi: **ADR 0001** (denaro come `Decimal`, mai float — vedi `../adr/0001-money-as-minor-units.md`) e **ADR 0002** (SQLAlchemy sincrono, non async — vedi `../adr/0002-sync-sqlalchemy.md`). La decisione sync-vs-async è formalmente materia del journal `02-persistence.md`, ma è stata registrata subito perché la scelta del tooling la rende già rilevante: `AGENTS.md` la lasciava deliberatamente aperta.

## Le modifiche al codice

Il commit `dfae580` contiene l'intero backbone del progetto:

| File | Perché |
| --- | --- |
| `backend/pyproject.toml` | Il manifest unico: `[build-system]` (hatchling, PEP 517), `[project]` (nome `pynance` PEP 503-normalizzato, `requires-python >=3.14` come pavimento, dipendenze runtime vuote), `[dependency-groups]` dev (mypy, pre-commit, pytest, ruff), `[tool.hatch.build.targets.wheel] packages = ["pynance"]` (rende costruibile il layout piatto), `[tool.ruff]`, `[tool.mypy]` strict, `[tool.pytest.ini_options]` con `testpaths` e `pythonpath`. |
| `backend/uv.lock` | Il file di blocco, **committato**: è il contratto di riproducibilità. |
| `backend/.python-version` | Contiene `3.14`: dice a `uv` quale interprete usare. |
| `backend/README.md` | Segnaposto vuoto: `pyproject.toml` dichiara `readme = "README.md"` e il file deve esistere. |
| `backend/pynance/{api,schemas,services,models}/__init__.py` | Lo scheletro a strati: quattro pacchetti importabili, nessun feature code. |
| `backend/tests/test_smoke.py` | Un test banale (`assert True`) così `pytest` ha qualcosa da scoprire e la pipeline può essere verificata end-to-end. |
| `.pre-commit-config.yaml` | Alla **radice** del repo, non in `backend/`: gli hook git sono a livello di repository, non di progetto Python. Tre hook: `ruff` (solo check, niente `--fix`), `ruff-format` con `--check`, e `mypy` come hook **locale** `language: system` che gira via `uv run`. |
| `.gitignore` | Generato da gitignore.io (templates Python + editor comuni). |
| `AGENTS.md` | La "costituzione" del progetto: roadmap, architettura, convenzioni. |
| `../adr/0001-*`, `../adr/0002-*` | Le due ADR citate sopra. |
| `../wiki/pyproject-toml.md`, `../wiki/uv.md`, `../wiki/ruff-mypy.md`, `../wiki/pre-commit.md`, `../wiki/layered-structure.md` | Le wiki di concetto estratte dal modulo 1 (concetti generali). |
| `docs/journal/01-project-setup-and-tooling.md` | Questo journal: la storia del modulo. |

### Dettagli non ovvi

- **Il nome `pynance`.** `uv init --name pynance` scrive solo `name = "pynance"` nel manifest; non crea la cartella `pynance/`. Il legame nome-del-manifest ↔ nome-della-cartella è ciò che permette a mypy, pytest e agli import (`from pynance.services import ...`) di risolvere il pacchetto. Il progetto `uv` è la cartella `backend/`; il pacchetto Python è `backend/pynance/` — due "pynance" diversi.
- **`uv init` dentro `backend/`, non alla radice.** La radice del monorepo ospita anche `frontend/` (progetto Node) e `docs/`; un `pyproject.toml` alla radice li avrebbe imprigionati tutti sotto un'unica lockfile e un unico venv.
- **L'hook mypy come hook locale.** Un mirror hook per mypy avrebbe richiesto di elencare ogni dipendenza del progetto in `additional_dependencies`, da aggiornare a ogni aggiunta. Girare mypy attraverso `uv run` (comando locale `language: system`) fa sì che veda sempre l'ambiente reale. In più `pass_filenames: false` gli fa controllare l'intero pacchetto `backend/pynance`, non solo i file in stage — l'unico modo perché lo strict mode resti affidabile.
- **Tutti gli hook sono non-modificanti.** `ruff` senza `--fix`, `ruff-format` con `--check`, `mypy` che per definizione non tocca i file. Le correzioni restano una decisione umana.
- **La versione dell'hook ruff (v0.16.1) è allineata a quella nel gruppo dev**: quando si aggiorna una, va aggiornata l'altra. mypy non ha bisogno di una revisione nel config: l'hook locale usa sempre ciò che `uv sync` ha installato.

## Le insidie incontrate

- **Un `.pyc` finito nel commit iniziale.** Nel primo commit è finito un file compilato (`backend/tests/__pycache__/test_smoke.cpython-314-pytest-9.1.1.pyc`) — tipico caso in cui il `.gitignore` con `__pycache__/` viene aggiunto *dopo* aver già messo in stage, e i file già tracciati sfuggono all'ignore. È stato rimosso nel commit successivo (`b835d4e`). Lezione: controllare sempre `git status`/`git ls-files` prima di committare, per verificare che non sia scivolato dentro nulla di compilato o binario.
- **Il nome del progetto vs la cartella del pacchetto.** Senza `--name pynance`, `uv init` avrebbe chiamato il progetto `backend`, creando un disallineamento con il pacchetto `pynance/` e rompendo la risoluzione degli import.
- **`readme` deve puntare a un file esistente.** `pyproject.toml` dichiara `readme = "README.md"`; senza un `backend/README.md` (anche vuoto), l'installazione del pacchetto fallisce con un errore che non dice la causa vera.
- **Il dualismo lint vs format.** `ruff check` trova problemi, `ruff format` riscrive lo stile. Confonderli produce check che "passano" ma codice non formattato, o formattazioni che non dicono nulla sui bug. Spiegato in `../wiki/ruff-mypy.md`.

## Le verifiche fatte

La sequenza di verifica del modulo — tutto da `backend/`, sempre via `uv run`:

- `uv sync` produce un `.venv` funzionante e coerente con `uv.lock`.
- `uv run pytest` scopre ed esegue il test smoke (verde).
- `uv run ruff check .` pulito, `uv run ruff format --check .` pulito.
- `uv run mypy .` passa sull'albero vuoto (nessun codice da controllare, ma la configurazione strict è attiva senza errori).
- `uv run pre-commit install` registra gli hook nel repo; `uv run pre-commit run --all-files` passa su tutti i file.
- I comandi pre-commit si lanciano **da `backend/` via `uv run`** (il binario pre-commit è nel venv del progetto), mentre il config viene trovato alla radice dal framework e gli hook finiscono in `.git/hooks`.

Il commit `dfae580` è stato creato con questi check verdi: il backbone è "plumbing verde", non feature code.

## Cosa è rimasto aperto

- **La CI come gate autorevole.** Per ora pre-commit è l'unico gate e funziona solo sulla macchina locale; chi può disattivarlo lo fa. La CI (fonte di verità che gira ovunque) è fuori scope fino a un modulo successivo — vedi `../wiki/pre-commit.md` per il trade-off.
- **Layout `src` vs piatto.** Il trade-off è dichiarato ma non esplorato: rimandato al journal del deploy (`09-docker-deploy-and-readiness.md`).
- **La strategia di test vera e propria.** Testare attraverso l'HTTP layer contro un Postgres reale arriva con la business logic (journal `03-business-logic-api-tests.md`); qui c'è solo il test smoke.
- **Feature code.** Gli strati sono vuoti di proposito: `models/` si riempie in 02, `services/`, `schemas/` e `api/` in 03.
- **La documentazione di modulo.** Il vecchio file misto del modulo 1 è stato suddiviso nelle wiki di concetto citate sopra e in questo journal: i concetti generali (pyproject, uv, ruff/mypy, pre-commit, struttura a strati) stanno in `../wiki/`, la storia di questo modulo sta qui.