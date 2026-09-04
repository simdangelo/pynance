# La gestione degli errori in un'applicazione a strati

Un'applicazione a strati non gestisce gli errori in un punto solo: li gestisce
dove nascono, in modo che chi li scopre e chi li comunica restino separati. Il
problema di fondo è che gli errori attraversano i confini — una regola violata
nasce in profondità, nella logica di business o addirittura nel database, ma
deve diventare una risposta HTTP con un codice di stato. Se ogni strato
"parla la sua lingua", l'arte è far sì che l'errore venga *sollevato* nella
sua lingua naturale e *tradotto* solo al confine.

## Ogni strato parla la sua lingua

- La **logica di business** parla il linguaggio del dominio: "categoria non
  trovata", "cliente con ordini pendenti", "il tipo non combacia". Un errore
  qui è il nome della regola violata.
- La **presentazione** parla il linguaggio del trasporto: codici di stato HTTP
  e messaggi per il client.
- Il **framework** di validazione parla il linguaggio della forma: "campo
  mancante", "valore non valido".

La regola che ne deriva: un errore viene *creato* nello strato che ha
scoperto il problema e *tradotto* nello strato che deve comunicarlo. La
logica di business non solleva mai un errore HTTP; la presentazione non
inventa mai una regola.

## Perché eccezioni di dominio e non `None`

Il modo più ingenuo di segnalare un fallimento è restituire `None`: "non ho
trovato niente". Funziona, ma scarica l'ambiguità su chi chiama: `None` vuol
dire *non trovato*, oppure *risultato valido ma vuoto*? Chi chiama deve
indovinare, e se indovina male un client riceve un 404 dove doveva arrivare
una lista vuota, o viceversa. Un'eccezione di dominio è esplicita: il nome
dice esattamente quale regola è stata violata, e chi la intercetta sa *perché*
è fallito senza dover interpretare un valore sentinella.

## Perché i servizi non devono conoscere l'HTTP

Potrebbe sembrare più comodo che il servizio sollevi direttamente
`HTTPException(status_code=404, detail="...")`. Ma questo importerebbe il
framework web dentro la logica di business, e la conseguenza è che il servizio
smette di essere riusabile: non può più essere chiamato da un test, da uno
script da terminale o da un job che non parlano HTTP — perché per costruire
l'eccezione deve sapere dell'HTTP. Un'eccezione di dominio è solo una classe
Python: chiunque può sollevarla e chiunque può catturarla, anche in un contesto
senza HTTP.

## La traduzione al confine, l'unica logica della presentazione

La presentazione intercetta le eccezioni di dominio e le traduce in risposte
HTTP. È l'unico ragionamento che le è concesso, ed è sempre lo stesso schema:

```python
try:
    result = service.create_order(db, order=order)
except CustomerNotFoundError:
    raise HTTPException(status_code=404, detail="Customer not found")
```

Due dettagli da notare. Il primo: un `raise` dentro un blocco `except`
*rilanciasse* l'eccezione — qui lo si rimpiazza con l'errore HTTP, che è il
pattern standard per trasformare un fallimento di dominio in una risposta. Il
secondo: la traduzione è una corrispondenza *uno a uno* tra eccezioni di
dominio e codici di stato. Se nella catena `except` compaiono condizioni o
ragionamenti, qualcosa è slittato dal servizio alla presentazione.

## Gli errori di forma li gestisce il framework

Gli input malformati — un campo mancante, un valore del tipo sbagliato, una
stringa troppo lunga — vengono rifiutati automaticamente dal framework di
validazione, che produce una risposta `422 Unprocessable Entity` senza che tu
scriva una riga di codice. La validazione di forma è dichiarativa: sta sullo
schema di input, si verifica al confine. Il tuo codice non deve occuparsene: si
occupa solo degli errori di *merito*, quelli che richiedono di consultare lo
stato del sistema.

## Il database come garante finale: vincoli ed EAFP

