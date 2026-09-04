# Architettura a strati: dove vive la logica di business

Quando un'applicazione deve esporre dati attraverso un'API, la tentazione è
scrivere tutto dentro il gestore della richiesta: leggere dal database,
applicare le regole, costruire la risposta. All'inizio funziona. Poi le regole
crescono, i gestori si duplicano, e ogni modifica a un flusso rischia di
romperne un altro a sorpresa. L'architettura a strati (chiamata anche N-tier,
perché organizza il codice in N livelli sovrapposti) è la risposta strutturata
a questo problema: dividere l'applicazione in strati con responsabilità
distinte, far dipendere ogni strato solo da quello immediatamente sotto, e
dare alle regole di business una casa sola, da cui ogni percorso passa.

## Il problema che questa architettura risolve

Senza una separazione, la logica di business si sparpaglia. La stessa regola —
"un ordine non si può cancellare se ha delle voci" — finisce copiata nel
gestore che crea l'ordine, in quello che lo elimina, magari in un job notturno
che pulisce i dati. Ogni copia è un posto dove la regola può essere aggiornata
male, o non aggiornata affatto. Quando poi si vuole cambiare il modo in cui
l'applicazione viene raggiunta (da un'API HTTP a un comando da terminale, da
un servizio web a un job di elaborazione), tutta quella logica incollata
all'HTTP deve essere riscritta o duplicata.

