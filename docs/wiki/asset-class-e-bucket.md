# Tassonomia e scopo: due dimensioni indipendenti per classificare

Capita spesso di dover classificare le entità di un dominio — strumenti
finanziari, spese, contenuti, macchinari — e di ritrovarsi con un solo campo
che mescola due domande diverse: *che cosa è* questa cosa e *a che cosa serve*.
Questa wiki spiega perché sono due dimensioni indipendenti, perché tenerle
separate evita di legare lo schema a una strategia che può cambiare, e in che
modo si derivano le classificazioni senza lasciare buchi nei totali.

## Due domande diverse finiscono nello stesso campo

Immagina un'app che traccia dove sono i tuoi soldi e li classifica con un
campo solo: `tipo = conto corrente | risparmio | ETF`. Sembra innocuo, finché
non arriva uno strumento che non sai dove mettere. Un ETF monetario è un ETF?
Sì, per lo strumento. Ma lo usi come parcheggio della liquidità, non come
investimento di lungo periodo. Con un campo solo non puoi dirlo: il vocabolario
ha già deciso al posto tuo, e in realtà sta rispondendo a due domande
mescolate.

La prima domanda è **che cosa è** l'oggetto: una proprietà del mondo, che non
dipende da chi lo possiede né da come intende usarlo. Un ETF monetario è un ETF
monetario per chiunque. La seconda è **a che cosa serve**: una scelta di chi lo
possiede, che può cambiare senza che l'oggetto cambi. Lo stesso identico
strumento può essere, per due persone diverse, la riserva di emergenza o una
componente del portafoglio di lungo periodo. Sono due assi ortogonali, e un
campo solo può rappresentarne al massimo uno.

## La tassonomia: che cosa è l'oggetto

La tassonomia è l'elenco delle categorie *oggettive*. Ha due proprietà
riconoscibili: non dipende dall'utente (tutti concordano che un'obbligazione
sia un'obbligazione) e cambia lentamente, per decisione di dominio — quando
nasce un nuovo tipo di strumento, non quando cambia l'opinione di qualcuno.

Per questo la tassonomia sta bene in un **vocabolario controllato**: un enum
nel codice, o un tipo nel database. "Controllato" significa che i valori
ammessi sono un insieme chiuso e noto, non testo libero. È ciò che rende
possibile aggregare in modo affidabile: su un vocabolario controllato un
`GROUP BY` produce gruppi veri, mentre su una stringa libera "azionario
globale", "Azionario Globale" e "az. globale" diventano tre gruppi diversi per
la stessa cosa. La tassonomia è anche la dimensione giusta per i report di
composizione: "quanto ho in obbligazionario" è una domanda sulla natura degli
strumenti, non sui piani di chi li detiene.

Che la tassonomia sia controllata non significa che sia immutabile: significa
che aggiungere un valore è una decisione esplicita, non un effetto collaterale
di come qualcuno ha scritto una stringa. Un enum nativo del database rende
quella decisione più costosa: in Postgres un valore aggiunto con
`ALTER TYPE ... ADD VALUE` non è eliminabile, e non è utilizzabile nella
stessa transazione che lo aggiunge. Una colonna stringa con un vincolo `CHECK`
rende l'aggiunta una normale migrazione. La scelta tra i due dipende da quanto
ti aspetti che il vocabolario cresca: per un insieme che cambia raramente il
tipo nativo è più espressivo e più sicuro, per una tassonomia di prodotto
destinata a estendersi è meglio la stringa validata.

## Lo scopo: a cosa serve, per chi

Lo scopo è la categoria *soggettiva*: non descrive l'oggetto, descrive
l'intenzione di chi lo usa. "Fondo di emergenza", "spese prevedibili",
"lungo termine" non sono proprietà di uno strumento: sono ruoli. Lo stesso
strumento può ricoprire ruoli diversi, e lo stesso ruolo può essere ricoperto
da strumenti diversi.

Proprio perché è una scelta dell'utente, il vocabolario degli scopi deve
essere **configurabile**: righe in una tabella, per utente, rinominabili,
aggiungibili, eliminabili. I default servono solo come punto di partenza. Se
lo scopo diventa un enum hardcoded, hai messo la strategia di una persona
dentro lo schema del database: il giorno in cui quella persona cambia
approccio, l'app richiede una migrazione. E se lo scopo è un enum, due utenti
con filosofie diverse non possono convivere nello stesso schema senza
compromessi.

Il criterio per decidere dove mettere un vocabolario è quindi: **è un fatto del
dominio o una politica dell'utente?** Nel primo caso è codice (enum, tipo);
nel secondo è dato (tabella, righe). Il test pratico: se due utenti ragionevoli
potrebbero volere vocabolari diversi, è una politica.

## Perché mescolare i due assi crea lock-in

Quando un unico campo mescola natura e ruolo, ogni cambiamento di strategia
sembra un cambiamento di schema. Un enum "pilastro 1, pilastro 2, pilastro 3,
pilastro 4" sembra una buona idea finché la strategia a quattro pilastri è
quella giusta; quando l'utente la abbandona — o vuole solo adattarla — i dati
non sanno più cosa significano e serve una migrazione di valori, che è la
migrazione più dolorosa: non cambia la forma dei dati, cambia il loro
significato, e va fatta a mano caso per caso.

La separazione dei due assi elimina il problema alla radice. La tassonomia
resta stabile perché descrive il mondo; lo scopo cambia perché è configurato,
non codificato. Cambiare strategia diventa un'operazione sui dati — rinominare
un gruppo, spostarne gli elementi — che non tocca né lo schema né la logica di
calcolo. Le due dimensioni alimentano anche report diversi e non confondibili:
la composizione per tassonomia risponde a "in che cosa sono esposto", la
ripartizione per scopo risponde a "per che cosa lo sto tenendo".

