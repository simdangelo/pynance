# Modulo 3 — Business Logic + API + Test

## Di cosa parla questo modulo

Dopo il modulo 1 (setup e tooling) e il modulo 2 (persistenza, modelli,
migrazioni), l'app aveva un database e dei modelli ma non faceva ancora nulla
di utile. Il modulo 3 la fa *funzionare*: aggiunge il **service layer** (le
regole di business), l'**API HTTP** (router FastAPI + schemi Pydantic) e i
**test che attraversano l'intero percorso** attraverso l'HTTP, contro un
Postgres di test vero. Alla fine c'è una JSON API funzionante per categorie e
transazioni, con i report mensili e una suite di test che dimostra che tutto
funziona.

Questo journal racconta la storia del modulo: le decisioni, i file toccati e
perché, le insidie incontrate e le verifiche fatte. I concetti generali —
l'architettura a strati, la gestione degli errori, il testing attraverso
l'HTTP, i dati derivati — sono spiegati nelle wiki, a cui questo racconto
rimanda.

## Le decisioni prese

- **Testare attraverso l'HTTP contro un database di test vero.** È la
  decisione portante del modulo, e capovolge una tentazione iniziale: niente
  repository finti per testare i servizi in isolamento. I test partono da un
  `TestClient` che avvolge l'app, e la richiesta percorre davvero tutta la
  pila — routing, validazione, servizio, ORM, SQL. Le regole di business si
  verificano attraverso il comportamento che producono. La scelta è codificata
  in `AGENTS.md` (Testing) e nella wiki
  [`test-attraverso-http`](../wiki/test-attraverso-http.md); non ha un ADR
  dedicato, perché è una conseguenza diretta dell'architettura decisa con gli
  ADR 0002 (SQLAlchemy sincrono) e 0003 (tipo derivato).
- **Niente repository layer e niente "dominio puro".** I servizi lavorano
  direttamente con la `Session`. La ragione è pragmatica: c'è un solo database
  e non si prevede di scambiarlo, quindi un'interfaccia di persistenza
  acquisterebbe indirezione senza comprare nulla. Stesso discorso per il
  pattern repository, che esiste per isolare la persistenza dietro
  un'interfaccia: qui non c'è niente da isolare o da simulare. La motivazione
  completa è in `AGENTS.md` (Architettura).
- **Eccezioni di dominio nei servizi, traduzione al confine HTTP.** I servizi
  sono framework-free: sollevano eccezioni di dominio (in
  `services/exceptions.py`), i router le intercettano e le traducono in codici
  di stato. La regola è quella dell'architettura a strati: ogni strato parla la
  sua lingua. Il perché generale è nella wiki
  [`gestione-errori`](../wiki/gestione-errori.md).
- **Gli schemi sono il contratto API, non dati di persistenza.** Gli schemi di
  richiesta (`*Create`/`*Update`) entrano nei servizi come input già validati;
  gli schemi di risposta (`*Response`) sono solo per l'API, con
  `from_attributes=True`. I servizi restituiscono tipi propri (le dataclass dei
  report), mai schemi. Il denaro è `Decimal`, come da ADR 0001.
- **ADR 0003 — il tipo della transazione è derivato dalla categoria.** La
  decisione più importante del modulo, maturata da un bug reale (vedi insidia
  15): `transaction_type` vive solo su `Category`, `Transaction` lo espone come
  proprietà derivata, e il contratto di scrittura non accetta più il campo. Un
  tipo "sbagliato" è strutturalmente irrapresentabile. Registrata in
  [`ADR 0003`](../adr/0003-derived-transaction-type.md).
- **Convenzioni di naming.** CRUD come `create_/get_/list_/update_/delete_`;
  i report seguono la grammatica `<metric>[_by_<dimension>]` con vocabolario
  fisso `summary`/`trend`/`comparison` e il periodo sempre nei query param.
  Registrate in [`docs/NAMING.md`](../NAMING.md).
- **Il campo data della transazione si chiama `occurred_on`**, non `date` —
  la scelta nasce da un crash reale (insidia 2) ed è anche un nome di dominio
  più preciso.

## I file toccati e perché

- **`database.py`** — l'engine, il `SessionLocal` con `expire_on_commit=False`
  e la dipendenza `get_db` come puro setup/teardown (crea la sessione, la
  fornisce, la chiude; *non* committa). La versione iniziale committava in
  `get_db` e produceva risposte con `id`/`created_at` nulli: vedi insidia 1.
