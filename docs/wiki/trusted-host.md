# L'header Host e TrustedHostMiddleware: rifiutare gli host sconosciuti

Ogni richiesta HTTP dice al server *per chi* è intesa, attraverso l'header
`Host`. Di default un'applicazione web risponde a qualunque valore di questo
header — e questo va bene sulla tua rete locale, ma diventa un problema
quando l'app è raggiungibile da internet. Questo capitolo spiega perché, e
cosa c'entra l'allow-list di `TrustedHostMiddleware`.

## Cos'è l'header Host

Ogni richiesta HTTP/1.1 porta un header `Host`: il nome del server a cui il
client pensa di rivolgersi. Quando il browser digita `http://miaapp.example`,
l'header vale `Host: miaapp.example`. Il server lo usa per sapere a quale
dominio la richiesta è diretta: è ciò che permette a un unico server di
servire più domini (i "virtual host") e ciò che il server usa per costruire
URL assoluti — i link di conferma nelle email, i link di reset della
password, le pagine di reindirizzamento.

## Il problema: rispondere a qualunque Host

Un server web che risponde a qualsiasi header `Host` va bene nel tuo
computer, dove l'unico che bussa sei tu. Ma appena l'app è raggiungibile
dall'internet, un attaccante può inviare richieste con `Host: evil.com` e il
server le serve comunque. Perché questo è un problema, se il contenuto è lo
stesso?

- Il server genera URL assoluti usando l'header `Host`: un link di reset
  password o di conferma potrebbe puntare a `evil.com` invece che al tuo
  dominio.
- Chi riceve un link generato male può essere portato a credere che il tuo
  sito sia `evil.com` (confusione e phishing).
- Un attaccante può sfruttare il fatto che il server "accetta" un host
  diverso per avvelenare le cache o per generare contenuti che dipendono
  dall'host.

La difesa è semplice: accettare solo gli host che conosci, e rispondere con
un errore a tutti gli altri.

## TrustedHostMiddleware: un'allow-list per l'header Host

Starlette fornisce `TrustedHostMiddleware`, un middleware pronto che controlla
l'header `Host` contro una lista di host permessi (l'allow-list) e risponde
`400 Bad Request` a chiunque non sia in lista. Si aggiunge con una riga:

```python
from starlette.middleware.trustedhost import TrustedHostMiddleware

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["localhost", "127.0.0.1", "miaapp.example"],
)
```

L'allow-list è una scelta esplicita: decidi tu chi è ammesso, e tutto il resto
viene rifiutato prima ancora di toccare una rotta o il database. È lo stesso
principio del permesso di soggiorno: chi non è nella lista non entra nel
palazzo.

## La porta viene ignorata nel confronto

Un dettaglio che confonde: `TrustedHostMiddleware` confronta gli host
**ignorando la porta**. `Host: localhost:5173` e `Host: localhost:8000`
vengono entrambi considerati `localhost`. È importante in sviluppo, dove il
proxy del frontend inoltra al backend l'header `Host` del browser — che
include la porta del *frontend*, non quella del *backend*. Basta quindi
elencare `localhost` senza porta, e copre entrambe. Nella lista metti i nomi
nudi, senza porte: sono i nomi a essere controllati, non le porte.

## Trade-off e insidie

- **La lista va tenuta aggiornata a ogni deploy.** Quello che va bene in
  sviluppo (`localhost`, `127.0.0.1`) non è quello che va bene in
  produzione, dove va aggiunto il dominio reale. Se il dominio cambia o ne
  aggiungi uno nuovo e dimentichi di aggiornare la lista, l'app risponde
  400 a tutte le richieste legittime — un errore facile da non notare
  perché i test su `localhost` passano comunque.
- **I client di test usano host finti.** Molti client HTTP di test usano un
  host di default che non è in lista (per esempio `testserver`). Se aggiungi
  il middleware, i test che prima passavano iniziano a ricevere 400 finché
  non imposti l'host corretto nel client. È il segno che il middleware
  funziona: bisogna solo configurare il client di test con l'host giusto.
- **La configurazione vive meglio nelle impostazioni, non nel codice.** Gli
  host ammessi cambiano tra ambienti (sviluppo vs produzione); se li leggi
  da una configurazione, al deploy basta aggiornare la configurazione senza
  toccare il codice.