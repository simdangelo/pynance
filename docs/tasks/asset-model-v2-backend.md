# Backend tasks — Asset model v2: asset class + buckets

> **Stato: completato.** Il backend è stato implementato dall'agente come
> "unblock step" (2026-09-26): 129 test verdi, ruff/format/mypy puliti,
> migrazione `fd3767429296` applicata e testata (up + down) sul DB locale.
> Anche il frontend è stato adeguato alla nuova API. I task sotto restano
> come traccia di cosa è stato fatto e perché; la fonte di verità è il codice.

Riferimenti: `docs/adr/0009-asset-taxonomy-and-buckets.md`,
`docs/wiki/asset-class-e-bucket.md`, `docs/ROADMAP.md` item 9.

Questo file è la tua guida di lavoro: segui i task in ordine e spunta le
caselle. Il codice lo scrivi tu; qui ci sono interfacce, confini e criteri di
accettazione, non l'implementazione.

Regole di progetto da rispettare:
- TDD dove possibile: prima il test (fallisce), poi l'implementazione.
- I test passano **attraverso l'HTTP layer** (`TestClient`), mai chiamando i
  service direttamente.
- `mypy` strict, `ruff` line-length 100, facade + `__all__` sui package.
- I service non importano FastAPI. I model non contengono logica di business
  (niente seed nei model: va nei service).
- Sync SQLAlchemy, nessun repository layer.

Comandi:
```bash
cd backend
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy .
```

Puoi ricreare il DB quando vuoi (dati fake), quindi la migrazione non deve
preservare nulla per forza — ma deve restare corretta per un DB vuoto.

---

- [ ] **0. Preparazione**
  - Crea un branch di lavoro.
  - Riparti da un DB locale pulito se preferisci:
    `docker compose -f docker-compose.yaml -f docker-compose.dev.yaml down -v`
    poi `... up -d db` e `uv run alembic upgrade head`.

- [ ] **1. Tipi (`pynance/models/types.py`)**
  - Rimuovi `AssetType`.
  - Aggiungi:
    - `LiquidityCategory(StrEnum)`: `LIQUID`, `RESERVE`, `INVESTED` (enum
      **nativo**, resta stabile).
    - `AssetClass(StrEnum)`: `CURRENT_ACCOUNT`, `CASH`, `DEPOSIT_ACCOUNT`,
      `MONEY_MARKET_ETF`, `GOVERNMENT_BOND`, `CORPORATE_BOND`, `BOND_ETF`,
      `EQUITY_ETF`, `STOCK`, `REAL_ESTATE`, `OTHER`.
  - Usa `auto()`, come gli enum esistenti: i valori diventano lowercase
    (`"current_account"`, `"liquid"`, ...) — è anche ciò che userà il
    frontend.
  - Aggiorna `pynance/models/__init__.py` (export + `__all__`): escono
    `AssetType`, entrano `AssetClass`, `LiquidityCategory`, `Bucket`.

- [ ] **2. Model `Bucket` (`pynance/models/bucket.py`)**
  - Tabella `buckets`, campi: `id`, `name` (String 255, NOT NULL),
    `description` (String 500, nullable), `liquidity_category`
    (`Enum(LiquidityCategory)`, NOT NULL), `sort_order` (Integer, NOT NULL,
    default 0), `created_at` (DateTime timezone, default `datetime.now(UTC)`),
    `user_id` (FK users, NOT NULL).
  - Relationship `assets: Mapped[list["Asset"]] = relationship(back_populates="bucket")`.
  - `UniqueConstraint("user_id", "name", name="uq_bucket_user_id")`.
  - **Niente** `seed_default_buckets` qui: i model non hanno logica.

- [ ] **3. Model `Asset` (`pynance/models/asset.py`)**
  - Sostituisci `asset_type` con:
    `asset_class: Mapped[AssetClass] = mapped_column(Enum(AssetClass, native_enum=False, create_constraint=True, validate_strings=True, length=32), nullable=False)`
    — il `CHECK` viene generato **solo** con `create_constraint=True`
    (in SQLAlchemy 2.0 il default è `False`).
  - `bucket_id: Mapped[int] = mapped_column(ForeignKey("buckets.id"), nullable=False)`
    (obbligatorio) + relationship `bucket: Mapped[Bucket]`.
  - `@property liquidity_category -> LiquidityCategory` che ritorna
    `self.bucket.liquidity_category` (ora mai `None`).
  - Elimina ogni riferimento a `sub_category` (non esiste) e ai target.

- [ ] **4. Schemi `Bucket` (`pynance/schemas/bucket.py`)**
  - `BucketCreate`: `name`, `liquidity_category`, `description | None`,
    `sort_order | None` (se assente lo calcola il service).
  - `BucketUpdate`: tutti opzionali.
  - `BucketResponse`: `id`, `name`, `description`, `liquidity_category`,
    `sort_order`, `created_at`; `ConfigDict(from_attributes=True)`.

