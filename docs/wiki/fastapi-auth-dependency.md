# Autenticare una richiesta in FastAPI: la dipendenza "utente corrente"

In FastAPI il meccanismo di base dell'iniezione di dipendenze è `Depends` (vedi
la wiki su FastAPI): una funzione dichiarata come parametro gira prima della
route e il suo valore viene passato all'endpoint. Su quel meccanismo si costruisce
il pattern per proteggere le route autenticate: una **dipendenza di
autenticazione** che legge le credenziali dalla richiesta, risolve l'utente e
lo consegna all'endpoint — oppure rifiuta la richiesta.

È il modo idiomatico di fare auth in FastAPI, e vale per qualsiasi applicazione
che abbia route protette, qualunque sia il meccanismo di sessione scelto.

---

## Il pattern in una riga

Una funzione che riceve la `Request` (per leggere il cookie, o un header),
risolve chi è l'utente e lo ritorna; se non c'è, alza `HTTPException` con 401.
Tutte le route protette dichiarano quella dipendenza.

```python
from typing import Annotated
from fastapi import Depends, HTTPException, Request, status

SESSION_COOKIE_NAME = "session_token"

def get_current_user(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> User:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    user = resolve_user(db, token) if token else None
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessione assente o scaduta",
        )
    return user

CurrentUser = Annotated[User, Depends(get_current_user)]
```

E ogni route protetta diventa terse:

```python
@router.get("/me")
def me(current_user: CurrentUser) -> User:
    return current_user
```

## Perché un'alias `Annotated`

L'alias `CurrentUser = Annotated[User, Depends(get_current_user)]` è pura
zucchero sintattico di FastAPI, ma cambia la leggibilità: invece di scrivere
`user: User = Depends(get_current_user)` in ogni firma (con la gioia di
mantenere lo stesso tipo in decine di punti), dichiari `current_user:
CurrentUser` e ottieni sia il tipo (`User`, che mypy ed editor capiscono) sia
la dipendenza. Se un giorno cambi meccanismo di auth, tocchi *un* punto.

## Cosa legge la dipendenza: cookie o header

La dipendenza legge le credenziali da dove il tuo meccanismo le mette. Le due
scelte comuni:

- **Un cookie di sessione** — dal `Request`: `request.cookies.get(...)`. È la
  scelta delle sessioni lato server con cookie `HttpOnly`.
- **Un header `Authorization`** (tipo `Bearer <token>`) — FastAPI ha
  l'helper `HTTPBearer`, che estrae il token dall'header per te. È la scelta
  tipica dei JWT.

La scelta è registrata altrove (in un ADR o nella wiki sulle sessioni): la
dipendenza è solo il punto in cui *quella* decisione viene eseguita. Un
dettaglio da non sbagliare: il nome del cookie deve essere definito **una
volta sola** come costante e condiviso tra il punto che lo imposta (login) e
la dipendenza che lo legge — se i due valori divergono, il login "funziona"
ma nessuna route protetta riconosce la sessione.

## Perché una dipendenza, non un middleware

L'autenticazione *potrebbe* essere un middleware globale (gira per ogni
richiesta). Ma c'è una differenza sostanziale: una **dipendenza è
per-route** — la aggiungi solo alle route che la vogliono, e gira *dentro* il
contesto della route. Un **middleware** è globale: gira per ogni richiesta,
anche per quelle che non servono auth (login, registrazione, una pagina
pubblica, un endpoint di health check) e per quelle che finiscono in 404.

Con una dipendenza hai il controllo fine (route pubbliche e private convivono
senza "eccezioni"), il fallimento dell'auth produce un 401 pulito gestito da
FastAPI, e il valore risolto (l'utente) ti arriva come parametro tipizzato. Per
questo il pattern idiomatico è: **auth come dipendenza**, middleware solo per
le preoccupazioni di trasporto che devono valere per *tutto* (logging, header
di sicurezza, allow-list di host).

## Mappare "nessun utente" a un errore HTTP

La dipendenza ha un solo compito di traduzione: "non c'è utente valido" → 401
`Unauthorized`. Il modo pulito è che la funzione che risolve l'utente restituisca
`None` sia per "token mancante" sia per "token scaduto" sia per "token
inesistente", e la dipendenza faccia un unico controllo:

```python
user = resolve_user(db, token) if token else None
if user is None:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, ...)
```

Non c'è bisogno di distinguere i casi: al client basta sapere che non è
autenticato. Unificare il caso "manca il token" con "token invalido" evita
anche di far trapelare dettagli sul formato della sessione.

## Note utili in pratica

- **Il risultato può servire ad altro.** La stessa dipendenza può valorizzare
  `request.state.user_id` (o simile) così che i middleware — che girano dopo —
  possano sapere *chi* ha fatto la richiesta, senza rifare la risoluzione.
- **Le route che non dichiarano la dipendenza sono pubbliche.** Questo è un
  vantaggio, ma è anche il rischio: dimenticare `current_user: CurrentUser`
  su una route privata la lascia aperta. Conviene proteggere per difetto e
  dichiarare esplicitamente le poche route pubbliche.
- **Test.** Nei test puoi sostituire la dipendenza (FastAPI permette di
  sovrascrivere una dipendenza con `app.dependency_overrides`), oppure —
  meglio — passare per il flusso vero: registra un utente, fai login, usa il
  cookie. Il secondo modo esercita davvero l'auth.