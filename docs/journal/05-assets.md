# Modulo 5 — Asset e trasferimenti: dove vive il denaro

Secondo *product feature* del progetto (tracciato in `../ROADMAP.md`, passo 2),
costruito sopra la pila ormai stabile dei moduli 2–4: persistenza, business
logic + API + test, e transazioni ricorrenti. Le transazioni ricorrenti
rispondono a *quando* il denaro si muove; questo modulo risponde a *dove* sta.
Introduce due idee nuove: un **posto dove mettere il denaro** (l'asset) e un
**movimento tra posti** (il trasferimento). Il modulo inverte una decisione
vecchia: il modulo 2 aveva rimandato volutamente gli account; ora che il modello
delle transazioni è stabile ([ADR 0003](../adr/0003-derived-transaction-type.md)
gli ha dato una direzione pulita), il
concetto atterra sopra senza rifattorizzare nulla. È, in pratica, il "tenere
d'occhio le future relazioni `owner_id` senza aggiungerle prematuramente" di
`AGENTS.md`: lo schema era cresciuto nella forma giusta, e la nuova entità ci
sta sopra in modo pulito.

La scelta di fondo — asset come pool nominato, saldi **derivati mai
memorizzati**, trasferimento come entità separata a due FK — è registrata in
[ADR 0004](../adr/0004-assets-and-transfers.md). I concetti generali dietro il
lavoro stanno nelle wiki: i [dati derivati](../wiki/dati-derivati.md) (perché
un saldo non è una colonna), la [gestione degli errori](../wiki/gestione-errori.md)
(eccezioni di dominio e traduzione al confine), l'[architettura a
strati](../wiki/architettura-a-strati.md) (il calcolo vive nel service layer) e
le [migrazioni Alembic](../wiki/alembic.md).

Il lavoro del modulo è confluito in un commit principale, `a75cebc` "feat: add
assets and transfers (module 5) + tests" (23 agosto 2026), seguito nello stesso
pomeriggio dal trend del net worth (`8e411ea` "feat: add net worth trend api") e
dal fix del clamp al primo transazione (`d71a9f2`).

---

## Le decisioni prese

- **Una sola tabella `Asset` con un enum `type`.** Flessibilità dai dati, non
  dallo schema: due conti correnti = due righe con tipo `liquid`; un nuovo tipo
  di pool (crypto, obbligazioni) = un valore nuovo dell'enum, nessun intervento
  chirurgico sullo schema. Il tipo è una **classificazione**, non uno switch di
  comportamento: l'app tratta tutti gli asset allo stesso modo, il tipo serve
  per raggruppare, riportare e (più avanti) la vista allocazione.
- **I saldi sono derivati, mai memorizzati.** Un saldo è una funzione di ogni
  transazione e trasferimento passato: memorizzarlo crea il duplicato
  denormalizzato con percorso di aggiornamento che ADR 0003 ha eliminato da
  `transaction_type`. La formula: `saldo = opening_balance + (entrate − uscite)
  + (trasferimenti in) − (trasferimenti out)`. Stesso principio del flag `due`
  del modulo 4 e della wiki [dati-derivati](../wiki/dati-derivati.md).
- **`opening_balance` come condizione iniziale.** È l'importo che era nel pool
  *prima* che iniziassi a tracciare le transazioni: senza, un conto aperto da
  anni mostrerebbe un saldo sbagliato (quasi zero). È un **fatto** (il seme),
  non un valore derivato, quindi non viola la regola dei saldi non memorizzati.
  Limite onesto accettato: i saldi sono ricostruibili solo dall'inizio del
  tracciamento; il periodo precedente è irrecuperabile per qualsiasi design.
- **Il trasferimento è un'entità separata a due FK, non un tipo di
  transazione.** Spostare denaro non è né entrata né uscita: è un ribilanciamento.
  Forzarlo in `transactions` romperebbe la fonte unica di verità della direzione
  (ADR 0003) o richiederebbe una categoria "trasferimento" che non significa
  nulla per i report. Il trasferimento non ha categoria né semantica
  income/expense: ha `source_asset_id`, `destination_asset_id`, importo,
  descrizione e data.
- **`Transaction.asset_id` obbligatorio.** Ogni transazione appartiene a un
  asset; per la maggior parte delle persone quasi tutto finisce nello stesso
  pool (liquid), e va bene così: la colonna ripaga quando un bonus viene pagato
  sul risparmio o una bolletta parte da un altro conto.
- **Self-transfer vietato** (`source != destination`), validato nel service sia
  su create sia su update; il `CheckConstraint` sul database è il garante
  finale.
- **I trasferimenti sono modificabili ed eliminabili** come le transazioni — si
  possono registrare male e correggere.