L'architettura a strati risponde dando a ogni tipo di responsabilità un posto
fisso. Il risultato non è più ordine per gusto estetico: è che una regola
esiste in un solo punto, si testa in un solo punto, e la parte che cambia con
il contesto (l'HTTP, il database) resta isolata dalla parte che non cambia
(le regole del dominio).

## I tre strati, dal tavolo alla dispensa

Una buona analogia è un ristorante. Il cameriere non cucina e il cuoco non
prende le ordinazioni dai tavoli: il cameriere scrive l'ordine, il cuoco lo
prepara in cucina, e chi sta in cucina attinge alla dispensa. Se un cliente
chiede qualcosa che non c'è, il cameriere non rifà l'inventario da solo: lo
riferisce, e la verità su cosa esiste la decide chi sta in cucina, che guarda
la dispensa.

L'applicazione ha le stesse tre stanze:

- **La presentazione** — i router, i controller, i gestori delle route. Riceve
  la richiesta, ne verifica la forma, chiama la logica di business, modella la
  risposta. Non prende decisioni di merito: è il cameriere.
- **La logica di business** — il service layer. Le regole dell'applicazione:
  "questo cliente non si può cancellare perché ha ordini", "il totale è la
  somma delle voci", "il tipo di una voce segue quello della categoria". È la
  cucina: sa come preparare le cose, non si occupa del tavolo né della dispensa.
- **La persistenza** — i modelli e le query che leggono e scrivono il
  database. È la dispensa: tiene i dati, e basta. Non decide nulla sulle
  regole.

Il viaggio di una richiesta è sempre lo stesso, dall'alto in basso e poi di
nuovo su: la presentazione riceve la richiesta e la passa alla logica di
business, che usa la persistenza, e il risultato risale per essere modellato
nella risposta. La direzione del flusso è fissa: mai la logica di business che
chiama la presentazione, mai la persistenza che decide una regola.

## La regola d'oro: si dipende solo dallo strato sotto

La regola che rende l'architettura solida è una sola, e si applica senza
eccezioni: **ogni strato può usare solo lo strato direttamente sotto di sé**.
Le conseguenze pratiche sono tre:

- la presentazione non tocca mai il database — non esegue query, non aggiunge
  righe, non valida regole di merito: passa la richiesta al servizio e gli
  chiede il risultato;
- la logica di business non sa nulla del trasporto — non importa il framework
  web, non conosce l'HTTP, non solleva errori HTTP;
- la persistenza non conosce nulla del mondo esterno — modelli e query non
  contengono regole di business, solo la rappresentazione dei dati.

Perché così severa? Perché ogni violazione fa riapparire il problema che
l'architettura doveva eliminare. Se la presentazione interroga il database, la
regola "non si può cancellare un cliente con ordini" va ricontrollata anche lì,
e torna la duplicazione. Se la logica di business conosce l'HTTP, non può più
essere riusata da un test, da un comando da terminale o da un job che non
parlano HTTP.

## Il service layer, la casa della logica di business

Il service layer è la forma concreta che la logica di business assume in
pratica: funzioni (o piccole classi che raggruppano funzioni affini) che
implementano un caso d'uso alla volta — "registra un ordine", "calcola il
totale del mese". La forma tipica è una funzione che riceve le sue dipendenze
come parametri e restituisce un risultato:

```python
def create_order(db: Session, *, order: OrderCreate) -> Order: ...
```

Quattro proprietà la rendono tale:

- **È framework-free.** Non importa il framework web, non usa concetti HTTP.
  La stessa funzione può essere chiamata da un'API, da uno script da terminale
  o da un test.
- **Le dipendenze entrano come parametri.** La sessione del database (o
  qualunque altra risorsa) è fornita da chi chiama, non creata dentro. Il
  servizio resta testabile e il ciclo di vita della risorsa resta in mano allo
  strato di presentazione, che la prepara a ogni richiesta.
- **I fallimenti sono eccezioni di dominio.** Quando una regola è violata —
  l'entità non esiste, il tipo non combacia — il servizio solleva un'eccezione
  normale, con un nome che dice la regola violata. Non restituisce `None`, non
  solleva errori HTTP: dice "questa cosa non è riuscita" nel linguaggio del
  dominio. (Vedi la wiki sulla gestione degli errori per il perché.)
- **In uscita restituisce tipi semplici.** Un'istanza del modello per le
  operazioni CRUD, oppure un dato puro per i report: una piccola dataclass di
  totali, non un oggetto ORM che finge di essere una riga di report.

Quando un caso d'uso riceve molti input opzionali che si sommano (filtri di
una lista, un intervallo di date per un report), conviene raggrupparli in un
**value object**: una dataclass che nomina il set di parametri come un'unica
cosa. Il servizio prende `OrderFilters`, non `q: str | None, year: int | None,
month: int | None, category_id: int | None` come parametri posizionali che
crescono a ogni nuova esigenza. Il beneficio è duplice: aggiungere un filtro
significa aggiungere un campo alla dataclass, non cambiare ogni chiamata, e il
servizio costruisce la query aggiungendo condizioni solo per i campi valorizzati.

## La presentazione sottile, il cameriere che non cucina

Il gestore della richiesta (router o controller) è deliberatamente banale. Fa
sempre tre passi, nell'ordine:

1. **verifica la forma dell'input** — di solito in automatico, dichiarando il
   tipo del corpo della richiesta con uno schema di validazione;
2. **chiama il servizio** — gli passa l'input già validato e la sessione;
3. **modella la risposta** — trasforma quello che il servizio restituisce
   nella forma che il client deve vedere.

C'è una sola eccezione, accettata per costruzione: la **traduzione degli
errori**. Il servizio solleva un'eccezione di dominio ("categoria non
trovata"); la presentazione la intercetta e la traduce nel corrispondente
codice di stato HTTP (404). Questo non è fare business logic: è l'unico punto
in cui il linguaggio del dominio diventa linguaggio del trasporto. Un `raise`
dentro un blocco `except` rilanciasse l'eccezione come errore HTTP — il pattern
standard per questa traduzione.

Tutto il resto — decidere se qualcosa è permesso, calcolare un totale, scegliere
come ordinare i risultati — appartiene al servizio. Un router che comincia a
fare questi ragionamenti è il primo sintomo che l'architettura sta slittando.

## Lo strato di persistenza: contenitori di dati, non regole

