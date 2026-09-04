# Modulo 7 — Autenticazione: account reali e dati per utente

Pynance fino a qui era un'app **monoutente**: i dati di una persona su una
macchina, senza login. Questo modulo la trasforma in un'app con **account
veri**: registrazione, login, logout e dati separati per utente. È il tema di
sicurezza più grande del progetto — non solo perché aggiunge il login, ma
perché *tutto* il resto (ogni entità, ogni query, ogni test) doveva imparare a
fare i conti con un proprietario.

La scelta di fondo — sessioni lato server in cookie `HttpOnly`, non JWT — era
già stata presa in [ADR 0005](../adr/0005-http-cookie-sessions.md); questo
modulo l'ha implementata. I concetti generali dietro il lavoro sono nelle wiki:
[password hashing](../wiki/password-hashing.md), [sessioni vs JWT](../wiki/sessions-jwt-vs-cookies.md),
[flag dei cookie](../wiki/cookie-flags.md), [authN/authZ/OAuth](../wiki/authentication-authorization-oauth.md),
la [dipendenza di auth in FastAPI](../wiki/fastapi-auth-dependency.md) e lo
[scoping per utente](../wiki/per-user-data-scoping.md).

---

## Le decisioni prese

- **Sessioni server-side in cookie `HttpOnly`**, non JWT — vedi ADR 0005. I
  due argomenti decisivi: revoca immediata (cancelli la riga e la sessione è
  morta) e protezione da XSS (il cookie `HttpOnly` è invisibile a JavaScript,
  un token in `localStorage` no). L'app è a istanza singola, quindi il
  vantaggio stateless del JWT non si applica.
- **Cookie con `HttpOnly` + `SameSite=Lax` + scadenza**, e `Secure` pilotato
  da un'impostazione (spento in dev, acceso in produzione quando arriverà
  HTTPS). La costante del nome cookie è condivisa tra chi lo imposta e chi lo
  legge.
- **`404` per le righe di altri utenti, non `403`.** Se una riga esiste ma non
  è del chiamante, il servizio si comporta come se non esistesse. Non vogliamo
  rivelare *che* i dati di un altro utente esistono (divergenza deliberata dal
  progetto di riferimento, che usava 403).
- **Email normalizzate in minuscolo** e unicità case-insensitive (via
  `func.lower`), con un messaggio d'errore generico ("Invalid email or
  password") che non rivela se a sbagliare è l'email o la password.
- **Migrazione con backfill**: un utente "seed" possiede tutti i dati
  preesistenti; i vincoli di unicità globali (nome categoria, nome asset)
  diventano composti `(user_id, nome)`.

## Le modifiche al codice

### Modelli e migrazione

- **`models/user.py`** (nuovo) — `User`: `email` unica, `password_hash`,
  `created_at`. Niente logica, come da convenzione.
- **`models/session.py`** (nuovo) — `Session`: `user_id` (FK), `token` unico,
  `created_at`, `expires_at`. La relazione `user` permette di risalire
  all'utente dal token.
- **`models/__init__.py`** — il facade deve esportare `User` e `Session`
  (import + `__all__`), altrimenti Alembic non vede le tabelle e la migrazione
  autogenerata "non genera nulla" — è la causa ricorrente di quel sintomo.
- **Migrazione `2832174e63af`** — crea `users` e `sessions`, poi aggiunge
  `user_id` a **tutte e cinque** le entità (assets, categories,
  recurring_templates, transactions, transfers). La sequenza per ogni tabella:
  colonna nullable → `UPDATE` che backfilla le righe esistenti all'utente seed
  → `NOT NULL` → foreign key. In più: inserisce l'utente seed
  (`seed@pynance.local`, con un hash segnaposto) e sostituisce i vincoli
  `UNIQUE` globali su asset e categorie con `UNIQUE (user_id, nome)` — un
  passaggio che l'autogenerate non produce da solo e che va scritto a mano.
  Prima di eseguirla è stato fatto un backup (pratica documentata nella wiki
  di persistenza).

### Servizi