## La classificazione derivata e l'invariante di completezza

C'è una terza informazione che spesso si vuole mostrare, e che non è né la
tassonomia né lo scopo: una sintesi di alto livello, come "quanto è
immediatamente disponibile" contro "quanto è investito". Questa sintesi **si
deriva** dallo scopo, non si memorizza: se fosse una colonna propria sarebbe
una copia da tenere allineata allo scopo, con l'usuale anomalia di
aggiornamento quando lo scopo cambia. Derivandola, spostare un elemento da uno
scopo all'altro lo riclassifica ovunque, senza migrazioni di dati.

La derivazione però introduce un invariante da rispettare: **se un attributo
derivato alimenta un totale in evidenza, l'attributo da cui deriva non può
essere facoltativo**. Un elemento senza scopo non finisce in nessuna delle
categorie derivate, e il numero in alto diventa silenziosamente incompleto:
nessun errore, nessun avviso, solo soldi che non compaiono. È l'esempio più
chiaro del principio generale: una regola imposta dallo schema è più forte di
una imposta dal codice. Se lo scopo è obbligatorio con un default sensato,
l'elemento "senza classificazione" è irrappresentabile per costruzione; se è
facoltativo, nessun controllo a valle potrà garantire che il totale sia
completo.

Il default, in questo schema, non è una forzatura: è ciò che rende
l'obbligatorietà sostenibile. Chi crea un elemento non deve scegliere per
forza, ma il sistema non lascia mai un elemento fuori da ogni categoria.

## Il confine tra Python e SQL di un attributo derivato

Vale la pena un avvertimento pratico, perché è una trappola classica quando la
derivazione si implementa con gli strumenti dell'ORM. Una proprietà calcolata
in Python — `@property` — esiste solo nel mondo degli oggetti Python. Funziona
perfettamente quando hai già l'oggetto in memoria e leggi l'attributo; non
esiste invece per il database. Una query che vuole filtrare o raggruppare *per
quell'attributo* non può usare la proprietà: deve ricostruire la stessa logica
in SQL, tipicamente con una join alla tabella da cui il valore deriva. Se la
join non è esplicita, l'alternativa è un `hybrid_property`, che sa esprimersi
sia in Python sia in SQL — ma è uno strumento più complesso, da introdurre solo
quando serve davvero.

La conseguenza pratica è che "derivare" ha due implementazioni legittime e
diverse: la proprietà Python per chi legge un singolo oggetto, la join per chi
aggrega. Non sono in contraddizione: sono lo stesso valore ottenuto in due
contesti. L'importante è saperlo, perché una proprietà Python che sembra
gratis in lettura nasconde una query per riga quando viene toccata dentro un
ciclo su una lista (il problema N+1), e una logica di derivazione duplicata in
SQL è un posto in più da mantenere allineato se la regola cambia.

## L'ordine: quando i valori hanno una scala

C'è una differenza utile da sfruttare nella presentazione. La tassonomia è un
insieme non ordinato: non ha senso dire che un ETF azionario viene "prima" di
un'obbligazione. Lo scopo, invece, spesso ha un ordine naturale — dal più
disponibile al più vincolato — e quell'ordine è informativo: una barra che
mostra in sequenza "disponibile", "riserva", "investito" comunica una scala di
rischio senza bisogno di spiegazioni. Se i valori dello scopo hanno un ordine,
conviene portarlo nei dati (un campo di ordinamento) e usarlo
nell'interfaccia, invece di ricalcolarlo o di lasciarlo implicito nel codice
di presentazione.

## Le insidie più comuni

- **Codificare la strategia dello schema.** Un enum che elenca i passi di un
  piano ("pilastro 1..4") lega i dati a quel piano. Quando il piano cambia,
  cambiare i dati è una migrazione semantica: la più costosa e la più
  rischiosa.
- **Usare testo libero come tassonomia.** Le stringhe non si aggregano in modo
  affidabile: varianti e refusi frammentano i gruppi. Se serve un
  raggruppamento, serve un vocabolario controllato.
- **Lasciare facoltativa la classificazione da cui dipende un totale.** Un
  elemento non classificato non compare in nessuna categoria derivata e il
  totale è sbagliato in silenzio. L'obbligatorietà (con un default) è ciò che
  rende il totale affidabile.
- **Derivare dall'asse sbagliato.** Dedurre il ruolo dalla natura dello
  strumento è usare una correlazione come se fosse un'identità: lo stesso
  strumento ha ruoli diversi per persone diverse. Il ruolo lo decide lo scopo,
  non la tassonomia.
- **Duplicare il valore derivato per comodità.** Memorizzare la sintesi
  ("disponibile", "investito") accanto allo scopo ricrea la copia da
  sincronizzare. La sintesi si calcola, non si salva.
- **Dimenticare il confine Python/SQL.** Una proprietà Python non è
  interrogabile in SQL: chi aggrega deve fare la join, e chi legge liste deve
  caricare la relazione in anticipo per non pagare una query per riga.

## In sintesi

Classificare bene significa fare due domande separate: *che cosa è* questa
cosa, e *a che cosa serve*. La prima è un fatto del dominio e vive in un
vocabolario controllato; la seconda è una politica dell'utente e vive nei
dati, configurabile. Le sintesi di alto livello si derivano dallo scopo, e
l'asse da cui derivano è obbligatorio perché il totale non abbia buchi. Il
risultato è uno schema che non ha bisogno di migrare quando cambia l'idea di
chi lo usa: cambiano le righe, non le strutture.
