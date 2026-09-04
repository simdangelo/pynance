# pre-commit — i controlli di qualità prima del commit

## Il problema: gli strumenti funzionano solo se li lanci

Linter, formatter e type checker proteggono il codice solo se qualcuno li esegue davvero. Il problema non è che gli sviluppatori siano pigri: è che la memoria umana non è affidabile per i passi ripetitivi. "Ricordati di lanciare `mypy` prima di ogni commit" funziona per i primi tre commit e poi diventa un ricordo. La soluzione è togliere la decisione dalle mani dello sviluppatore: far girare i controlli **automaticamente**, al momento giusto, e bloccare l'azione se falliscono.

**Git** offre il meccanismo: gli **hook**. Sono script che Git esegue automaticamente a determinati momenti della sua vita (prima di un commit, prima di un push, dopo un merge). L'hook `pre-commit` gira *prima* che il commit venga creato, e se termina con un codice di errore, il commit non avviene. È il posto naturale per i controlli di qualità: il punto esatto in cui il lavoro sta per diventare storia.

## Cosa fa pre-commit

`pre-commit` è un framework che rende gestibile la configurazione degli hook. Da solo, ogni hook è uno script da scrivere e installare a mano in `.git/hooks`; `pre-commit` centralizza tutto in un file di configurazione, in genere `.pre-commit-config.yaml` alla radice del repository, che elenca:

- quali **repository di hook** usare (per esempio quello di `ruff` o di `black`);
- a quale **revisione** agganciarsi (i tool cambiano nel tempo; si fissa una versione, come per una dipendenza);
- quali **hook** di quel repo attivare, e con quali argomenti.

Quando installi gli hook (`pre-commit install`), il framework scrive i suoi script dentro `.git/hooks` e da quel momento ogni commit passa prima dai controlli configurati. Un dettaglio importante: pre-commit gestisce un **ambiente isolato per ogni hook** — scarica e installa il tool da solo, senza toccare il tuo ambiente Python. La configurazione di una macchina nuova si riduce a installare pre-commit e lanciare `pre-commit install`.

I comandi che contano:

- `pre-commit install` — registra gli hook nel repository. Senza questo, il file di configurazione è carta morta.
- `pre-commit run --all-files` — esegue tutti gli hook su tutti i file del repository. Da lanciare subito dopo la configurazione, per vedere che tutto passi prima che il primo commit arrivi.
- `pre-commit run` — esegue gli hook solo sui file in stage (è quello che succede di default a ogni commit).
- `pre-commit autoupdate` — aggiorna le revisioni degli hook alle versioni più recenti.

## I due tipi di hook: mirror e local

Non tutti i tool vanno bene nello stesso modo dentro pre-commit. Ci sono due casi, con due filosofie:

1. **Mirror hooks** (la maggioranza). pre-commit installa il tool nel proprio ambiente isolato. È perfetto quando il tool non ha dipendenze dal tuo progetto: un linter come `ruff` analizza la sintassi e non importa mai i tuoi pacchetti di terze parti, quindi può girare in isolamento. Configurarlo è una riga: il repo, la revisione, l'id dell'hook.

2. **Hook locali** (`language: system`). Qui pre-commit non installa nulla: esegue un comando nel tuo ambiente reale. Serve quando il tool **deve** vedere le dipendenze del progetto. Un type checker come `mypy` deve importare i tuoi pacchetti (altrimenti non riesce a controllarli), quindi va eseguito dentro l'ambiente del progetto — tipicamente tramite il gestore di pacchetti (per esempio `uv run mypy`).

Il caso di `mypy` illustra bene il confine. Esiste un mirror hook per mypy, ma per farlo funzionare dovresti elencare *tutte* le dipendenze del progetto in `additional_dependencies` — e aggiornare quell'elenco ogni volta che aggiungi un pacchetto. Fragile. L'hook locale che lancia `uv run mypy` dentro l'ambiente reale risolve il problema per sempre: qualunque dipendenza abbia il progetto, mypy la vede.

## Trade-off: pre-commit vs CI

pre-commit è un controllo **locale**: gira sulla macchina di chi committa. È il circuito di feedback più stretto che esista — fallisce in un secondo, nel momento in cui lo sviluppatore sta per fare il commit, quando il contesto del lavoro è ancora fresco. Ma ha un limite intrinseco: si fida della macchina di chi committa. Chi può disattivare gli hook (o non installarli) lo fa, e niente lo ferma.

La **CI** (continuous integration) è il controllo **autorevole**: gira su un server, su ogni push, ed è l'unica che decide veramente se un commit è accettabile. La risposta giusta non è scegliere: è **avere entrambi**. pre-commit per il loop veloce e locale; la CI come fonte di verità che nessuno può aggirare. In un progetto piccolo si parte da pre-commit da solo, ma il gap (nessun gate autorevole) va riconosciuto come un debito da saldare quando arriva la CI.

## Insidie

- **Configurare gli hook ma dimenticare `pre-commit install`.** Il file di configurazione è inerte finché gli hook non sono registrati nel repository. Un commit che "dovrebbe" essere bloccato passa senza che nulla giri.
- **Aggiungere un hook che modifica i file senza averlo mai eseguito.** Un hook con `--fix` riscrive i file al volo. Se non l'hai mai eseguito su tutto il repository, il primo commit che fai ti riscrive mezzo progetto sotto i piedi. La regola: configurare, poi `pre-commit run --all-files` subito, poi committare.
- **Hook lenti che rallentano ogni commit.** Un hook che impiega minuti rende ogni commit un supplizio, e la tentazione di disattivare tutto sale. Meglio pochi hook veloci che molti lenti.
- **Confondere il tipo di hook.** Usare un mirror per un tool che deve vedere le dipendenze del progetto (il caso `mypy`), o un hook locale per un tool che potrebbe girare isolato — il primo si rompe appena le dipendenze cambiano, il secondo è cerimonia inutile.
- **Revisioni non fissate.** Un hook senza revisione bloccata cambia comportamento nel tempo; gli hook si configurano come le dipendenze, con una versione esplicita, e si aggiornano con `autoupdate` in modo deliberato.

In sintesi: pre-commit trasforma i controlli di qualità da "ricordo dello sviluppatore" a "condizione automatica del commit". Configurato bene — pochi hook veloci, il tipo giusto per ogni tool, installato davvero — è la rete di sicurezza locale che rende i commit puliti per default.