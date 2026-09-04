# ruff e mypy — qualità del codice prima che giri

## Due check diversi, entrambi statici

Quando scrivi codice, ci sono due famiglie di problemi che puoi scovare *senza eseguire nulla*: i problemi di **stile** (spaziature, lunghezza delle righe, ordine degli import) e i problemi **semantici** (usi un nome non definito, importi qualcosa che non usi, prometti un `int` e restituisci `None`). Gli strumenti che li trovano si chiamano **analizzatori statici**: leggono il sorgente e lo confrontano con delle regole, senza mai lanciare il programma.

Il motivo per cui esistono è il costo delle alternative. Lo stile discusso a mano in code review è rumore: una macchina può imporre uno stile uniforme e togliere la discussione. I bug semantici, se non li trovi in fase di scrittura, li trovi in produzione — nel momento peggiore. Gli analizzatori statici spostano entrambe le classi di problemi da "scoperti dopo" a "scoperti prima".

## ruff: linter e formatter in uno

`ruff` è un linter estremamente veloce (scritto in Rust) che include anche un formatter. Assorbe quello che prima richiedeva tre strumenti separati — `black` per la formattazione, `isort` per l'ordinamento degli import, `flake8` con decine di plugin per le regole di lint — sotto un'unica configurazione in `pyproject.toml`.

La cosa più importante da capire è che **linting e formattazione sono due lavori diversi**, con due comandi diversi:

- `ruff check` — il **linter**: trova *problemi* (nomi non definiti, import inutilizzati, pattern che sanno di bug). Alcuni li corregge da solo con `--fix`.
- `ruff format` — il **formatter**: riscrive lo *stile* (spazi, a capo) senza cambiare il significato del codice.

È un errore comune lanciare uno aspettandosi il comportamento dell'altro: `ruff format` non ti dice se c'è un import inutilizzato, e `ruff check` non ti riallinea il codice.

**Configurazione minima.** Due impostazioni contano più delle altre. `line-length` deve combaciare con la convenzione del progetto (se il progetto usa 100, va messo 100, altrimenti il formatter e il linter litigano sulle righe lunghe). E le **regole di lint vanno scelte esplicitamente** — i default coprono l'essenziale, ma un progetto serio di solito allarga la rete. Le regole comunemente utili: **E** (errori di stile pycodestyle), **F** (pyflakes: bug veri come import inutilizzati), **I** (ordinamento degli import, la regola che assorbe isort), **UP** (aggiornamento a idiomi Python moderni), **B** (bugbear: pattern che profumano di bug).

## mypy: il type checker

`mypy` è il type checker statico di fatto standard per Python. Analizza il codice senza eseguirlo e verifica che le annotazioni di tipo che hai scritto siano *coerenti*: che non passi una stringa dove la funzione aspetta un intero, che ogni percorso di codice restituisca il tipo dichiarato, che non chiami un metodo su un valore che non lo ha.

La sua importanza cresce con la vita del codice. La dinamicità di Python è fantastica per prototipare e pessima per una base di codice di lungo corso: un refactoring che cambia il tipo di un parametro è un bug che esplode al runtime — spesso in produzione — invece che al commit. `mypy` sposta questa intera classe di errori a prima, e come bonus dà all'IDE (tramite le informazioni di tipo) autocompletamento e navigazione accurate.

**Come trarne valore reale.** Il trucco è la **modalità strict** (`strict = true` nella configurazione). Strict accende i controlli che contano: vietare l'`Any` implicito, richiedere annotazioni sulle funzioni, controllare le chiamate a codice non annotato. Senza strict, mypy salta silenziosamente il codice non annotato e ti dà una falsa sicurezza. Su un progetto nuovo non c'è codice legacy non tipizzato: l'intera base può essere strict dal primo commit — una situazione rara e preziosa, da non sprecare.

## Trade-off e alternative

- **ruff vs black+flake8+isort**: molti meno pezzi in movimento e molto più veloce. La formattazione è quasi identica a quella di black (poche divergenze deliberate).
- **ruff vs pylint**: pylint è più lento e più opinionato, con regole che la comunità spesso trova rumorose; ruff seleziona di default le regole ad alto segnale e ti lascia aggiungere le altre via configurazione.
- **mypy vs pyright**: pyright (Microsoft) e il suo fork basedpyright sono più veloci e in alcuni casi più precisi — è il motore che usa l'estensione Python di VS Code. Il costo: è uno strumento basato su Node (richiede un runtime separato) ed è meno radicato come gate da CLI/CI. `mypy` è la scelta conservativa e standard dell'ecosistema, e si configura pulito da `pyproject.toml`.

## Insidie

- **Lint e format confusi.** Lanciare `ruff check` aspettandosi che sistemi la formattazione, o `ruff format` aspettandosi che trovi i bug: sono due comandi, due lavori.
- **`line-length` non allineato.** Se il progetto usa una lunghezza di riga e la config ne dichiara un'altra, formatter e linter si contraddicono e i check falliscono a raffica.
- **mypy senza `strict = true`.** È il modo più sicuro di avere una falsa sicurezza: il type checker sembra passare, ma sta semplicemente ignorando il codice non annotato.
- **`Any` come scappatoia.** Scrivere `Any` "tanto per non pensarci" disabilita silenziosamente tutti i controlli su tutto ciò che tocca. Se è davvero inevitabile, va usato con una spiegazione del perché — e non è mai la risposta al "non so che tipo è questo".
- **`# type: ignore` per zittire.** Usato per far tacere il type checker invece di capire il problema, trasforma mypy in uno strumento che non controlla più niente di affidabile.
- **Impegni di codice che fallisce `ruff format`.** Il formatter va eseguito (o verificato con `--check`) come parte del flusso di commit, idealmente in automatico — altrimenti lo stile deriva.

In sintesi: il trio "lint + format + type check" è la rete di sicurezza statica del progetto — il lint trova i pattern sbagliati, il format impone lo stile, il type check garantisce le promesse delle annotazioni. Ognuno fa un lavoro diverso, e tenerli tutti e tre verdi è il prezzo d'ingresso per ogni commit.