- **`models/`** — `category.py` e `transaction.py` (con la proprietà
  `transaction_type` che legge la relazione) e `types.py` con l'enum
  `TransactionType` come `StrEnum`. La colonna `transaction_type` su
  `transactions` è stata rimossa per ADR 0003, con la relativa migrazione.
- **`schemas/`** — `category.py` e `transaction.py`: per ogni entità gli
  schemi `Base`/`Create`/`Update`/`Response`, con `from_attributes=True` sulle
  response, `Decimal` per gli importi (ADR 0001) e `occurred_on` come campo
  data. Per i report: `SummaryResponse`, `SummaryByCategoryRowResponse`,
  `TrendPointResponse`, `TrendByCategoryResponse`, `ComparisonResponse`, che
  rispecchiano le dataclass dei servizi.
- **`services/`** — `category.py` (CRUD) e `transaction.py` (CRUD +
  report: `get_summary`, `get_summary_by_category`, `get_trend`,
  `get_trend_by_category`, `get_comparison`), tutte funzioni che prendono la
  `Session` e sollevano le eccezioni di dominio definite in `exceptions.py`.
  I report restituiscono dataclass (`Summary`, `SummaryByCategoryRow`,
  `TrendPoint`, `TrendByCategory`, `Comparison`), gli input composti sono value
  object (`TransactionFilters` per la lista, `DataRange` per i trend).
- **`api/`** — `main.py` crea l'app e include i router; `routers/category.py`
  e `routers/transaction.py` sono sottili per costruzione: validazione
  automatica dall'annotazione, chiamata al servizio, modellazione della
  risposta, traduzione degli errori. Gli endpoint dei report usano i query
  param (`year`, `month`, `transaction_type`, `start_date`, `end_date`) perché
  filtrano un'unica risorsa logica (vedi insidia 11).
- **`tests/`** — `conftest.py` con l'engine di test, la fixture session-scoped
  che crea lo schema una volta (`Base.metadata.create_all`), la fixture
  `db_session` che pulisce le tabelle a ogni test e la fixture `client` che
  installa `app.dependency_overrides[get_db]` puntando al database di test, più
  gli helper `create_category`/`create_transaction`. I file `test_categories.py`,
  `test_transactions.py` e `test_reports.py` coprono happy path, 404, 422,
  la regressione del tipo derivato e la correttezza dei report.
- **`docs/NAMING.md`** — le convenzioni di naming emerse dal modulo, fissate
  su carta per i moduli successivi.

## Le insidie incontrate

Queste sono le quindici lezioni emerse implementando il modulo — ognuna era
un errore reale prima di diventare una regola. I concetti generali dietro le
più grosse hanno una wiki dedicata, indicata a margine.

**1. `get_db` non deve committare — e serve `expire_on_commit=False`.** La
prima versione committava dopo il `yield`. Due guai: il commit avveniva
* dopo* che FastAPI aveva serializzato la risposta, quindi `id` e `created_at`
tornavano `null`; e `expire_on_commit` di default è `True`, causando ri-query a
sorpresa. La cura: `get_db` è solo setup/teardown (committa il servizio, che
fa anche `refresh`), e `sessionmaker(..., expire_on_commit=False)`. Tutto
spiegato nella wiki [`sqlalchemy-sessions`](../wiki/sqlalchemy-sessions.md).

**2. Un nome di campo che ombreggia la propria annotazione di tipo.**
`date: date | None = None` nell'`Update`: il nome del campo si lega al default
`None` *prima* che l'annotazione venga valutata, quindi `date | None` diventa
`None | None` → `TypeError` all'import. Il campo è stato rinominato
`occurred_on`, che è anche un nome di dominio migliore. Regola: non dare mai a
un campo il nome di un tipo che importi. Vedi la wiki
[`pydantic-schemas`](../wiki/pydantic-schemas.md).

**3. Un rename nello schema richiede una migrazione — e la migrazione va
revisionata.** Rinominare `date` → `occurred_on` nel modello senza migrare
faceva fallire l'`INSERT` ("column occurred_on does not exist"). Peggio:
l'autogenerate leggeva il rename come drop+add (distruttivo per i dati) e
aggiungeva un vincolo senza nome. L'abitudine "revisiona prima di applicare"
del modulo 2 ha ripagato: la migrazione corretta usava
`op.alter_column(..., new_column_name=...)` e un vincolo nominato.