- **`services/security.py`** (nuovo) — due funzioni, `hash_password` e
  `verify_password`, sopra `pwdlib` (`PasswordHash.recommended()`, Argon2).
  La verifica di `pwdlib` è a tempo costante: mai confrontare hash con `==`.
  I modelli restano "stupidi": niente hashing nei model.
- **`services/auth.py`** (nuovo) — quattro funzioni con la stessa forma degli
  altri servizi (ricevono `db: Session`, alzano eccezioni di dominio):
  - `register_user` — controlla l'unicità dell'email (case-insensitive),
    alza `DuplicateEmailError` (→ 409) se occupata, hash e crea.
  - `login_user` — trova per email (lower), verifica; se utente assente o
    password errata alza la *stessa* `InvalidCredentialsError` con lo stesso
    messaggio (→ 401); al successo crea una `Session` con
    `secrets.token_urlsafe(32)` e scadenza da settings.
  - `logout_user` — cancella la riga di sessione col token dato.
  - `get_user_by_token` — trova la sessione, controlla che non sia scaduta,
    restituisce `User | None`. Unifica "token assente / inesistente /
    scaduto" in `None`: la dipendenza mappa tutto a 401.
- **`services/exceptions.py`** — aggiunti `DuplicateEmailError` e
  `InvalidCredentialsError`.
- **Scoping in tutti i servizi esistenti** — la parte grossa del modulo. Ogni
  funzione guadagna un parametro `user_id: int`: `create_*` lo imposta sulle
  righe nuove, `list_*`/`get_*` filtrano per esso, `update_*`/`delete_*`
  caricano *già filtrati* (così una riga altrui diventa "non trovata" → 404).
  Esempio in `services/transaction.py`: `get_transaction` filtra con
  `Transaction.user_id == user_id` nella stessa query; `create_transaction`
  verifica che *anche* la categoria e l'asset referenziati siano raggiungibili
  in modo coerente, e imposta `user_id` dal parametro (mai dal corpo della
  richiesta). Lo stesso pattern in category, asset, transfer,
  recurring_template e importer. I router ora passano `current_user.id` in
  giù.

### Schemi e presentazione

- **`schemas/user.py`** (nuovo) — `UserCreate` (email `EmailStr`, password con
  `min_length=8`), `UserLogin`, `UserResponse` (con `from_attributes`).
  Nota: nel modulo di esercizio si parlava di `schemas/auth.py` e di un
  `TokenResponse`; in pratica gli schemi utente sono finiti in `schemas/user.py`
  e il login restituisce `UserResponse` direttamente (il token viaggia solo
  nel cookie) — una semplificazione rispetto alla traccia.
