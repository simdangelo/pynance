# CORS: la regola del browser che sembra un bug

CORS (Cross-Origin Resource Sharing, "condivisione delle risorse tra origini")
è uno dei concetti più fraintesi del web. Non è qualcosa che "si attiva per
essere sicuri", né un interruttore da accendere per fare andare le cose. È un
meccanismo di sicurezza del **browser**, e la prima cosa da capire è che
esiste solo lì.

## Non è un interruttore di sicurezza: è una regola imposta dal browser

Il browser applica una regola: una pagina servita dall'origine A può fare
chiamate `fetch` o `XMLHttpRequest` all'origine B **solo se B dichiara
esplicitamente che è permesso**, tramite header `Access-Control-Allow-Origin`.
Se quell'header non c'è, il browser **blocca la risposta**: la richiesta può
anche arrivare al server (che magari risponde regolarmente), ma il JavaScript
della pagina non può leggere il risultato. Dal punto di vista del codice
frontend è come se la richiesta fallisse, e l'errore che vedi in console è
spesso un errore CORS — non un errore del server.

Perché il browser fa questo? Per proteggerti da un sito malevolo che, mentre
hai aperto un'altra scheda, tenta di chiamare l'API di un sito dove sei
autenticato, leggendone i dati. Il browser è la "guardia" che separa una
pagina web da un'altra.

## Cos'è un'origine: schema, host e porta insieme

"Origine" non è il nome del sito: è **schema + host + porta** considerati
insieme. `http://localhost:5173` e `http://localhost:8000` sono origini
diverse, anche se sono sulla stessa macchina: cambia la porta. Anche
`https://example.com` e `http://example.com` sono origini diverse, perché
cambia lo schema. Quando confronti due URL per capire se sono "la stessa
origine", devi guardare tutte e tre le componenti.

## Perché CORS non esiste per i client non-browser

CORS è irrilevante per il traffico server-to-server e per i client che non
sono un browser: `curl`, un bot Telegram, un'app per telefono. Nessuno di
questi applica la regola del browser, quindi per loro le richieste
cross-origin funzionano senza alcun header CORS. CORS esiste *solo* perché i
browser isolano una pagina web da un'altra. Se il tuo client non è un
browser, il problema non si pone proprio.

## Quando serve davvero

Un'app ha bisogno del middleware CORS **solo** quando il frontend e il
backend vivono su origini diverse **e** il frontend è servito in un browser.
In quel caso si aggiunge il `CORSMiddleware`, e la lista `allow_origins` deve
essere **esatta**: niente `"*"`. Il motivo è una trappola classica: il browser
rifiuta un'origine wildcard combinata con le credenziali, quindi
`allow_origins=["*"]` con `allow_credentials=True` non funziona — esattamente
la combinazione che serve quando si aggiunge l'autenticazione via cookie e il
CORS nello stesso momento.

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://miaapp.example.com"],  # mai "*" con le credenziali
    allow_credentials=True,
)
```

Quando il frontend e il backend sono su origini diverse e usi i cookie per la
sessione, si sommano altre complicazioni: il cookie deve essere configurato
con `SameSite=None` e `Secure`, e le chiamate `fetch` devono usare
`credentials: 'include'`. È il mondo in cui cookie e CORS diventano fragili
insieme.

## Il modo più semplice per non averne bisogno: un'unica origine

La domanda da farsi non è "come configuro il CORS" ma "perché le mie due
origini devono essere diverse?". Molte applicazioni possono essere servite da
**una sola origine**, e lì CORS non scatta mai:

- **In sviluppo**, un server di sviluppo per il frontend che fa da proxy:
  il browser parla solo con l'origine del frontend, e il proxy inoltra le
  richieste `/api/*` al backend. Per il browser quella chiamata è
  same-origin: il salto frontend→backend è server-to-server, e il CORS non
  si applica.
- **In produzione**, il backend che serve anche i file statici del frontend
  (la build già compilata) oltre alle rotte `/api/*`: una sola origine, un
  solo porto, punto.

Con un'unica origine i cookie di sessione funzionano naturalmente, senza
`SameSite=None` e senza acrobazie, e non c'è alcun rischio che un CORS
malconfigurato apra la tua sessione ad altre origini. La scelta single-origin
è una semplificazione architetturale che elimina un'intera categoria di
problemi, e va mantenuta finché non c'è una ragione forte per romperla (per
esempio un frontend spostato su una CDN o su un sottodominio separato).

## Le insidie

- **`"*"` con le credenziali è invalido.** Il browser rifiuta un'origine
  wildcard quando la richiesta porta credenziali (cookie). Se usi cookie per
  l'autenticazione, `allow_origins` deve essere una lista esatta, mai `"*"`.
- **"La richiesta arriva al server, perché il frontend non vede la
  risposta?"** Perché il browser blocca la *lettura* della risposta, non
  l'invio della richiesta. Il server potrebbe anche eseguire l'operazione:
  è un motivo in più per non affidarsi al CORS come barriera di sicurezza
  — è una regola del browser, non un controllo del server.
- **Aggiungere CORS "tanto per" è una trappola.** Se non hai mai due origini
  di browser, non ne hai mai bisogno; e se lo aggiungi insieme alle
  credenziali, un `allow_origins` sbagliato espone la sessione ad altre
  origini. La regola è: decidi il single-origin, e aggiungi CORS solo se e
  quando quell'assetto si rompe.