**4. Gli update parziali devono ragionare sui *valori effettivi*.** Il
controllo dell'invariante confrontava `update.category_id != transaction.category_id`,
ma un campo non fornito è `None`, e `None != 3` è sempre vero: ogni PATCH che
toccava solo l'importo faceva scattare un falso 404. La cura: calcolare prima
i valori effettivi (campo fornito, altrimenti valore corrente) e confrontare e
ri-validare *quelli*.

**5. `DELETE` → 204 significa nessun body.** FastAPI rifiuta `response_model`
combinato con `status_code=204` (assert "must not have a response body"). La
route di delete restituisce `None` e nessun response model. È semantica HTTP,
non un capriccio: dopo una delete non c'è una risorsa da rappresentare. Vedi la
wiki [`fastapi-basics`](../wiki/fastapi-basics.md).

**6. Le route statiche prima di quelle parametrizzate.** `GET /summary`
dichiarato *dopo* `GET /{transaction_id}` viene catturato dal matcher e fallisce
con 422 ("value is not a valid integer"). Le route statiche si dichiarano prima
di quelle con parametri di path. Vedi la wiki [`fastapi-basics`](../wiki/fastapi-basics.md).

**7. `response_model` deve essere lo schema `*Response`, non `*Create`.**
Usare `TransactionCreate` come response model avrebbe tolto `id` e `created_at`
dalla risposta. Gli schemi di output sono `*Response`; gli schemi di input sono
`*Create`/`*Update`.

**8. I report restituiscono dataclass nominate, non tuple.** Un
`tuple[Decimal, Decimal]` non dice quale dei due è l'income. Una piccola
dataclass `Summary(income, expense)` è auto-documentante e si mappa in modo
pulito sullo schema di risposta. Stessa logica per le righe dei report
by-category.

**9. Gotchas delle query SQLAlchemy.** Le parole chiave `and`/`or` di Python
non costruiscono condizioni SQL: si passano le condizioni come argomenti
separati di `.where()` (AND implicito). Selezionare una colonna + `func.sum`
richiede `.group_by()`, o Postgres rifiuta l'aggregato non raggruppato. I
risultati si spacchettano come tuple: `.scalar_one_or_none()` per le lookup,
`.scalars().all()` per le liste.

**10. I valori di uno `StrEnum` sono minuscoli.** `TransactionType` con
`auto()` produce valori `"income"`/`"expense"`. Pydantic valida contro il
*valore*, quindi i client JSON devono mandare minuscolo, non `"EXPENSE"`. Vedi
la wiki [`pydantic-schemas`](../wiki/pydantic-schemas.md).

**11. I parametri di path identificano risorse; i query param filtrano.** Gli
endpoint di report prendono `year`/`month`/`transaction_type` come query param,
non come segmenti di path: filtrano un'unica risorsa logica (un report), non
identificano risorse separate. In più i query param sono validati in automatico
(`?month=bad` → 422, tipo enum sbagliato → 422) e non collidono con altre
route. Ragionamento completo nella wiki [`fastapi-basics`](../wiki/fastapi-basics.md).

**12. L'integrità referenziale: il vincolo è il garante, il servizio il
messaggero.** Cancellare una categoria referenziata ha due livelli. Il
database è la garanzia dura: la FK senza `ondelete` è `ON DELETE NO ACTION`,
Postgres rifiuta la cancellazione in modo atomico e immune alle race
condition. Il servizio è il livello UX: traduce l'`IntegrityError` grezzo
(che altrimenti sarebbe un 500 con interni) in un 409 con un messaggio
leggibile. La lezione è EAFP: procedi e traduci l'opposizione del database —
sicuro *perché* il vincolo esiste. Un pre-check ha una race condition (tra il
controllo e la delete un'altra richiesta può inserire una transazione
referenziante). Attenzione: la traduzione incondizionata è sicura solo se
l'insieme di vincoli che possono scattare è unico (qui, solo la FK verso le
transazioni). Vedi la wiki [`gestione-errori`](../wiki/gestione-errori.md).

