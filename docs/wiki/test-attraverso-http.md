# Testare l'applicazione attraverso l'HTTP layer

Quando un'applicazione ha una logica di business separata dalla presentazione,
sorge subito la domanda: dove si scrivono i test? La risposta più comune nei
progetti a strati è testare i servizi in isolamento, sostituendo il database
con finte (fake) o doppioni. Questa wiki illustra la strategia alternativa:
**testare l'applicazione dall'esterno, attraverso l'HTTP layer**, contro un
database di test vero, lasciando che la richiesta percorra tutta la pila —
routing, validazione, servizio, modelli, SQL vero. Non è la scelta giusta
sempre e ovunque, ma per un'applicazione a strati con un solo database è spesso
quella che dà più garanzie a parità di fatica.

## Due strategie a confronto: finti contro il percorso vero

**Test con i finti.** Sostituisci il database con un oggetto finto, chiami i
servizi direttamente e verifichi che facciano la cosa giusta. Il vantaggio è
la velocità e la precisione: il test è mirato, non serve un database. Il costo
è che i finti *non testano il codice vero*: testano la tua immaginazione del
codice. Se un servizio usa una funzione della sessione che il finto non ha
simulato bene, il test passa e in produzione il codice si rompe lo stesso. E i
finti vanno mantenuti a mano, a ogni modifica dei servizi.

**Test attraverso l'HTTP.** Un client HTTP avvolge l'applicazione e le
richieste attraversano davvero tutto: lo schema valida l'input, il router
chiama il servizio, il servizio esegue SQL vero sul database di test, la
risposta viene modellata dallo schema. Il costo è l'allestimento (serve un
database di test) e un'esecuzione più lenta. Il guadagno è che il test verifica
il *comportamento reale*: quello che il client riceve è esattamente ciò che
l'applicazione produrrebbe. Le regole di business vengono testate attraverso
gli effetti che producono — una richiesta che fallisce perché la regola è
violata, una risposta che cambia perché lo stato è cambiato.

Per un'applicazione a strati con un solo database, il secondo approccio è il
default sensato: elimina l'intera categoria dei bug "il finto era diverso dal
vero" e i test di business logic si scrivono senza dover costruire doppioni.

## La meccanica: un client HTTP che avvolge l'app

Il modo più semplice per testare attraverso l'HTTP è usare il client di test
che il framework offre (per esempio `TestClient` in FastAPI/Starlette, o
`AsyncClient` con `ASGITransport`): un oggetto che avvolge l'applicazione e
permette di fare richieste HTTP *senza avviare un server*. Niente porte, niente
processi separati: il client parla direttamente con l'applicazione. Dal punto
di vista dell'app non c'è differenza rispetto a una richiesta vera.

Un test ha la forma di qualunque test HTTP: prepara lo stato, fai la richiesta,
controlla la risposta.

```python
def test_create_order(client):
    category = create_test_category(client, "groceries", "expense")
    response = client.post(
        "/orders",
        json={"amount": "12.34", "category_id": category["id"], ...},
    )
    assert response.status_code == 201
    assert response.json()["amount"] == "12.34"
```

Da notare due cose: il test parla con l'API (`client.post(...)`), non con una
funzione importata, e le asserzioni sono sulla risposta HTTP — codice di stato
e corpo. La logica di business si verifica attraverso il comportamento che
produce, non ispezionando i meccanismi interni.

## Un database di test vero

L'approccio ha senso solo se sotto c'è un database *vero*, separato da quello
di sviluppo o produzione. La scelta tipica è un database dedicato (per esempio
una seconda base sullo stesso server Postgres, o un'istanza usa-e-getta) di cui
l'applicazione non sa nulla in produzione.

Lo schema di questo database di test può nascere in due modi:

- **dai modelli**: creando le tabelle direttamente dal metadata dell'ORM. È
  veloce e lo schema combacia sempre con i modelli correnti — se il modello
  cambia, il test vede subito il nuovo schema;
- **dalle migrazioni**: eseguendo le migrazioni vere. È più fedele alla
  produzione — le migrazioni hanno spesso trasformazioni che il create-dai-
  modelli non replica (rinominazioni, vincoli, dati di seed) — ma più lento e
  più fragile.

Il trade-off è tra velocità e fedeltà: i modelli sono comodi e sempre
allineati; le migrazioni sono la verità di produzione. Per la maggior parte
dei test il primo approccio basta; se un bug dipende da una migrazione
specifica, la si testa a parte.

## Il punto di giunzione: scambiare una dipendenza

L'applicazione in produzione ottiene il suo database da una dipendenza (per
esempio una funzione `get_db` iniettata a ogni richiesta). Per i test serve
che la stessa applicazione, con lo stesso codice, usi il database di test al
posto di quello vero. Il meccanismo è un *seam* offerto dal framework di
dependency injection: la possibilità di sovrascrivere una dipendenza con
un'alternativa. In FastAPI è `app.dependency_overrides[get_db] = ...`:
registri la funzione che produce la sessione di test al posto di quella di
produzione, fai le richieste, e a fine test la rimuovi.