I modelli ORM rappresentano le tabelle e le loro relazioni. Sono "contenitori
stupidi": espongono colonne e relazioni, al massimo qualche proprietà derivata
semplice. Non contengono metodi che implementano casi d'uso, non validano
regole di business. Se una proprietà è derivabile (per esempio un valore che si
legge attraverso una relazione), può essere esposta come proprietà calcolata —
ma il calcolo è una lettura, non una regola (vedi la wiki sui dati derivati).

## La validazione: forma al confine, regole nel servizio

C'è una distinzione sottile ma cruciale su dove validare. I dati che entrano
attraversano due tipi di controllo:

- **La forma**: il campo è presente? è del tipo giusto? ha la lunghezza o
  l'intervallo giusto? Questo controllo sta sullo schema di input, al confine
  dell'HTTP, perché è lì che il dato viene dichiarato e può essere rifiutato
  subito con un errore di validazione.
- **Le regole di merito**: questo campo è coerente con quell'entità? questo
  valore è permesso *in relazione a* qualcos'altro? Queste regole stanno nel
  servizio, perché coinvolgono lo stato del sistema (altre righe, altre
  entità), che solo il servizio può consultare.

La regola pratica: se il controllo può essere fatto guardando solo il dato in
arrivo, è forma e sta nello schema; se richiede guardare il database o
relazioni tra entità, è merito e sta nel servizio. Gli schemi non devono
trapelare verso il basso: il contratto API non diventa mai dato di
persistenza, e gli schemi di risposta non vengono mai usati come input o
output dei servizi — il servizio lavora con i propri tipi e la presentazione
fa da traduttore al confine.

## Quando questa architettura è la scelta giusta (e quando no)

L'architettura a strati non è gratis: aggiunge file, indirezione e una
disciplina da mantenere. Conviene quando l'applicazione ha regole di business
reali e un confine HTTP, perché è lì che il prezzo si ripaga in testabilità e
in assenza di duplicazione.

La domanda da farsi è quanto *cerimonia* serve intorno ai tre strati. Esistono
varianti molto più elaborate — repository pattern, porte e adapter, un dominio
"puro" completamente separato dal framework — che isolano la persistenza dietro
un'interfaccia. Pagano quando ci sono più tecnologie di persistenza da poter
scambiare, o quando il dominio è così complesso da meritare un modello
indipendente. Per un'applicazione con un solo database e una logica di
dimensione contenuta, quella cerimonia è indirezione senza ritorno: il servizio
che usa direttamente la sessione del database è più semplice da leggere e non
perde nulla. Il criterio non è la purezza architettonica: è che ogni livello di
indirezione aggiunto debba comprare qualcosa di concreto.

## Le insidie più comuni

- **Logica nel gestore della richiesta.** Un router che decide, calcola o
  interroga il database. Ogni regola lì è una copia di una regola che vive nel
  servizio, e le copie divergono.
- **Servizi che importano il framework.** Un servizio che solleva errori HTTP
  o usa oggetti della richiesta smette di essere riusabile fuori dal contesto
  web e di fatto rompe la separazione degli strati.
- **Schemi che filtrano negli strati bassi.** Passare uno schema di validazione
  a un modello o dentro una query, o usare uno schema di risposta come input di
  un servizio: il contratto API si mescola alla persistenza.
- **Firme che crescono.** Un servizio con dieci parametri posizionali per i
  filtri opzionali diventa illeggibile e ogni nuova esigenza cambia tutte le
  chiamate. Raggruppare gli input composti in un value object.
- **La persistenza che decide.** Mettere regole di business nei metodi dei
  modelli: la regola finisce dove non può essere testata dal servizio e dove
  nessun percorso alternativo la rispetta.
- **Dimenticare che la validazione ha due livelli.** Tutto in fondo (regole di
  merito dichiarate come vincoli di forma, o vincoli di forma ignorati e
  ricontrollati a mano nel servizio). La forma sta al confine, il merito nel
  servizio.