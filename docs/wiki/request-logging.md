# Request logging e X-Request-ID: rendere una richiesta rintracciabile nei log

Quando un'app gira sul tuo computer e ti si rompe qualcosa, apri il terminale
e vedi l'errore. Quando l'app è deployata, non c'è un terminale: c'è un file
di log, spesso prodotto da migliaia di richieste. Il primo passo
dell'osservabilità — la capacità di capire cosa sta succedendo nell'app — è
registrare una riga per ogni richiesta, e dare a ogni richiesta un
identificativo che la renda rintracciabile attraverso tutti i log. Questo
capitolo spiega i due pezzi: il request logging e il cosiddetto "request ID".

## Un server senza log per richiesta è cieco

Un middleware che logga ogni richiesta è il guadagno di debugging più
economico che esista. La riga minima dice: metodo, percorso, stato della
risposta, durata.

```
INFO: GET /api/transactions -> 200 (12.3ms)
WARN: GET /api/transactions -> 200 (642.1ms)
```

Con poche righe del genere vedi subito cosa il frontend sta davvero
chiamando (spesso non è quello che pensi), noti un loop di richieste
impazzito, o ti accorgi che una rotta è diventata lentissima. È la base su
cui, in seguito, si costruisce un logger strutturato (righe in JSON, metriche,
alert): senza il request logging non hai nulla da strutturare.

## Il request ID: ricomporre una richiesta attraverso i log

Una richiesta, però, produce in genere più di una riga di log: il middleware,
il servizio, il database, un eventuale errore. Se tre richieste sono in volo
contemporaneamente, come fai a sapere quali righe appartengono alla stessa
richiesta? Non puoi basarti sul tempo: i log si intrecciano.

La soluzione è il **request ID** (o correlation ID): un identificativo unico
generato per ogni richiesta, aggiunto come header della risposta
(`X-Request-ID` è la convenzione) e incluso in ogni riga di log di quella
richiesta. Quando un bug report dice "si è rotto alle 14:02", non devi più
scavare nel tempo: cerchi nel log la riga con `request_id=...` e da lì segui
tutte le righe con lo stesso valore. L'ID è il "numero di pratica" della
richiesta: collega tutto ciò che è successo a lei, dal primo middleware
all'ultimo errore.

## Come si implementa: un middleware che avvolge la richiesta

Il request logger è un middleware HTTP (vedi `middleware-http.md` per la forma
della cipolla): genera l'ID, lo salva, chiama `call_next`, e al ritorno logga
la riga completa.

```python
from uuid import uuid4

@app.middleware("http")
async def log_requests(request: Request, call_next):
    request_id = str(uuid4())
    request.state.request_id = request_id          # visibile a tutto ciò che sta dentro
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = request_id  # il client può riportartelo
    logger.info(
        "%s %s -> %s (%.1fms) request_id=%s",
        request.method, request.url.path,
        response.status_code, duration_ms, request_id,
    )
    return response
```

L'ID viene generato **prima** di `call_next` e loggato **dopo**: è lo stesso
schema della cipolla visto sopra. Salvarlo in `request.state` lo rende
accessibile a qualsiasi cosa stia più dentro — un'eccezione handler, un
servizio — così tutte le righe della stessa richiesta possono riportare lo
stesso valore. È buona norma anche marcare le richieste lente: se una
richiesta supera una soglia (per esempio 500 ms), la logghi a livello
`WARNING` invece che `INFO`, così le righe lente saltano all'occhio.

## La trappola del logging sotto un server: il tuo logger non esiste

Qui arriva una delle sorprese più frequenti: scrivi il logger, riavvii l'app
sotto il server ASGI (uvicorn, gunicorn) e **le tue righe non compaiono**.
Non è un bug del tuo codice: è che il server configura solo i *suoi* logger,
non i tuoi.

Il modulo `logging` di Python funziona a logger *nominati* organizzati in
gerarchia: `logging.getLogger(__name__)` ti dà un logger con il nome del
modulo, che per default "propaga" i messaggi verso il logger padre fino alla
radice (il "root logger"). I messaggi vengono emessi solo se il logger (o un
suo antenato) ha un **handler** che li scrive da qualche parte. Un server come
uvicorn configura i propri logger, ma lascia il root logger al livello
`WARNING` senza handler per i logger dell'applicazione: risultato, le tue
righe `logger.info(...)` vengono scartate in silenzio.

La soluzione è dare al logger della tua applicazione un handler proprio e un
livello esplicito, e fermare la propagazione così che la riga venga stampata
esattamente una volta:

```python
import logging

handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
app_logger = logging.getLogger("mia_app")
app_logger.addHandler(handler)
app_logger.setLevel(logging.INFO)
app_logger.propagate = False
```

Il senso delle tre righe: `addHandler` dà al logger un posto dove scrivere,
`setLevel` dice da quale soglia in su (INFO) i messaggi sono degni di uscire,
`propagate = False` evita che il messaggio passi anche al root logger e venga
stampato due volte. Senza questa configurazione, il tuo logger esiste ma è
muto: non è un errore che vedi, è un errore che *non vedi*.

## Il 500 sfugge al middleware: gestire gli errori in due posti

C'è un caso in cui il middleware "dopo `call_next`" non gira mai: quando la
richiesta finisce in un'eccezione non gestita. FastAPI e Starlette instradano
le eccezioni base `Exception` verso il `ServerErrorMiddleware`, che sta
**fuori** dai tuoi middleware personalizzati. Il risultato: il client riceve
comunque il 500, ma il tuo codice successivo a `call_next` non viene eseguito
— niente header `X-Request-ID`, niente riga di durata per quell'errore.

La soluzione è coprire l'errore in entrambi i punti. Nel middleware, avvolgi
`call_next` in un `try/except` per loggare errore e durata anche quando
esplode. E registra un exception handler per `Exception` che logga il
traceback con lo stesso `request_id` e restituisce una risposta JSON 500 con
l'header `X-Request-ID`. Il risultato è che un 500 produce **due righe di
errore**: la prima con la durata (dal middleware), la seconda con il
traceback (dall'exception handler), collegate dallo stesso request ID. Non è
un bug: è la firma di un errore tracciato da cima a fondo.

## Cosa non loggare mai

La riga di richiesta (metodo, percorso, stato, durata) è innocua. Quello che
non va loggato è il contenuto sensibile: password, token di sessione, chiavi
API, email in chiaro. Un middleware che logga il corpo della richiesta o i
query param completi può stampare una password o un token in un file di log
che finirà in un bug report o in un sistema di terze parti. La regola: logga
la forma della richiesta, non il suo contenuto; e se un percorso contiene
dati sensibili, valuta se loggarne una versione senza i parametri.

## Trade-off e insidie

- **Il livello è una scelta, non un default.** Un'unica soglia per le
  richieste lente (loggarle a `WARNING`) è il minimo; più avanti potresti
  volere un logger strutturato (JSON) e metriche. Il request logging a riga
  singola è la fondazione su cui costruire, non il traguardo.
- **Il logger muto.** Sotto un server che configura solo i propri logger, le
  righe INFO spariscono in silenzio. Se "non vedi nulla nei log", prima di
  sospettare del middleware controlla che il tuo logger abbia un handler e
  un livello (e che `propagate` non stampi tutto due volte).
- **Il 500 non passa dal middleware.** Se non copri gli errori anche
  nell'exception handler, perdi l'header `X-Request-ID` e la riga di durata
  proprio sull'errore che più ti interessa tracciare.