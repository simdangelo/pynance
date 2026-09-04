# `pyproject.toml` — il file unico di configurazione

## Un solo file per tutta la toolchain

Quando avvii un nuovo progetto Python, la prima cosa che noti è il numero di strumenti che pretendono una configurazione: il gestore di pacchetti, il linter, il formatter, il type checker, il test runner. Prima che `pyproject.toml` si affermasse, ognuno di questi leggeva un file diverso — `requirements.txt` per le dipendenze, `setup.py` per i metadati, `.flake8` o `setup.cfg` per il linter e così via — e la configurazione finiva sparsa in mezza dozzina di posti, ognuno con la propria sintassi. `pyproject.toml` è il tentativo riuscito di unificare tutto in un unico file dichiarativo che l'intera toolchain legge.

Il file è definito da una serie di PEP: la **621** definisce i metadati del progetto, la **517** il sistema di build, la **735** i gruppi di dipendenze. Il formato è TOML, lo stesso usato per la configurazione di molti altri strumenti, quindi la sintassi è semplice: tabelle `[nome]` con coppie `chiave = valore`.

## Le quattro cose che stanno dentro

1. **I metadati del progetto** (tabelle `[project]` e `[build-system]`). Nome, versione, descrizione, versione di Python richiesta, licenza. `[build-system]` dichiara il *backend* PEP 517, cioè lo strumento che materialmente costruisce e installa il pacchetto a partire da questa configurazione. Senza di esso il progetto non è installabile, e senza installarlo il resto della toolchain fa fatica a risolverlo.

2. **Le dipendenze runtime** (`[project.dependencies]`). I pacchetti di cui il programma ha bisogno per *funzionare* in produzione.

3. **Le dipendenze di sviluppo** (tabella `[dependency-groups]` con una sezione `dev`, definita dalla PEP 735). Gli strumenti che servono solo a chi sviluppa — il test runner, il linter, il type checker — e che non devono mai arrivare in produzione. Prima della PEP 735 si usava a questo scopo `[project.optional-dependencies]` con una chiave `dev`; il risultato è lo stesso, ma il gruppo dedicato è la convenzione moderna.

4. **La configurazione dei singoli tool** (tabelle `[tool.*]`). Ogni strumento legge la propria sotto-tabella: `[tool.ruff]` per il linter, `[tool.mypy]` per il type checker, `[tool.pytest.ini_options]` per il test runner, `[tool.uv]` per il gestore di pacchetti. È questo che elimina i file sparsi: non serve più un `.flake8` qui e un `setup.cfg` là, tutto sta in un posto solo.

## Perché ha sostituito il vecchio modo

Il vecchio approccio soffriva di dispersione. `requirements.txt` è solo una lista di pin: non ha alcun concetto di metadati, di versioni richieste o di configurazione per tool. `setup.py` è codice, non dati: in un file eseguibile è fin troppo facile scrivere logica intelligente quando basterebbe una dichiarazione. E la configurazione del lint viveva in formati diversi a seconda del linter, rendendo ogni strumento un ecosistema a sé.

L'ecosistema Python è convergente su `pyproject.toml` come standard: i tool nuovi lo leggono per default e i vecchi lo supportano. Combattere questa convergenza significa combattere i default di ogni strumento.

## Le regole pratiche che valgono sempre

- **`name` normalizzato.** Deve essere minuscolo e normalizzato secondo la PEP 503: trattini, non underscore, non camelCase. È il nome con cui il pacchetto viene importato e risolto, quindi deve combaciare con la cartella del codice.
- **`requires-python` come pavimento, mai come pin.** Si scrive `>=3.12` o simile, non `==3.12`. Un pin esatto blocca ogni contributore su un singolo interprete; un pavimento ammette le versioni compatibili più vecchie e quelle più nuove.
- **`version` statica.** Un semplice `0.1.0` scritto a mano, finché non hai un bisogno reale di versionamento dinamico. Non tirare fuori la versione da git o da un file al primo giorno.
- **Dipendenze come intervalli, non pin.** Nel manifest si scrive `>=`, `~=` o `*`; la risoluzione esatta (versione scelta, dipendenze transitive, hash) sta nel file di blocco (per esempio `uv.lock`), che è generato, riproducibile e aggiornato con un comando. Scrivere pin esatti a mano nel manifest duplica il lavoro del lockfile e rende ogni aggiornamento una seccatura.
- **Tutto lo strumento in un posto solo.** Tenere `[tool.*]` nello stesso `pyproject.toml` invece di sparpagliare file `.ini`/`.cfg`.

## Trade-off: quando non va bene

`pyproject.toml` è lo standard, ma ha un limite: mette insieme nel *contenuto* cose con vite diverse. Le dipendenze runtime cambiano spesso, la configurazione del lint quasi mai, e i metadati quasi mai. Git li tratta come un solo file, quindi le modifiche a parti diverse finiscono mescolate nello stesso commit. È un costo accettabile — la leggibilità di un unico posto vince sulla granularità dei commit — ma è bene esserne consapevoli quando fai history spelunking.

Un secondo limite: TOML è un formato dati, non un linguaggio. Non puoi calcolare nulla dentro il file. Se un giorno ti servisse una versione derivata dal contenuto di un repository git, `pyproject.toml` da solo non basta — ma è esattamente il caso in cui vale la pena fermarsi e chiedersi se il bisogno è reale.

## Insidie

- **Due fonti di verità.** Tenere un `requirements.txt` *e* `pyproject.toml` per lo stesso progetto: prima o poi divergono, e nessuno dei due ha ragione in modo affidabile. Si sceglie uno solo, e si cancella l'altro.
- **Niente pavimento su `requires-python`.** Dimenticarsi la versione minima significa che chiunque può creare un ambiente con una versione di Python che il tuo codice non supporta, e gli errori compaiono in momenti inattesi.
- **Pin esatti a mano nel manifest.** Ripetere a mano `==1.2.3` quando esiste un lockfile: ogni upgrade diventa un lavoro manuale e il manifest si gonfia di rumore.
- **`readme` che punta a un file inesistente.** Se il campo `readme` è valorizzato, il file indicato deve esistere, anche se è un segnaposto vuoto. Altrimenti l'installazione fallisce con un errore che non c'entra niente con la causa.

Il punto in sintesi: `pyproject.toml` è dove si dichiara *cosa* è il progetto; il lockfile è dove si fissa *esattamente* l'ambiente; e ogni strumento della toolchain legge dal primo. Una volta interiorizzato questo trio, la maggior parte dei problemi di configurazione di un progetto Python si riduce a sapere in quale di questi tre posti guardare.