- **Cancellare un asset referenziato viene rifiutato (409)**, finché le sue
  transazioni/trasferimenti non sono spostati — stessa regola delle categorie
  con transazioni.
- **I template ricorrenti non vengono toccati** in questo modulo: lo slot del
  roadmap (template che puntano a un asset, o template di trasferimento) resta
  aperto ed è una decisione separata.
- **Segno delle transazioni dalla categoria, segno dei trasferimenti dalla
  direzione.** Le prime si sommano/sottraggono in base a
  `Category.transaction_type` (ADR 0003); un trasferimento aggiunge sul
  destinatario e sottrae sulla sorgente — è proprio per questo che il net worth
  resta piatto.
- **Naming** come da [`docs/NAMING.md`](../NAMING.md): CRUD
  `create_/get_/list_/update_/delete_`; per il trend del net worth la grammatica
  dei report (`metric` cumulativa, periodo nei query param `start_date`/`end_date`).

## Le modifiche al codice

### Modelli e migrazioni

- **`models/asset.py`** (nuovo) — `Asset`: `id`, `name` (unico), `asset_type`
  (enum `AssetType`), `opening_balance` (Numeric(12,2), NOT NULL, default 0),
  `created_at`. Niente logica, come da convenzione.
- **`models/transfer.py`** (nuovo) — `Transfer`: le due FK verso `assets`
  (`source_asset_id`, `destination_asset_id`), `amount`, `description`,
  `occurred_on`, `created_at`, più il `CheckConstraint("source_asset_id <>
  destination_asset_id")` nominato `source_ne_destination`.
- **`models/types.py`** — aggiunto `AssetType(StrEnum)` con `LIQUID`, `SAVINGS`,
  `ETF` accanto agli enum esistenti.
- **`models/transaction.py`** — aggiunto `asset_id` (FK verso `assets`,
  NOT NULL) e la relazione `category` già esistente resta invariata.
- **`models/__init__.py`** — il facade esporta `Asset`, `AssetType`,
  `Transfer` (import + `__all__`), altrimenti Alembic non vede le tabelle e la
  migrazione autogenerata "non genera nulla" — la causa ricorrente di quel
  sintomo, già incontrata nei moduli precedenti.
- **Migrazione `0b2639f80016`** — crea `assets` e `transfers`, aggiunge
  `transactions.asset_id` NOT NULL con la FK.
- **Migrazione `c0868db1c4b8`** — aggiunge `opening_balance` a `assets`. Due
  migrazioni perché il campo è arrivato *dopo* la prima autogenerazione,
  quando il modello si è arricchito: un esempio concreto del "revisiona la
  bozza autogenerata" della wiki [alembic](../wiki/alembic.md).

### Schemi (`schemas/`)

- **`schemas/asset.py`** (nuovo) — `AssetBase`/`AssetCreate`/`AssetUpdate`/
  `AssetResponse`; la response aggiunge `balance: Decimal` (il valore
  **calcolato**) e `ConfigDict(from_attributes=True)`.
- **`schemas/transfer.py`** (nuovo) — `TransferBase`/`Create`/`Update`/
  `Response`; la response espone gli **id** degli asset
  (`source_asset_id`, `destination_asset_id`), non i nomi: il frontend risolve i
  nomi come fa per le categorie.
- **`schemas/transaction.py`** — aggiunto `asset_id` a `Base`/`Create`/`Update`/
  `Response`: il contratto di scrittura ora richiede l'asset, quello di lettura
  lo espone.

### Service layer (`services/`)