**13. I filtri di una lista come value object.** Quando la lista cresce con
filtri opzionali (`q`, `year`, `month`, `category_id`), non si allunga la firma
con parametri posizionali: si passa un'unica dataclass `TransactionFilters`, e
il servizio appende condizioni solo per i campi valorizzati
(`.where(*conditions)` con lista vuota è una query valida "senza filtri"). Lo
stesso pattern per i report: `DataRange` per i trend. La validazione di merito
("month senza year") vive nel servizio: `MonthWithoutYearError` tradotta in 400
nel router.

**14. Testa i casi limite *e* il mezzo — il bug "passato per fortuna".**
L'endpoint di confronto (mese corrente vs precedente) aveva un bug subdolo:
`previous_year = current_year - 1` veniva eseguito *sempre*, quindi confrontare
agosto 2026 cercava luglio 2025. La suite aveva già un test di passaggio
gennaio→dicembre — e passava! Perché a gennaio il decremento incondizionato
coincide per caso con quello corretto. Il bug è emerso solo aggiungendo un
confronto in un mese *non* di gennaio. Due lezioni: un test che passa non è una
prova di correttezza, è una prova dei soli casi che esercita; e i casi limite
essenziali possono mascherare i bug che appaiono lontano dal confine. Vedi la
wiki [`test-attraverso-http`](../wiki/test-attraverso-http.md).

**15. Dati derivati: normalizzare, non sincronizzare.** Il bug che ha
generato ADR 0003: memorizzare `transaction_type` sia su category sia su
transaction con un'invariante "devono combaciare" nel servizio. Riclassificare
una categoria lasciava le sue transazioni col vecchio tipo — il classico
sintomo di un duplicato denormalizzato e del suo percorso di aggiornamento
dimenticato. La cura non è stata più codice di sincronia, ma la rimozione della
copia: la colonna su `transactions` è sparita, `Transaction` la deriva con una
proprietà che legge la categoria, e i report raggruppano via join su
`categories.transaction_type`. Ora l'incoerenza è strutturalmente impossibile.
Il concetto generale è nella wiki [`dati-derivati`](../wiki/dati-derivati.md);
la decisione formale in [`ADR 0003`](../adr/0003-derived-transaction-type.md).
La proprietà derivata nasconde però un costo: legge la categoria a ogni accesso,
quindi una lista di transazioni fa N+1 query — risolto dopo con l'eager
loading (`selectinload`), senza cambiare il design. Vedi la wiki
[`n-plus-one`](../wiki/n-plus-one.md).

## Le verifiche fatte

- **`uv run pytest`** sull'intera suite del modulo, che attraversa l'HTTP
  contro il database di test `pynance_test_db` (schema creato da
  `Base.metadata.create_all`): happy path CRUD per categorie e transazioni,
  `404` su id inesistenti, `422` su input malformati, **regressione del tipo
  derivato** (riclassificata la categoria, la transazione riporta il nuovo
  tipo — il test del bug ADR 0003), correttezza dei report (dati seminati
  noti, totali attesi), e il confronto tra mesi con il caso non-gennaio che ha
  scovato il bug dell'insidia 14.
- **`uv run ruff check .`** e **`uv run mypy .`** verdi, come da pipeline del
  progetto.
- Il tutto sempre dietro `uv run`, per convenzione del progetto.

## Cosa è rimasto aperto

- **La variante snapshot per un registro auditato.** ADR 0003 ha scelto la
  riclassificazione retroattiva (la storia segue la categoria); l'alternativa
  del fotogramma immutabile è documentata nell'ADR come la scelta giusta se un
  giorno servisse una contabilità auditata.
- **Il costo N+1 della proprietà derivata.** Documentato nella wiki
  `n-plus-one` e risolto in un modulo successivo con `selectinload`; al
  momento del modulo era una consapevolezza, non ancora un fix.
- **L'ownership per-utente.** I modelli non hanno ancora un `owner_id`; la
  decisione è rimandata al modulo Auth, e il design è stato tenuto in modo da
  non precluderla.
- **La granularità dei report.** La grammatica di naming tiene il periodo nei
  dati, non nei nomi, proprio per lasciare aperte granularità future
  (settimanale, ecc.) senza cambiare forma.
- **"Chi committa":** il modulo ha scelto che committa il servizio (con
  `refresh`), lasciando `get_db` come puro teardown; l'alternativa (commit in
  `get_db`) è documentata nella wiki `sqlalchemy-sessions` come scelta
  legittima, da non mescolare.