Alcune regole non si possono (o non si vogliono) affidare solo al codice, perché
il codice ha un punto cieco: la **race condition**. Considera la cancellazione
di un'entità che altre righe referenziano. Un controllo preventivo nel servizio
— "esistono righe che puntano a questa entità?" — lascia aperta una finestra:
tra il controllo e la cancellazione, un'altra richiesta può inserire una riga
che punta all'entità. L'unica cosa che chiude quella finestra è il vincolo del
database: una chiave esterna senza azione di cancellazione fa rifiutare la
cancellazione *atomically*, senza che nessun codice possa aggirarlo.

Questo suggerisce una divisione dei ruoli, che vale in generale:

- **Il vincolo del database è la garanzia dura.** La regola è applicata dal
  database stesso, in modo atomico e immune alle race condition. Non può essere
  dimenticata, perché è scritta nello schema.
- **L'eccezione intercettata è il messaggero educato.** Il servizio tenta
  l'operazione e, quando il database la rifiuta, traduce l'errore di integrità
  in un'eccezione di dominio leggibile, che la presentazione trasforma in una
  risposta pulita (per esempio `409 Conflict`) invece di un `500` con dettagli
  interni.

Questo è il pattern **EAFP** (Easier to Ask Forgiveness than Permission):
procedi e, se il database si oppone, gestisci l'opposizione. È sicuro *perché*
il vincolo esiste — EAFP non è un'alternativa al vincolo, è ciò che rende il
vincolo utilizzabile senza far trapelare errori grezzi. Se oltre all'errore di
integrità serve distinguere i casi ("l'entità non esiste" → 404, "ha righe
collegate" → 409), l'*esistenza* si controlla prima con una query; la *regola di
integrità* la fa rispettare il database.

## Quando EAFP diventa ambiguo

L'intercettazione cieca di un errore di integrità è sicura solo quando l'errore
può avere un'unica causa. Se la stessa operazione può violare *più* vincoli
(una chiave esterna, un vincolo di unicità, un controllo di valore), un unico
errore di integrità è ambiguo: non sai quale regola è stata violata. In quel
caso, o si verifica prima quale dei casi si applica, o si ispeziona l'errore
per distinguerli. Tradurre incondizionatamente un errore di integrità in una
sola eccezione di dominio è corretto solo quando l'insieme dei vincoli che
possono scattare è unico e noto.

## La mappa degli errori

In pratica la corrispondenza tra situazioni, segnali e risposte finisce per
essere una piccola tabella, ed è utile tenerla a mente come contratto:

| Situazione | Chi la scopre | Cosa succede |
|---|---|---|
| Input malformato (forma) | framework di validazione | `422` automatico, nessun codice |
| Entità non trovata | servizio solleva un'eccezione di dominio | `404` |
| Regola di integrità violata | database rifiuta, servizio traduce | `409` (o il codice adatto) |
| Tutto a posto | — | `200` / `201` / `204` |

Gli errori che *scrivi* a mano sono solo quelli di merito; gli errori di forma
arrivano già fatti dal framework.

## Le insidie più comuni

- **Eccezioni con nomi generici.** Un `ValueError` non dice quale regola è
  violata; chi deve tradurre non sa cosa significa. Un nome di dominio
  (`CustomerNotFoundError`) è auto-documentante e rende la traduzione una
  corrispondenza esplicita.
- **Tradurre troppo presto.** Sollevare errori HTTP dentro il servizio (vedi
  sopra): accoppia la logica al trasporto.
- **Tradurre troppo tardi o mai.** Lasciare che un errore di integrità grezzo
  arrivi fino al client come `500`: trapela un dettaglio interno e il client
  non capisce cosa sia andato storto. La traduzione va fatta al confine.
- **Dimenticare il rollback dopo un errore di commit.** Quando un commit
  fallisce, la sessione resta in uno stato incoerente; se la si riusa senza
  fare rollback, l'errore avvelena la richiesta successiva. Il rollback dopo
  l'eccezione è parte della gestione dell'errore, non un dettaglio.
- **Controlli preventivi al posto dei vincoli.** Una pre-verifica lascia aperta
  la finestra della race condition e duplica nel codice una regola che il
  database già applica. Il vincolo è la garanzia; il codice al massimo la
  spiega al client.