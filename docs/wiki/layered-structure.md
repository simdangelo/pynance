# La struttura a strati: l'architettura del backend

## Perché separare il codice in strati

Un'applicazione backend ha sempre almeno tre responsabilità distinte, anche quando non le si chiama col loro nome: **ricevere le richieste** (HTTP, form, JSON in ingresso), **decidere cosa fare** (le regole di business: quanto è il totale, si può cancellare questa voce, cosa succede se l'utente fa X), e **conservare i dati** (scriverli e rileggerli da un database). Il modo più semplice di scrivere un'applicazione è mettere tutto insieme — gestire la richiesta, applicare le regole e fare la query nella stessa funzione. E per un prototipo va benissimo: funziona, e si scrive in fretta.

Il problema arriva quando il codice cresce. Se le regole di business sono mescolate con il parsing della richiesta e con le query, allora:

- ogni endpoint duplica un pezzo di logica, e due implementazioni della stessa regola prima o poi divergono;
- per capire "cosa succede se cancello una categoria" devi leggere codice HTTP, codice SQL e regole aziendali nello stesso file;
- cambiare una cosa (per esempio lo schema del database) ti costringe a toccare ogni punto dove l'uso del database si è mescolato con altro;
- testare una regola significa passare per l'HTTP e per il database, anche quando la regola non c'entra niente con nessuno dei due.

La **struttura a strati** è la risposta: dividi il codice in gruppi (strati) dove ogni gruppo ha una responsabilità sola, e imponi che le chiamate vadano in una sola direzione. Lo strato che riceve le richieste chiama lo strato delle regole, che chiama lo strato dei dati — mai il contrario, mai saltando un livello.

## I tre strati classici

- **Presentazione** (di solito una cartella tipo `api/`): sa tutto di HTTP — come si legge una richiesta, come si risponde, che status code restituire. Non contiene regole di business e non tocca il database. È un traduttore: prende l'input dal mondo esterno, lo consegna allo strato sotto, e traduce il risultato in una risposta HTTP.
- **Logica di business** (`services/`): le regole dell'applicazione. "Un totale negativo non si può salvare", "cancellare una categoria che ha voci la blocca". Qui non c'è niente di HTTP (una funzione di servizio non sa nemmeno che esiste un server web), e l'accesso ai dati avviene attraverso un'interfaccia o un oggetto di sessione passatogli da fuori.
- **Dati** (`models/`): la definizione delle entità e come si mappano sul database. Le classi che rappresentano le righe delle tabelle. Non contengono regole di business oltre alle proprietà derivate più semplici.

Il flusso delle chiamate è strettamente top-down: la presentazione chiama i servizi, i servizi chiamano i dati. Lo strato sotto non sa chi lo chiama, e non importa mai nulla dello strato sopra. I servizi, in particolare, non devono sapere nulla di HTTP — se lo sapessero, le regole di business si incollerebbero di nuovo al mondo esterno e il test diventerebbe di nuovo un problema.

## Perché questo paga: la testabilità

Il beneficio più concreto della separazione è il test. Se le regole di business vivono in funzioni pure che non sanno nulla di HTTP né di richieste, puoi testare ogni regola in isolamento, con input e output semplici, senza server web e senza database. E quando testi attraverso l'API, lo fai sapendo che la regola sotto è già verificata — il test HTTP verifica la *colla*, non la regola.

L'alternativa — il test che parte da HTTP, passa per tutto lo stack, e fallisce per una delle dieci cose che ha attraversato — è fragile e lento. Gli strati ti danno punti di verifica più piccoli e più affidabili.

## Lo scheletro vuoto: l'architettura come fatto fisico

C'è una mossa che rende la struttura a strati molto più difficile da violare: creare le cartelle degli strati **subito, vuote**, prima ancora che esista qualunque codice di funzionalità. Ogni strato è un pacchetto importabile (con il suo `__init__.py`), ma senza feature code dentro.

Non è burocrazia. Ha due effetti pratici. Primo, rende l'architettura un **fatto fisico**: se la cartella `services/` esiste da subito nel layout verso cui stai costruendo, è molto più difficile che la logica di business finisca per sbaglio dentro `api/` — lo spazio per farla finire lì semplicemente non c'è. Lo scheletro è un promemoria visivo permanente delle regole. Secondo, permette di **verificare l'impalcatura prima del contenuto**: se il tooling (il gestore di pacchetti, il linter, il type checker, il test runner) gira già verde su uno scheletro vuoto, allora quando arriva la prima feature l'unica cosa nuova è il codice, non la plomberia. Quando una feature fallisce, sai che è la feature — non la configurazione.

## Trade-off: quando la struttura a strati è troppa

La struttura a strati non è gratis. Ogni chiamata che attraversa un confine in più è un livello di indirezione in più. Per un'applicazione piccola e usa-e-getta, gli strati sono overhead: più file, più cerimonia, più percorsi mentali per una logica che sta in due funzioni.

La domanda giusta è: quanto è *probabile* che questa applicazione cresca, e di quanto? La struttura a strati classica è la scelta mainstream per applicazioni che hanno una logica di business non banale e che prevedono di vivere a lungo. Diventa eccessiva quando la logica è poca e la vita prevista è corta — lì un unico file ben scritto batte tre strati che non hanno nulla da contenere.

Esistono anche architetture più elaborate — esagonale, ports and adapters, domain-driven design — che portano la separazione molto più in là, con interfacce e inversione delle dipendenze anche dentro gli strati. Pagano quando hai più tecnologie intercambiabili (due database, più API esterne) o una logica di dominio molto ricca. Per un'applicazione con un solo database e una logica contenuta, l'indirezione in più compra poco: la struttura a strati semplice con regole chiare e poche eccezioni è già la forma che risolve i problemi veri.

## Insidie

- **Saltare gli strati.** La presentazione che interroga il database direttamente "perché è più veloce", il servizio che risponde in HTTP "perché serve". Ogni scorciatoia è un punto in cui le responsabilità si mescolano di nuovo, e il test di quel percorso diventa fragile.
- **Dipendenza verso l'alto.** Un modello che importa dalla presentazione, un servizio che sa che esiste un web server. Appena lo strato sotto guarda in su, la direzione delle dipendenze è rotta e il beneficio della separazione svanisce.
- **Cartelle senza `__init__.py`.** Uno strato che non è un pacchetto importabile smette di essere uno strato: gli import tra i livelli si rompono in modi confusi proprio quando la struttura dovrebbe aiutarti.
- **Aggiungere feature "per vedere che funziona" prima del tempo.** Se gli strati sono vuoti per scelta pedagogica, riempirli con codice non richiesto dal modulo corrente è il modo sicuro per far deragliare la progressione e far crescere la logica nel posto sbagliato.
- **Flessibilità dogmatica.** Applicare i confini con rigidità anche dove non servono (una funzione di utilità pura che non è né HTTP né business né dati) genera cerimonia inutile. I confini servono dove la responsabilità è chiara; il buon senso decide il resto.

In sintesi: la struttura a strati è una scelta di organizzazione che paga quando l'applicazione ha logica di business non banale e vita lunga — e uno scheletro vuoto creato in anticipo la trasforma da regola scritta su carta in vincolo fisico del repository.