# Dati derivati: normalizzare invece di sincronizzare

Quando un valore può essere ricavato da un altro attraverso una relazione (per
esempio una chiave esterna), memorizzarlo anche come colonna propria è un
**duplicato denormalizzato**: due copie della stessa informazione, che devono
essere tenute allineate dal codice. Questa wiki spiega perché quel
"tenere allineate" è quasi sempre un errore di design, e perché la soluzione
migliore è di solito **derivare il valore** invece di sincronizzarlo — con
un'eccezione importante, quando la storia non deve cambiare.

## Il duplicato denormalizzato e l'anomalia di aggiornamento

Un esempio classico: ogni ordine memorizza l'indirizzo del cliente, che è
determinato dal cliente stesso. Se il cliente cambia casa, l'indirizzo va
aggiornato in *tutti* gli ordini passati. Il vincolo di dipendenza funzionale
— "l'indirizzo dell'ordine dipende dal cliente" — significa che quel campo è
*derivabile*: non serve memorizzarlo, basta leggerlo dal cliente.

Il problema di memorizzarlo è che crea un'**anomalia di aggiornamento**: ogni
modifica alla fonte deve essere propagata a ogni copia, e ogni percorso che
aggiorna la fonte è un posto dove la propagazione può essere dimenticata. Il
caso peggiore è quando la regola viene applicata in un solo verso: un
percorso aggiorna la fonte, un altro percorso (che non conosce la regola)
aggiorna solo la copia, e le due versioni divergono *silenziosamente* — nessun
errore viene sollevato, semplicemente i dati non sono più coerenti.

## "Tenere in sincrono" è un odore di design

Quando scopri che due colonne devono combaciare e scrivi codice per mantenerle
allineate, la prima reazione è aggiungere un altro percorso di sincronizzazione
("aggiorna anche la copia"). È la reazione sbagliata: il codice di sincronia è
esattamente il posto dove i bug di consistenza vanno a nascondersi. Ogni copia
è un punto in più da mantenere, e la storia dei sistemi reali è piena di bug
nati da un percorso di aggiornamento dimenticato.

Il segnale da riconoscere è: *se un valore è derivabile, la copia è ridondante*.
La risposta giusta non è sincronizzare meglio, è eliminare la copia. La
normalizzazione — il processo che rimuove le dipendenze ridondanti — esiste
proprio per questo: eliminare le anomalie di aggiornamento alla radice, invece
di presidiarle col codice.

## La soluzione: una sola fonte di verità, e il valore lo si deriva

La forma concreta della soluzione:

1. **La colonna duplicata sparisce.** Il valore resta memorizzato una volta
   sola, dove è definito.
2. **Chi deve leggerlo lo deriva.** Una proprietà calcolata sull'oggetto che
   lo espone leggendo la relazione, oppure una join quando il valore serve in
   un'aggregazione (un report che raggruppa per quel valore).
3. **Il contratto di lettura non cambia.** Se l'API prima restituiva il campo,
   lo restituisce ancora — ma popolato dal valore derivato, non da una colonna.
4. **Il contratto di scrittura cambia.** Se il valore dipende da un'altra
   entità, chi scrive sceglie *quella* entità, e il valore segue da sé.

Il risultato più importante è strutturale: **l'incoerenza diventa
irrapresentabile**. Non c'è un check nel codice che verifica che le due copie
combacino, perché la seconda copia non esiste. Un errore che prima richiedeva
un controllo per essere evitato, e che il controllo poteva dimenticare di
fare, ora è impossibile per costruzione. Questo è il principio generale: una
regola resa impossibile dallo schema è più forte di qualunque regola imposta
dal codice, perché non può essere dimenticata.

## Il trade-off: quando lo snapshot è la scelta giusta

Derivare il valore significa che, quando la fonte cambia, *cambia anche tutto
ciò che la legge* — inclusa la storia. Per la maggior parte delle applicazioni
è il comportamento desiderato: riclassificare un cliente riclassifica i suoi
ordini. Ma non è sempre così. C'è un'alternativa, lo **snapshot**: conservare
il valore com'era *al momento della creazione* (magari reso immutabile),
rinunciando alla coerenza con la fonte in cambio di una storia fissa.

Il criterio di scelta è di dominio. Un'applicazione personale, dove l'utente
vuole che le cose si riclassifichino quando cambia una categoria, preferisce
derivare. Un **registro contabile** (un libro auditato, dove ogni voce deve
restare com'era registrata) preferisce lo snapshot: la storia non deve
cambiare retroattivamente. La scelta dipende dal significato dei dati, non
dalla comodità di implementazione. Vale la pena notarlo esplicitamente in una
decisione di design, perché le due strade non si possono mescolare senza
ambiguità.

## Le regole imposte dallo schema battono quelle imposte dal codice

Il filo che unisce tutto: quando puoi scegliere tra far rispettare una regola
con lo *schema* (struttura dei dati, vincoli, assenza di una colonna) o con il
*codice* (un controllo in un servizio), lo schema vince quasi sempre. Un
controllo nel codice va scritto, va ricordato, va messo in ogni percorso
pertinente — e un percorso può sempre dimenticarlo. Una regola strutturale —
"questo valore non può esistere" — non ha bisogno di essere applicata: non può
essere violata. La regola vive nel design dei dati, non nella vigilanza del
programmatore.

## Il costo nascosto delle proprietà derivate

La proprietà calcolata che espone il valore derivato ha un aspetto subdolo:
sembra un campo normale, ma dietro c'è una lettura. Quando un ORM carica una
lista di oggetti e per ognuno viene letta la proprietà derivata che attraversa
una relazione, la lettura può scatenare una query per riga — il noto problema
**N+1**: una query per la lista più una per ogni elemento, con il costo che
cresce linearmente con il numero di righe. Questo è un problema di *strategia
di caricamento*, non di design: la proprietà derivata resta la scelta giusta,
e il problema si risolve caricando la relazione insieme alla lista (eager
loading), non cambiando il modello. Vale la pena saperlo perché una proprietà
derivata è esattamente il punto in cui un N+1 si nasconde in modo invisibile
alla revisione del codice. (Per i dettagli vedi la wiki sul problema N+1.)

## Le insidie più comuni

- **Sincronizzare in un solo verso.** La regola viene applicata su un
  percorso ma non sull'altro, e le copie divergono senza errori. Se c'è una
  copia, c'è un percorso che la dimentica.
- **Duplicare per "comodità" di lettura.** "Tanto il valore è già lì, evitiamo
  una join." È la tentazione da cui nascono le anomalie: la comodità di oggi è
  il bug di sincronizzazione di domani.
- **Rispondere al bug aggiungendo altro codice di sincronia.** Il fix
  apparente (aggiorna anche la copia) preserva il problema invece di
  eliminarlo. La domanda giusta è: posso eliminare la copia?
- **Derivare con codice che va in sync.** Un percorso che, quando la fonte
  cambia, aggiorna *anche* le copie: stai ancora mantenendo duplicati, solo
  con più codice. La derivazione vera non scrive nulla: calcola al momento
  della lettura.
- **Ignorare il costo del caricamento.** La proprietà derivata che legge una
  relazione in un ciclo su una lista: sembra gratis, è un N+1. Caricare in
  anticipo, senza cambiare il design.