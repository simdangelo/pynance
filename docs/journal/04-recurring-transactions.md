# Modulo 4 — Transazioni ricorrenti

## Di cosa parla questo modulo

Il primo **prodotto** costruito sui moduli di apprendimento, tracciato in [`docs/ROADMAP.md`](../ROADMAP.md). Dopo il modulo 3 l'app aveva categorie, transazioni, report mensili e una suite di test verde; mancava però la risposta a un bisogno concreto della vita reale: affitto, stipendio e abbonamenti si ripetono con una scadenza, e reinserirli ogni mese è dispersivo ed error-prone.

La risposta introduce la prima entità che **produce altre entità**: un *template* che genera transazioni normali. Il modulo è una fetta verticale completa — modello + migrazione, service layer, API, test e pagina frontend (scritta dall'agente, come da `AGENTS.md`). Dipende solo da `Transaction` e `Category`: niente asset, ancora.

Il lavoro si è svolto in due passaggi, seguendo il ciclo di review di `AGENTS.md`: prima l'implementazione iniziale (business logic + test), poi un'iterazione nata dalla review che ha **ristretto la generazione alle occorrenze dovute** — la storia è nell'insidia 4.

## Le decisioni prese

- **Il template è una fabbrica, non un genitore.** Una transazione generata è una `Transaction` normale e completamente indipendente: modificabile, cancellabile, inclusa nei report, senza alcun legame col template. Il template crea; non risincronizza mai ciò che ha creato. Un modello "collegato e rigenera" sovrascriverebbe le correzioni dell'utente (hai sistemato l'affitto del mese scorso all'importo reale; rigenerare lo cancellerebbe). Le righe generate sono transazioni normali, quindi confluiscono nei report esistenti senza toccare nulla.

- **Generazione on-demand, non automatica.** L'unica operazione è "genera la prossima occorrenza" (`generate-next`): niente scheduler, niente duplicazione silenziosa, saltare un mese è banale. Il principio: l'app registra *ciò che è*, non simula *ciò che sarà*.

- **La scadenza è un campo calcolato dal backend.** Ogni template espone `due` (`next_occurrence <= today`): campo derivato, mai memorizzato — lo stesso principio di ADR 0003, spiegato in [`../wiki/dati-derivati.md`](../wiki/dati-derivati.md). La UI mostra il badge ma non fa la matematica.

- **`active` invece di cancellare.** Un template che potresti riprendere (l'abbonamento alla palestra in pausa) non va cancellato: `active=False` ferma la generazione senza perdere la storia. La cancellazione resta per i casi definitivi.

- **Frequenze e avanzamento della data.** L'enum `Frequency` ha `yearly`/`monthly`/`weekly`/`custom`. L'avanzamento usa `relativedelta` di `python-dateutil` (dettagli in Insidie). `custom` avanza di `interval` settimane — l'unità è fissa a settimane, vedi Cosa è rimasto aperto.

- **Generare solo occorrenze dovute.** `generate_next` rifiuta con 409 sia un template in pausa sia un'occorrenza non ancora dovuta (`next_occurrence > today`). Non è un dettaglio: impedisce di pre-riempire mesi futuri e rende il catch-up l'unico modo per recuperare occorrenze saltate.

## I file toccati e perché

- **`backend/pynance/models/types.py`** — aggiunto l'enum `Frequency(StrEnum)` (`YEARLY`/`MONTHLY`/`WEEKLY`/`CUSTOM`), accanto a `TransactionType`, seguendo il pattern dei tipi condivisi.

- **`backend/pynance/models/recurring_template.py`** — il modello `RecurringTemplate`: `description`, `amount` (`Numeric(12, 2)`, come da [`ADR 0001`](../adr/0001-money-as-minor-units.md)), `category_id` (FK non nullable — il tipo della transazione generata deriverà dalla categoria, [`ADR 0003`](../adr/0003-derived-transaction-type.md)), `frequency`, `interval` (default 1), `next_occurrence` (date — il "puntatore" del template), `active` (default True), `created_at`. Espone la proprietà `due` (`next_occurrence <= today`): la logica di business del badge vive qui. Come da convenzione, il package `models/__init__.py` ri-esporta il modello e i consumatori importano dalla facciata (vedi [`../wiki/python-package-facade.md`](../wiki/python-package-facade.md)).

- **`backend/alembic/versions/b9cabe167c35_add_recurring_templates_table.py`** — la migrazione autogenerata che crea la tabella e l'enum SQL `frequency`, revisionata prima di applicarla (l'abitudine del modulo 2; vedi [`../wiki/alembic.md`](../wiki/alembic.md)).

- **`backend/pynance/schemas/recurring_template.py`** — `RecurringTemplateBase`/`Create`/`Update`/`Response`, con `ConfigDict(from_attributes=True)` sulla response (pattern `Base`/`Create`/`Update`/`Response`, vedi [`../wiki/pydantic-schemas.md`](../wiki/pydantic-schemas.md)). Il campo `due` compare **solo** nella `Response`: è output puro, calcolato dal backend.

- **`backend/pynance/services/exceptions.py`** — tre eccezioni di dominio: `RecurringTemplateNotFoundError` (→ 404), `PausedTemplateError` (→ 409), `NextOccurrenceNotDueError` (→ 409). Seguono la convenzione (suffisso `Error`, sottoclasse di `Exception`); il *perché* della traduzione al confine HTTP è in [`../wiki/gestione-errori.md`](../wiki/gestione-errori.md).

- **`backend/pynance/services/recurring_template.py`** — CRUD (`create_recurring_template`, `list_recurring_templates`, `update_recurring_template`, `delete_recurring_template`) e il cuore del modulo, `generate_next`:
  1. recupera il template (→ 404 se manca);
  2. se `not active` → `PausedTemplateError`;
  3. se `next_occurrence > oggi` → `NextOccurrenceNotDueError`;
  4. costruisce la `Transaction` con `occurred_on = template.next_occurrence` (non oggi!), importo e categoria del template;
  5. avanza `next_occurrence` in base alla frequenza — uno `match` sull'enum: `relativedelta(years/months)` per annuale/mensile, `timedelta(weeks)` per settimanale, `relativedelta(weeks=interval)` per `custom`;
  6. **un solo `db.commit()`** per la nuova transazione e il puntatore avanzato;
  7. `refresh` su entrambi e restituisce la transazione.
  `create_recurring_template` e `update_recurring_template` validano l'esistenza della categoria (→ 404); l'update usa il pattern `model_dump(exclude_unset=True)` già visto per le altre entità.

- **`backend/pynance/api/routers/recurring_template.py`** — il router sottile: un endpoint per operazione, ognuno chiama un solo servizio e traduce le eccezioni di dominio in `HTTPException` (il `try/except` è l'unico posto dove `HTTPException` appare). La route `POST /{id}/generate` risponde con `TransactionResponse` (201): attraversa il confine verso le transazioni, quindi il response model è quello di `Transaction`, non del template. Pausa e occorrenza futura → 409, template mancante → 404.

- **`backend/pynance/api/main.py`** — registrazione del router con `prefix="/api/recurring-template"` e tag dedicato. Il percorso è **singolare**: nota su `docs/NAMING.md` in Cosa è rimasto aperto.

- **`backend/pyproject.toml` + `uv.lock`** — aggiunte `python-dateutil` (per l'aritmetica dei mesi) e `types-python-dateutil` nel gruppo dev (stub per mypy strict).

- **`backend/tests/conftest.py`** — helper `create_recurring_template` (posta un template via API e ne asserisce il 201) e pulizia della tabella `recurring_templates` a ogni test, accanto a `Transaction` e `Category`.

- **`backend/tests/test_recurring_templates.py`** — la suite del modulo (dettagli in Verifiche).

- **`frontend/`** — `pages/recurring.tsx` (lista dei template con badge di stato e azione "genera"), `components/recurring-dialog.tsx` (crea/modifica), voce nel layout, e i tipi `Frequency`/`RecurringTemplate`/`RecurringTemplateInput` in `types/api.ts`.

- **`docs/ROADMAP.md`** — stato della feature portato a `in progress` durante il modulo (il `done` definitivo è arrivato col commit del modulo 5) e decisioni di design registrate, compreso il campo `due`.

## Le insidie incontrate

**1. `timedelta` non sa "aggiungere un mese".** `timedelta(days=30)` non è un mese: l'aritmetica dei mesi va costruita dai componenti della data, ed è emerso il classico bordo — che significa "mensile dal 31 gennaio"? La scelta fatta è stata affidarsi a `relativedelta` (dateutil), che **clampa** al fondo del mese: 31 gen + 1 mese → 28 feb (e 29 feb + 1 anno → 28 feb nei non bisestili). La decisione è documentata e coperta da un test dedicato (`test_monthly_generation_clamps_end_of_month`).

**2. La transazione generata si data con `next_occurrence`, non con oggi.** La tentazione è riusare il default "adesso" delle transazioni normali. Sbagliato: la generazione registra *quando l'occorrenza era dovuta*, che può essere anche settimane nel passato (catch-up). `occurred_on = template.next_occurrence`.

**3. Un solo commit per transazione e puntatore.** Se committi la nuova `Transaction` ma non l'avanzamento di `next_occurrence`, la generazione successiva produce un **duplicato** (stessa data). L'inserimento e l'avanzamento devono essere un'unica transazione di database: un `db.commit()` dopo entrambe le modifiche (vedi [`../wiki/sqlalchemy-sessions.md`](../wiki/sqlalchemy-sessions.md)).

**4. Nella prima versione si poteva generare nel futuro — la review lo ha bloccato.** L'implementazione iniziale guardava solo il `paused`; nulla impediva di pre-riempire il mese prossimo. La review ha fatto emergere che questo contraddice il principio "registra ciò che è": la guardia `next_occurrence > today → NextOccurrenceNotDueError` (409) è arrivata nell'iterazione successiva. Nello stesso giro il campo `overdue` (`next_occurrence < today`) è diventato `due` (`<= today`): un'occorrenza che scade *oggi* non è "overdue", è semplicemente dovuta — il confine `<=` rende il nome onesto e il badge coerente (pausa → programmato → dovuto). La lezione di processo: la review non verifica solo la correttezza tecnica, ma che il comportamento rispetti le regole di dominio dichiarate a inizio modulo.

**5. `due` non va mai memorizzato.** È derivato da `next_occurrence` + oggi: memorizzarlo sarebbe un duplicato denormalizzato da tenere sincronizzato — il bug che [`ADR 0003`](../adr/0003-derived-transaction-type.md) ha eliminato altrove. È una proprietà calcolata sul modello.

**6. Cancellare invece di disattivare.** Cancellare un template perde la sua storia. La pausa con `active=False` è l'operazione di default; la delete resta per i casi davvero definitivi.

**7. `dateutil` senza stub fa arrabbiare mypy strict.** `python-dateutil` non porta i tipi: senza `types-python-dateutil` nel gruppo dev, mypy si ferma. Dipendenza runtime e stub vanno aggiunti insieme.

## Le verifiche fatte

- **`uv run pytest`** sull'intera suite, attraverso l'HTTP contro il database di test (schema da `create_all`; vedi [`../wiki/test-attraverso-http.md`](../wiki/test-attraverso-http.md)):
  - CRUD: create 201 (e 404 se la categoria non esiste), list, update parziale, delete 204 (e 404 su id inesistente);
  - **generate**: crea la transazione con `occurred_on` = `next_occurrence` e il tipo derivato dalla categoria (`expense` — ADR 0003); la transazione è una transazione normale, leggibile da `GET /transactions/{id}`; avanza il puntatore (mensile 1 giu → 1 lug; settimanale +7 giorni; custom `interval=2` → +14 giorni);
  - i rifiuti: pausa → 409, occorrenza futura → 409 **e il puntatore non si muove**, template inesistente → 404;
  - **idempotenza per occorrenza**: generare due volte di fila produce due transazioni con date diverse (giu e lug) — il puntatore avanzato garantisce niente duplicati;
  - **il flag `due`**: occorrenza passata e di oggi → `true`, futura → `false`;
  - **il clamp mensile**: 31 gen → 28 feb.
- **`uv run alembic upgrade head`** dopo aver revisionato la migrazione autogenerata.
- **`uv run ruff check .`** e **`uv run mypy .`** verdi.
- La pagina frontend verificata nel giro di sviluppo (`npm run dev`): lista, dialogo crea/modifica, badge di stato e azione di generazione.

## Cosa è rimasto aperto

- **Template → asset.** Il ROADMAP lasciava aperto se un template debba puntare a un asset quando gli asset esisteranno; il modulo 5 (Asset) ha esplicitamente rimandato l'integrazione a una decisione successiva.
- **Ownership per-utente.** Nessuna colonna utente sul template in questo modulo; il modulo Auth aggiungerà il `user_id`, come per le altre entità.
- **`custom` con unità fissa a settimane.** Il design pensava a "intervallo × unità"; l'implementazione ha fissato l'unità a settimane. Estendere l'unità (mesi, anni) è possibile aggiungendo un campo, senza cambiare la forma del modello.
- **Endpoint singolare.** Il percorso reale è `/api/recurring-template`, mentre [`docs/NAMING.md`](../NAMING.md) prescrive il plurale per le collezioni (`/<entities>`). Da decidere se allinearsi.
- **Riclassificazione retroattiva delle generate.** Le transazioni generate seguono ADR 0003: il tipo si legge dalla categoria al momento della lettura, quindi riclassificare una categoria riclassifica anche le transazioni generate in passato. La variante snapshot immutabile resta documentata in [`ADR 0003`](../adr/0003-derived-transaction-type.md) per una futura contabilità auditata.
- **La documentazione del modulo.** Il vecchio file misto (inglese, metà guida di concetto metà esercizio) è stato trasformato in questo journal: la storia del modulo sta qui, i concetti generali estraibili stanno nelle wiki a cui il racconto rimanda.