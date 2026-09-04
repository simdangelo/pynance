# Il middleware HTTP: la cipolla che avvolge ogni richiesta

Quando scrivi un'applicazione web pensi alle rotte: una per creare una risorsa,
una per leggerla, una per cancellarla. Ma ci sono questioni che non riguardano
una rotta in particolare, bensì **tutte le richieste** indistintamente:
loggare ogni chiamata, aggiungere un header di sicurezza, controllare l'header
`Host`, limitare la frequenza delle richieste. Il middleware è il meccanismo
pensato per queste "cross-cutting concerns": le preoccupazioni trasversali che
attraversano ogni rotta.

## Cos'è un middleware: codice che avvolge la rotta

Un middleware è codice che gira **prima della tua rotta e dopo di essa**,
avvolgendo ogni richiesta. L'immagine classica è quella della cipolla: la
richiesta entra *attraverso* gli strati, raggiunge il cuore (la tua rotta), e
la risposta esce *attraverso* gli stessi strati in ordine inverso.

```
request  ──► [middleware 1] ──► [middleware 2] ──► [route handler]
response ◄── [middleware 1] ◄── [middleware 2] ◄── [route handler]
```

Perché l'ordine conta? Perché ogni strato può decidere di **fermare** la
richiesta (restituire una risposta senza mai raggiungere la rotta), e ogni
strato vede la risposta di tutto ciò che sta *dentro* di lui mentre esce.
È questa proprietà a rendere il middleware adatto alle questioni trasversali:
una cosa che vale per *ogni* rotta, non per una specifica. Esempi classici:

- loggare ogni richiesta (metodo, percorso, stato, durata);
- aggiungere un header `X-Request-ID` così una singola richiesta è rintracciabile
  nei log;
- controllare l'header `Host` e rifiutare le richieste per host sconosciuti;
- rate limiting, cioè limitare quante richieste un client può fare in un tempo
  dato;
- autenticazione (anche se spesso si fa con una dependency per rotta — la
  scelta è discussa sotto).

## Il percorso di una richiesta: entrare e uscire dalla cipolla

In Starlette e FastAPI il livello più basso è il **middleware ASGI puro**: una
funzione che riceve il *prossimo* handler e la richiesta, e può fare ciò che
vuole prima e dopo. Sopra questo, FastAPI offre `app.middleware("http")` come
scorciatoia per i middleware che si occupano solo di HTTP, e Starlette
fornisce middleware già pronti da aggiungere con `app.add_middleware(...)`,
come `TrustedHostMiddleware` (approfondito in `trusted-host.md`).

La firma della forma scorciatoia vale la pena di interiorizzarla, perché mostra
la forma della cipolla esattamente:

```python
from collections.abc import Awaitable, Callable
from fastapi import Request, Response
import time

@app.middleware("http")
async def add_timing_header(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    start = time.perf_counter()
    response = await call_next(request)      # lascia che la cipolla continui verso l'interno
    response.headers["X-Process-Time"] = f"{time.perf_counter() - start:.4f}"
    return response                          # ...e torni verso l'esterno
```

`call_next` è "il resto della cipolla": tutto ciò che viene scritto prima
gira all'andata, tutto ciò che viene scritto dopo gira al ritorno. Nota che
il middleware è `async def` e usa `await call_next(request)`: sta dicendo
"adesso passo la richiesta agli strati interni e aspetto che la risposta
risalga".

## L'ordine degli strati non è un dettaglio

Un middleware aggiunto *dopo* avvolge tutto ciò che è stato aggiunto *prima*
di lui: è come aggiungere uno strato esterno alla cipolla. Da questo derivano
due conseguenze pratiche.

La prima: **gli strati esterni vedono la richiesta per primi e la risposta per
ultimi**. Chi vuole rifiutare presto (per esempio un controllo sull'header
`Host` che non vuole far lavorare nessuno per richieste illegittime) deve
stare all'esterno; chi vuole misurare la durata totale deve stare all'esterno
per vedere la risposta per ultimo, quando il lavoro è finito.

La seconda: **uno strato esterno può fermare tutto**. Se un middleware esterno
restituisce direttamente una risposta senza chiamare `call_next`, la richiesta
non prosegue verso l'interno: le rotte e gli altri middleware interni non
vedranno nulla. È questo che rende naturale mettere i controlli di sicurezza
sugli strati esterni: si blocca prima di spendere risorse inutili.

## Middleware vs dependency: come scegliere

Sia il middleware sia una dependency (`Depends(...)`) girano "prima della
rotta", quindi come si decide quale usare? La differenza è dove vivono e cosa
vedono.

Una **dependency** è *per rotta*: ci fai opt-in sulle rotte che la
richiedono, e gira dentro il router con accesso alla richiesta, ai parametri
del percorso e al contesto specifico della rotta. Una **middleware** è
*globale*: gira per **ogni** richiesta, che la rotta la voglia o no, ma non
ha idea verso quale rotta sta andando (o se una rotta esiste addirittura).

La regola pratica: le dependency per le cose legate alla *semantica* della
rotta (l'autenticazione: solo alcune rotte la richiedono, e ha bisogno del
cookie di sessione e del contesto della rotta), il middleware per le cose
legate al *trasporto* — che devono valere per tutto (logging, header di
sicurezza, controllo dell'host), incluse le richieste che finiranno in un
404. Un middleware non può scegliere "solo queste rotte"; una dependency non
può coprire "anche ciò che non è una rotta".

## La regola d'oro: niente logica di business nel middleware

Il middleware è idraulica del trasporto, non business logic. Parsare il corpo
della richiesta, validare l'input, fare query al database per un caso d'uso:
tutto questo appartiene a rotte, dependency e servizi. Un middleware che
cresce logica di business diventa difficile da testare e lento (una richiesta
che finisce in un 404 su un file statico si trascina comunque dietro tutta la
cipolla). Tienilo ai pochi compiti generici del trasporto: logging, header di
sicurezza, controlli sull'host.

## Le insidie

- **L'ordine conta.** Pensa sempre alla cipolla: un middleware aggiunto dopo
  avvolge tutto ciò che è stato aggiunto prima. Chi deve rifiutare presto va
  all'esterno; un logger può stare ovunque.
- **`call_next` va chiamato esattamente una volta.** Chiamarlo due volte (o
  non chiamarlo mai) è un bug: la cipolla deve essere attraversata una e una
  sola volta. La richiesta attraversa ogni strato esattamente una volta
  all'andata e una al ritorno.
- **Un middleware `async def` non deve fare operazioni bloccanti.** Se il tuo
  accesso al database è sincrono e lo chiami dentro un middleware `async def`,
  blocchi l'intero event loop: mentre aspetti, nessun'altra richiesta può
  avanzare. Il problema è lo stesso degli endpoint `async def`, ma nel
  middleware è più insidioso perché gira per ogni richiesta.
- **La crescita della logica di business.** Se il middleware comincia a
  validare input o a interrogare il database per casi d'uso, fermati: quella
  roba vive nelle rotte, nelle dependency e nei servizi.