- [ ] **5. Service `Bucket` (`pynance/services/bucket.py`)**
  - Eccezioni in `pynance/services/exceptions.py`: `BucketNotFoundError`,
    `DuplicateBucketNameError`, `BucketNotEmptyError` (con `bucket_id` e
    numero di asset), `InvalidReassignTargetError`.
  - Funzioni:
    - `create_bucket(db, user_id, data) -> Bucket` (409 su nome duplicato;
      `sort_order = max+1` dell'utente se non passato).
    - `get_bucket(db, user_id, bucket_id) -> Bucket` (404 se non suo).
    - `list_buckets(db, user_id) -> list[Bucket]` ordinata per
      `sort_order, name`.
    - `update_bucket(db, user_id, bucket_id, data) -> Bucket` (stesso check
      nome duplicato).
    - `delete_bucket(db, user_id, bucket_id, reassign_to_id: int | None = None) -> Bucket`:
      se il bucket ha asset e `reassign_to_id` è `None` → `BucketNotEmptyError`;
      se presente, valida che il target sia dello stesso utente e diverso dal
      bucket (altrimenti `BucketNotFoundError` / `InvalidReassignTargetError`),
      sposta gli asset, poi elimina.
    - `seed_default_buckets(db, user_id) -> list[Bucket]`: **idempotente** —
      se l'utente ha già almeno un bucket non fa nulla e ritorna `[]`;
      altrimenti crea i 3 default neutri e committa:
      "Liquidità quotidiana" (`LIQUID`, order 0),
      "Fondo di emergenza" (`RESERVE`, order 1),
      "Investimenti" (`INVESTED`, order 2).
  - `DEFAULT_BUCKETS` come costante in questo file (non nel model).

- [ ] **6. Router `Bucket` (`pynance/api/routers/bucket.py`) + registrazione**
  - `POST /api/buckets` → 201; `GET /api/buckets` → 200;
    `GET/PATCH /api/buckets/{bucket_id}` → 200; `DELETE` → 204 con query
    param opzionale `reassign_to: int | None = None`.
  - Errori: 404 not found, 409 nome duplicato, 409 bucket non vuoto,
    422 reassign non valido.
  - Registra in `pynance/api/main.py`: import nel blocco routers +
    `app.include_router(bucket.router, prefix="/api/buckets", tags=["buckets"])`.

- [ ] **7. Seed alla registrazione (`pynance/services/auth.py`)**
  - In `register_user`, dopo il commit dell'utente, chiama
    `bucket_service.seed_default_buckets(db, new_user.id)`.
  - Attenzione all'import: `auth.py` non deve importare il router, solo il
    service.

- [ ] **8. Aggiornare Asset: schemi, service, router + allocation**
  - `pynance/schemas/asset.py`:
    - `AssetCreate`: `name`, `asset_class`, `bucket_id` (obbligatorio),
      `opening_balance`.
    - `AssetUpdate`: aggiungi `asset_class` e `bucket_id` opzionali; togli
      `asset_type`.
    - `AssetResponse`: `asset_class`, `bucket_id`,
      `liquidity_category` (derivata), oltre ai campi attuali.
  - `pynance/services/asset.py`:
    - `create_asset`: valida che il bucket appartenga all'utente
      (`BucketNotFoundError`), imposta `asset_class` e `bucket_id`.
    - `update_asset`: se cambia `bucket_id`, stessa validazione.
    - `list_assets` e `get_asset`: carica il bucket con
      `selectinload(Asset.bucket)` per evitare l'N+1 della property.
    - **Nuova** `get_default_asset(db, user_id) -> Asset | None`: primo asset
      il cui bucket ha `liquidity_category == LIQUID`, ordinato per
      `Bucket.sort_order, Asset.id`; fallback: primo asset con
      `asset_class == CURRENT_ACCOUNT`. Serve a bot, recurring e import.
    - **Nuova** `get_allocation(db, user_id) -> Allocation`:
      - dataclass frozen: `LiquidityAllocationRow(liquidity_category, total)`,
        `BucketAllocationRow(bucket_id, bucket_name, liquidity_category, total)`,
        `Allocation(by_liquidity, by_bucket)`.
      - **Riusa** `get_asset_balances` + la lista asset con bucket caricato,
        raggruppando in Python: non duplicare la formula del saldo in SQL.
      - `by_liquidity`: tutte e tre le categorie, in ordine fisso
        `LIQUID, RESERVE, INVESTED` (anche a 0).
      - `by_bucket`: tutti i bucket dell'utente (anche a 0), per
        `sort_order`.
  - `pynance/api/routers/asset.py`:
    - Aggiorna le costruzioni di `AssetResponse` (create/list/get/update) e
      la `liquidity_category` derivata.
    - Nuovo endpoint `GET /api/assets/allocation` → `AllocationResponse` con
      `LiquidityAllocationRowResponse` / `BucketAllocationRowResponse`.
    - **Ordine delle route**: dichiara `/allocation` **prima** di
      `/{asset_id}` (come già fatto per `/net-worth-trend`), altrimenti
      "allocation" viene interpretato come id.

- [ ] **9. Aggiornare i percorsi che creano/usano asset**
  - `pynance/services/importer.py`: `_get_or_create_liquid` usa
    `get_default_asset`; se non esiste, crea l'asset con
    `asset_class=CURRENT_ACCOUNT` e `bucket_id` = primo bucket per
    `sort_order` (che esiste perché la registrazione lo crea).
  - `pynance/bot/conversation.py`: `_default_asset_id` usa
    `get_default_asset` (stesso comportamento di prima: il "conto di spesa").
  - `pynance/services/recurring_template.py` (generazione): usa
    `get_default_asset` al posto della query su `AssetType.LIQUID`.
  - `scripts/seed_demo_data.py`: crea i 3 bucket e usa `asset_class` +
    `bucket_id` (Conto Corrente → `CURRENT_ACCOUNT` + Liquidità quotidiana;
    Conto Risparmio → `DEPOSIT_ACCOUNT` + Fondo di emergenza; ETF MSCI World
    → `EQUITY_ETF` + Investimenti).
  - `tests/conftest.py`: aggiorna `create_asset` (parametri `asset_class` e
    `bucket_id` opzionale, default = primo bucket dell'utente) e aggiungi un
    helper `create_bucket`.

- [ ] **10. Migrazione Alembic**
  - `uv run alembic revision --autogenerate -m "asset class and buckets"`, poi
    **rivedi** lo script generato: autogenerate non fa le migrazioni di dati.
  - Ordine corretto in `upgrade()`:
    1. crea la tabella `buckets` (e il tipo enum nativo `liquiditycategory`);
    2. aggiungi `asset_class` **nullable** e `bucket_id` **nullable**;
    3. backfill: per ogni utente crea i 3 bucket default; per ogni asset
       mappa `liquid → CURRENT_ACCOUNT` + Liquidità quotidiana,
       `savings → DEPOSIT_ACCOUNT` + Fondo di emergenza,
       `etf → EQUITY_ETF` + Investimenti;
    4. porta `asset_class` e `bucket_id` a `NOT NULL` (con
       `batch_alter_table` se serve);
    5. droppa `asset_type` e, se non più usato, il tipo enum `assettype`.
  - Su DB vuoto i backfill sono no-op: la migrazione deve funzionare lo
    stesso. Non serve un `downgrade` fedele ai dati.
  - Gli enum nativi in Postgres spesso richiedono `create`/`drop` espliciti
    nel migration script: controlla che `liquiditycategory` venga creata
    prima dell'uso e `assettype` eliminato.

- [ ] **11. Test (scrivi prima, poi implementa)**
  - Bucket:
    - la registrazione crea i 3 bucket default, nell'ordine giusto;
    - `POST /api/buckets` 201; nome duplicato 409;
    - `GET /api/buckets` ordinata per `sort_order`;
    - `PATCH` cambia nome/liquidity/ordine; `DELETE` vuoto 204;
    - `DELETE` con asset → 409; con `reassign_to` → 204 e gli asset risultano
      spostati (verifica via `GET /api/assets`);
    - `reassign_to` di un altro utente → 404; cross-user su ogni endpoint →
      404.
  - Asset:
    - create senza `bucket_id` → 422; con bucket di un altro utente → 404;
    - response contiene `asset_class`, `bucket_id` e `liquidity_category`
      derivata dal bucket;
    - cambiare bucket a un asset cambia la sua `liquidity_category`.
  - Allocation:
    - `by_liquidity` somma a net worth; categorie sempre presenti in ordine
      fisso;
    - `by_bucket` contiene tutti i bucket; un transfer tra bucket aggiorna i
      totali.
  - Regressione: aggiorna `test_assets.py`, `test_transfers.py`,
    `test_reports.py` dove usano `asset_type`; l'import continua a
    funzionare (crea l'asset di default con bucket).

- [ ] **12. Definizione di "fatto"**
  - `uv run pytest` tutto verde (i vecchi test aggiornati, non rimossi).
  - `uv run ruff check .` e `uv run ruff format --check .` puliti.
  - `uv run mypy .` pulito.
  - Smoke manuale: registra un utente nuovo → 3 bucket; crea un asset con
    bucket; chiama `/api/assets/allocation` e verifica i totali.
  - `git status` pulito dopo il commit (il frontend verrà adeguato dopo,
    da me: fino ad allora la UI non funzionerà con la nuova API — è
    atteso).

Quando hai finito (o se ti blocchi), passa il codice per la review.