Questo è il punto di contatto tra il mondo del test e il mondo
dell'applicazione: da una parte l'applicazione usa il suo `get_db` normale,
dall'altra il test lo sostituisce con uno legato al database di test. È
l'unico "finto" dell'intera strategia, ed è un finto minimo e controllato: non
simula il comportamento di niente, semplicemente punta l'applicazione a un
database diverso.

## L'isolamento: ogni test parte da una tabula rasa

Perché i test non si influenzino a vicenda, lo stato deve essere pulito tra un
test e l'altro. La struttura tipica usa due livelli di fixture:

- una fixture con ambito ampio (per l'intera sessione di test) che crea lo
  schema una volta sola — il costo più alto, pagato una volta;
- una fixture per ogni test che apre una sessione pulita e **cancella i dati**
  (delete o truncate delle tabelle) prima di lasciar lavorare il test.

La regola è la stessa dei test in generale: ogni test deve funzionare da solo,
in qualunque ordine, insieme a tutta la suite. Se un test lascia righe in
giro, il prossimo le trova e fallisce per un motivo che non c'entra niente con
il suo codice. Le fixture condivise (client, sessioni, helper per creare dati
attraverso l'API) vivono in un file di configurazione comune — in pytest, il
`conftest.py` — così i singoli file di test restano snelli e ripetono solo
quello che serve a raccontare il loro caso.

## Cosa testare, e perché

Attraverso l'HTTP si testano i percorsi che un client può davvero percorrere.
Le categorie da coprire:

- **I percorsi felici**: creare, leggere, aggiornare, cancellare, ottenere i
  report giusti.
- **Il comportamento delle regole di business**: il modo più affidabile è
  testare il *comportamento osservabile*. Se una regola dice "il tipo segue la
  categoria", il test cambia la categoria e verifica che la risposta della
  transazione rifletta il cambiamento — è la prova che la regola vale davvero,
  ed è anche la *regression test* del bug che la regola ha eliminato.
- **I non trovati**: operazioni su un id inesistente → `404`.
- **La validazione**: input mancanti o malformati → `422`.
- **La correttezza dei report**: si seminano pochi dati noti e si verifica che
  i totali siano quelli attesi.

## Un test che passa non è una prova di correttezza

Il principio più importante di questo approccio, e dei test in generale: **un
test che passa dimostra solo che i casi che esercita funzionano** — non che il
codice sia corretto. C'è un modo concreto in cui questo inganna, ed è
l'esempio del *caso limite che passa per caso*. Se una funzione di date
decrementa sempre l'anno e poi gestisce il mese, un test sul passaggio
gennaio→dicembre passa — perché in gennaio il decremento "sbagliato" coincide
con quello giusto. Il bug (il decremento incondizionato) si nasconde proprio
lì, mascherato dal caso limite, e salta fuori solo con un caso *di mezzo*
(per esempio un confronto tra agosto e luglio).

Due regole pratiche:

- **Testa il confine e il mezzo.** I casi limite sono essenziali, ma da soli
  possono mascherare i bug che appaiono solo lontano dal confine. Una tabella
  di casi rappresentativi — l'inizio, un valore centrale, la fine — copre
  entrambe le zone.
- **Asserisci il risultato, non i passi.** Se l'asserzione è "il totale
  giusto", un bug nei passi intermedi viene scoperto quando produce il
  risultato sbagliato; se l'asserzione è "la funzione ha chiamato X", il test
  passa anche quando il risultato è sbagliato.

## I costi e quando l'approccio non conviene

Testare attraverso l'HTTP costa: allestire e mantenere un database di test,
esecuzioni più lente, setup più macchinoso. Per questo non è l'unico strumento
da usare. I test puramente unitari restano giusti quando la logica è pura —
funzioni senza I/O, matematica, trasformazioni di dati — perché lì il test
diretto è più veloce e altrettanto affidabile. Ma quando la logica è
*attaccata* alla persistenza (come la business logic di un'applicazione a
strati), il test attraverso l'HTTP è spesso la scelta che dà più valore: niente
finti da mantenere, niente "passa per il motivo sbagliato", e il test verifica
il contratto vero che il client consuma.

## Le insidie più comuni

- **Test che dipendono dall'ordine.** Righe accumulate da un test all'altro:
  il test fallisce solo in certi ordini e il motivo è illeggibile. Pulire lo
  stato nelle fixture, non fidarsi di un ordine.
- **Asserzioni sull'implementazione.** Verificare che un servizio sia stato
  chiamato con certi argomenti, invece del risultato HTTP: il test si rompe a
  ogni refactoring innocuo e non dice se il comportamento è giusto.
- **Il falso verde.** Un test che passa prima che la funzionalità esista non
  prova nulla. Quando scrivi un test per una regola, verifica che fallisca
  prima di implementarla.
- **Dimenticare il teardown.** Una fixture che apre una sessione o un client e
  non li chiude, o non rimuove la sovrascrittura della dipendenza a fine test:
  lo stato sporco contamina i test successivi.
- **Una sola categoria di casi.** Tutti casi felici, o tutti casi limite: il
  bug vive di solito nell'intersezione che non hai coperto. Casi felici,
  errori e casi limite vanno insieme.