- **`services/asset.py`** (nuovo) — CRUD (`create_asset`, `get_asset`,
  `list_assets`, `update_asset`, `delete_asset`) più le due funzioni di saldo:
  `get_asset_balance` e `get_asset_balances`. Il calcolo è la parte
  interessante: legge in quattro query aggregate (`func.sum` con `case()` sul
  segno della categoria, trasferimenti in, trasferimenti out, opening balances)
  e le fonde in un `dict[asset_id, Decimal]`. `get_asset_balance` riusa
  `get_asset_balances` (una sola passata per tutti gli asset: è quello che serve
  all'endpoint di lista).
- **`services/transfer.py`** (nuovo) — CRUD più le due guardie: esistenza di
  entrambi gli asset referenziati (404, precisa su quale) e self-transfer (422),
  su **create e update**. Su update i valori "effettivi" vengono ricalcolati
  prima della validazione (il campo non fornito resta quello corrente) — la
  lezione del modulo 3 sui PATCH parziali. `list_transfers` usa la dataclass
  `TransferFilters` e mantiene la convenzione `MonthWithoutYearError`.
- **`services/exceptions.py`** — quattro nuove eccezioni di dominio, nominate
  come le esistenti (suffisso `Error`): `AssetNotFoundError` (404),
  `TransferNotFoundError` (404), `DuplicateAssetNameError` (409),
  `AssetInUseError` (409) e `SelfTransferError` (422). Regola invariata:
  i servizi sollevano, i router traducono — vedi [gestione-errori](../wiki/gestione-errori.md).
- **`services/transaction.py`** — `create_transaction` e `update_transaction`
  ora verificano che l'`asset_id` esista (404), accanto al già esistente
  controllo sulla categoria.
- **`services/recurring_template.py`** — `generate_next` ora assegna alla
  transazione generata il **primo asset di tipo `liquid`**; se non esiste,
  solleva `AssetNotFoundError`. In pratica il "default liquid asset" dell'ADR è
  diventato "il primo asset liquid che l'utente ha creato": la migrazione non
  ne crea uno (vedi insidia 4).

### API (`api/routers/`)

- **`api/routers/asset.py`** (nuovo) — router sottile: ogni endpoint chiama un
  servizio e traduce le eccezioni. `AssetResponse` porta il `balance` calcolato
  dal service; `create_asset` lo inizializza a `opening_balance` (un asset
  appena nato non ha ancora transazioni).
- **`api/routers/transfer.py`** (nuovo) — stesso pattern; il self-transfer si
  traduce in 422.
- **`api/routers/transaction.py`** — aggiunte le clausole `except
  AssetNotFoundError` → 404 sui path create/update.
- **`api/main.py`** — registrati i due router sotto `/api/assets` e
  `/api/transfers`.

### Test (`tests/`)

- **`tests/conftest.py`** — helper `create_asset`, `create_transfer`,
  `create_transaction` (con default sull'asset liquid creato al volo) e la
  fixture `liquid_asset`.
- **`tests/test_assets.py`** (nuovo) — CRUD + 404 + duplicato 409 + delete
  rifiutata 409 (con transazioni *e* con trasferimenti), e **la matematica dei
  saldi**: opening + transazioni, trasferimenti in/out, net worth invariato da
  un trasferimento, asset senza transazioni che mostra l'opening.
- **`tests/test_transfers.py`** (nuovo) — CRUD + 404 + self-transfer 422 (su
  create e su update) + asset sconosciuto 404.
- **`tests/test_categories.py` / `test_recurring_templates.py` /
  `test_transactions.py`** — adeguati all'`asset_id` ora obbligatorio.

### Il trend del net worth (follow-up)

Subito dopo il commit del modulo è arrivato il **trend del net worth**
(`8e411ea`): `GET /api/assets/net-worth-trend?start_date=&end_date=`, che
restituisce `NetWorthTrendPoint(year, month, amount)`. È il seme del passo 3
del roadmap (Net worth) ed è un report **cumulativo**, non per periodo: il
valore di fine mese è il totale corrente di tutto ciò che è accaduto fino a
quel punto. Due conseguenze di design, entrambe verificate nei test: i
**trasferimenti si annullano** (contribuiscono zero, e infatti il report non li
legge proprio), e **ogni mese dell'intervallo viene emesso, anche senza
attività** (il grafico non deve avere buchi — la somma si trasporta avanti
mese per mese). Il fix `d71a9f2` ha poi **clamato l'inizio del range alla prima
transazione**: senza, il trend emetteva mesi precedenti l'inizio del
tracciamento con un saldo piatto fuorviante.

## Le insidie incontrate

1. **L'`asset_id` NOT NULL senza backfill nella migrazione.** ADR 0004 prescrive
   "viene creato un default liquid asset e tutte le transazioni esistenti
   vengono backfillate"; la migrazione reale aggiunge la colonna NOT NULL
   *senza* creare l'asset né backfillare le righe. Su una tabella `transactions`
   con righe l'`ALTER` fallirebbe ("column contains null values"). È andata
   liscia perché al momento della migrazione la tabella era vuota. Lezione:
   la sequenza sicura (colonna nullable → backfill → NOT NULL) va applicata
   *sempre* quando c'è anche solo la possibilità di righe esistenti — il
   pattern è documentato nella wiki [per-user-data-scoping](../wiki/per-user-data-scoping.md).
2. **L'`opening_balance` è arrivato in una seconda migrazione.** Il campo è
   stato aggiunto al modello *dopo* la prima autogenerazione. Non è un errore:
   è la prova che "revisiona e adatta la bozza" di [alembic](../wiki/alembic.md)
   va applicato anche quando la bozza esce pulita — il modello vive, e ogni
   crescita del modello richiede una nuova revisione, mai modificare una
   migrazione già applicata.
3. **Il default dell'ADR non è il default dell'API.** ADR 0004 dice
   `opening_balance` "opzionale, default 0"; lo schema Pydantic lo rende
   **obbligatorio** (il test
   `test_create_asset_without_opening_balance_defaults_to_zero` si aspetta
   422!). Divergenza onesta tra carta e contratto API: l'ADR parla del default
   del modello ORM (che c'è), l'API richiede il campo sul create. Resta una
   discrepanza da ricomporre (ADR o schema).
4. **Il "default liquid asset" non esiste da nessuna parte.** La migrazione non
   lo crea; `generate_next` dei template ricorrenti cerca il *primo* asset
   `liquid` e, se non c'è, fallisce con `AssetNotFoundError`. Il concetto è
   diventato "l'utente deve creare da sé il suo asset liquid". È un debito
   silenzioso rispetto all'ADR, che prescriveva un seed: funziona solo finché
   l'utente crea l'asset prima di generare una ricorrenza.
5. **Guardia di delete: pre-check vs EAFP.** La bozza di design suggeriva un
   pre-check (`select(func.count())` su transazioni e trasferimenti) prima di
   cancellare. La implementazione reale usa **EAFP**: tenta la delete e
   traduce l'`IntegrityError` dalla FK in `AssetInUseError` → 409. È la scelta
   migliore e coerente con la wiki [gestione-errori](../wiki/gestione-errori.md):
   il pre-check ha una race condition (tra il controllo e la delete un'altra
   richiesta può inserire una riga referenziante), mentre il vincolo del
   database rifiuta atomicamente.
6. **La validazione su update va fatta sui valori *effettivi*.** Un PATCH che
   cambia solo `destination_asset_id` non deve ripartire dal valore nullo del
   campo non fornito: il self-transfer e l'esistenza degli asset vanno
   verificati contro `new_source_id`/`new_dest_id` ricalcolati. È la lezione
   del modulo 3 (insidia 4), ricomparsa in forma nuova.
7. **Le route statiche prima di quelle parametrizzate.** `GET
   /api/assets/net-worth-trend` deve essere dichiarato *prima* di `GET
   /api/assets/{asset_id}`, o il matcher cattura la stringa come id e fallisce
   con 422. Regola già vista nel modulo 3, applicata di nuovo.
8. **Il trend del net worth emetteva mesi prima del tracciamento.** Senza il
   clamp alla prima transazione, `start_date` libero produceva un piatto
   fuorviante. La correzione (`d71a9f2`) è arrivata subito dopo la prima
   verifica visiva: i casi limite di un report cumulativo si scoprono quando
   lo guardi, non quando lo scrivi.

## Le verifiche fatte

- **`uv run pytest`** — la suite attraversa l'HTTP contro il database di test:
  CRUD di asset e trasferimenti, 404 su id inesistenti, 409 su nome duplicato,
  409 su delete di un asset referenziato (transazioni *e* trasferimenti), 422
  sul self-transfer (create e update), 404 su asset sconosciuto in un
  trasferimento. La **matematica dei saldi**: `100 + 200 − 30 = 270` con
  entrate/uscite miste; trasferimento `40` da Checking a Savings che lascia i
  due saldi a `60` e `40`; **il net worth invariato dal trasferimento**
  (assert esplicito `before_total == after_total`). Per il trend: cumulo mese
  su mese, trasferimenti ignorati, transazioni precedenti il range incluse
  nel valore iniziale.
- **`uv run ruff check .`** e **`uv run mypy .`** verdi, come da pipeline.
- **`uv run alembic upgrade head`** — le due migrazioni applicate; la revisione
  prima dell'applicazione ha confermato colonne, FK, CheckConstraint ed enum
  corretti.
- Il tutto sempre dietro `uv run`, per convenzione del progetto.

## Cosa è rimasto aperto

- **I template ricorrenti non puntano ancora a un asset.** Lo slot del roadmap
  (template che generano su un asset specifico, o template di trasferimento)
  resta aperto: il modulo ha solo dato un default pratico ("primo asset
  liquid") in `generate_next`.
- **Il passo 3 del roadmap, Net worth.** Il trend cumulativo è fatto
  (`/api/assets/net-worth-trend`); la vista allocazione (passo 4, raggruppare i
  saldi per tipo) è ancora da fare.
- **La discrepanza `opening_balance` obbligatorio vs "default 0".** L'ADR e il
  contratto API non coincidono; va deciso se allineare lo schema all'ADR o
  l'ADR allo schema.
- **Il debito del default liquid asset.** La migrazione non crea l'asset seed
  che ADR 0004 prescriveva; andrà ricomposto (con una nuova migrazione che lo
  crei per i DB nuovi, o accettando il comportamento attuale e correggendo
  l'ADR).
- **Lo scoping per utente.** I modelli sono cresciuti senza `owner_id`, come
  previsto; il modulo Auth (7) aggiungerà la colonna `user_id` e renderà i
  vincoli di unicità composti `(user_id, nome)` — la wiki
  [per-user-data-scoping](../wiki/per-user-data-scoping.md) documenta la
  sequenza di backfill che quel modulo ha poi seguito.