- **`api/dependencies.py`** (nuovo) — `get_current_user` legge il cookie
  `session_token` dalla `Request`, chiama `get_user_by_token`, alza 401 se
  `None`, e valorizza `request.state.user_id` (i middleware di logging del
  modulo 8 lo useranno). Espone l'alias `CurrentUser = Annotated[User,
  Depends(get_current_user)]`, così le route protette dichiarano solo
  `current_user: CurrentUser`.
- **`api/routers/auth.py`** (nuovo) — le quattro route:
  `POST /auth/register` (201), `POST /auth/login` (imposta il cookie con i
  flag), `POST /auth/logout` (cancella la sessione e il cookie, 204),
  `GET /auth/me` (protetta da `CurrentUser`). Le eccezioni di dominio vengono
  tradotte in codici HTTP nel router (409 / 401) — logica di presentazione,
  come da architettura. Router registrato in `api/main.py`.
- **`config.py`** — due impostazioni nuove: `access_session_expire_days`
  (scadenza sessione e `Max-Age` del cookie) e `secure_cookies` (per il flag
  `Secure`, `False` in dev).

### Test

- **`tests/conftest.py`** — la fixture `client` ora registra e logga un utente
  predefinito prima di ogni test (tutti i test esistenti girano "come" quel
  primo utente); nuova fixture `anon_client` senza utente per i test di auth.
  Il teardown di `db_session` cancella nell'ordine delle foreign key:
  `Session`, poi le entità che referenziano `users`, poi `User`. Helper
  `create_user`/`login`.
- **`tests/test_auth.py`** (nuovo) — copre il flusso di auth e l'isolamento:
  register 201, email duplicata 409, login imposta il cookie, password errata
  401, email sconosciuta 401, `/me` con cookie 200, `/me` senza auth 401,
  logout 204 poi `/me` 401, e il test chiave di proprietà: un secondo client
  (utente B) che prova a `PATCH`are la categoria dell'utente A → 404.

## Le insidie incontrate

- **La migrazione "che non genera nulla"** — se il facade `models/__init__.py`
  non importa `User` e `Session`, Alembic autogenerate non vede le tabelle.
  Primo riflesso da avere quando `revision --autogenerate` esce vuota.
- **Il `UNIQUE` globale diventa un bug multi-utente** — con i nomi categoria
  unici su tutta la tabella, il primo utente bloccherebbe gli altri.
  L'autogenerate non trasforma i vincoli: va fatto a mano nella migrazione
  (`UNIQUE (user_id, name)`).
- **La backfill prima del `NOT NULL`** — aggiungere `user_id` a tabelle già
  piene richiede la sequenza nullable → backfill al seed → `NOT NULL`. Fare il
  contrario rompe la migrazione sui dati esistenti.
- **Non rivelare quale credenziale è sbagliata** — al login, utente inesistente
  e password errata devono produrre lo stesso errore: un messaggio che
  distingue i due casi permette a un attaccante di enumerare le email
  registrate.
- **Il confronto degli hash** — mai `==` sugli hash: serve la `verify` a tempo
  costante della libreria, altrimenti un canale laterale temporale filtra
  informazioni sulla password.
- **Il nome del cookie va definito una volta sola** — se il router (login) e
  la dipendenza non condividono la stessa costante `SESSION_COOKIE_NAME`, il
  login riesce ma nessuna route protetta riconosce la sessione.
- **Il `client` dei test e il secondo utente** — il test di proprietà usa un
  secondo `TestClient` per l'utente B; entrambi devono passare
  `base_url="http://localhost"` (l'allow-list di host del modulo 8 rifiuta il
  default `testserver`). Il teardown deve cancellare le `Session` prima degli
  altri modelli, per le foreign key.
- **Il seed user è un segnaposto** — la migrazione inserisce un utente seed con
  un hash `"!"` che non è una password vera: va sostituito prima di un uso
  reale in produzione, altrimenti quel "login" è una porta aperta.

## Le verifiche fatte

Suite completa del backend su DB di test Postgres (Docker):

```
uv run pytest
→ 100 passed
```

In particolare `tests/test_auth.py`: **9 passed** — registrazione, email
duplicata, cookie impostato al login, 401 per password errata ed email
sconosciuta, `/me` autenticato e non, logout che invalida la sessione, e
l'isolamento (utente B non può modificare i dati di utente A, 404).

Checkpoint di stile dopo ogni step del modulo, come da convenzione:
`uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy .`,
`uv run pytest` — tutti verdi.

## Cosa è rimasto aperto

- **Pulizia delle sessioni scadute** — `get_user_by_token` controlla la
  scadenza, ma le righe scadute restano nella tabella `sessions`: serve un job
  di pulizia (o un check al lookup) in un modulo futuro.
- **Il flag `Secure` in produzione** — ora è `False` in dev; il modulo di
  deploy (HTTPS) è quello che lo porterà a `True`.
- **Il seed user** — la migrazione lo crea con un hash segnaposto; va sostituito
  con un account vero (o rimosso) prima di un uso pubblico.
- **Frontend del login** — la schermata di registrazione/login è materia del
  frontend (scritta dall'agente); il backend è pronto ma l'UI non c'è ancora.
- **OAuth / "Sign in with Google"** — non serve ora; vedi ADR 0005 e la wiki
  authN/authZ/OAuth per quando la valutazione diventerà rilevante.
- **Il bot Telegram** — è un secondo client che oggi si appoggia al
  `chat_id` consentito; con gli account reali va deciso come il bot si
  collega a un utente (login/sessione dedicata o associazione a un account).