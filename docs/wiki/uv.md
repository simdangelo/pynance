# uv — il gestore di progetto

## Un solo comando al posto di quattro

Per molto tempo, gestire le dipendenze di un progetto Python significava coordinare quattro strumenti separati: `pip` per installare i pacchetti, `virtualenv` per creare l'ambiente isolato, `pip-tools` per generare il file di blocco delle versioni e — se volevi un'esperienza più integrata — `poetry` come alternativa a tutto. Ognuno aveva la sua CLI, il suo momento in cui andava usato, e la sua idea di dove mettere le cose.

Prima di andare avanti, vale la pena fermarsi sul concetto di **ambiente virtuale**, perché è il cuore di tutto. Un progetto Python non vive in isolamento: se installi un pacchetto "nel sistema", va a finire nella stessa cartella di tutti gli altri progetti della macchina, e due progetti che vogliono versioni diverse dello stesso pacchetto entrano in conflitto. Un ambiente virtuale è una cartella (per convenzione `.venv`) che contiene una **copia isolata** dell'interprete Python e delle dipendenze del progetto: quello che installi dentro l'ambiente non tocca il resto della macchina. È il modo standard per dire "questo progetto usa esattamente queste versioni, e qui dentro".

`uv` è un singolo binario scritto in Rust che sostituisce tutti e quattro. Dato un `pyproject.toml` (vedi la wiki su `pyproject.toml`) e un file di blocco, ricrea l'ambiente esatto del progetto su qualsiasi macchina — la tua, quella di un collega, o un server CI. È anche molto veloce: l'essere compilato in Rust lo rende di gran lunga più rapido di `pip` e `poetry`.

I comandi con cui convivi ogni giorno:

- `uv init` — crea un nuovo progetto: scrive un `pyproject.toml` iniziale e un file di blocco.
- `uv add <pacchetto>` — aggiunge una dipendenza a `[project.dependencies]` e la installa.
- `uv sync` — crea o aggiorna l'ambiente virtuale (`.venv`) perché combaci esattamente col file di blocco.
- `uv run <comando>` — esegue un comando *dentro* l'ambiente virtuale del progetto.
- `uv python install <versione>` — scarica e gestisce gli interpreti Python (pratico quando il progetto richiede una versione specifica che non hai).

## Il file di blocco: il contratto di riproducibilità

Il cuore di `uv` è il concetto di **riproducibilità**. `pyproject.toml` dice *quali* dipendenze vuoi, con vincoli permissivi (intervalli tipo `>=1.0`). Ma "una versione qualsiasi che soddisfi `>=1.0`" non è un ambiente: è una lotteria. Il file di blocco (per `uv`, `uv.lock`) blocca la risoluzione esatta — ogni dipendenza diretta e transitiva, con la sua versione precisa e gli hash dei file scaricati.

Il file di blocco si committa nel repository. È il contratto che dice "su qualsiasi macchina, con questo lockfile, `uv sync` produce lo stesso identico ambiente". Senza di esso ritorna il classico "sulla mia macchina funziona": la tua macchina ha una versione, quella di un altro ne ha un'altra, e i bug diventano non riproducibili.

## Dipendenze di sviluppo: quello che non deve mai arrivare in produzione

Un progetto ha bisogno, per essere sviluppato, di strumenti che in produzione non servono a niente: il test runner, il linter, il type checker. Se finissero tra le dipendenze normali, verrebbero installati anche in produzione — più superficie d'attacco, più cose da aggiornare, più peso.

`uv` separa i due mondi:

- `uv add --dev <pacchetto>` — aggiunge il pacchetto al gruppo di sviluppo (la tabella `[dependency-groups]` con chiave `dev`, standard PEP 735). In precedenza si usava `[project.optional-dependencies]` con una chiave `dev`; entrambi funzionano, ma la tabella dedicata è la convenzione moderna.
- `uv sync` — installa *tutto* (runtime + sviluppo). È il comando che lanci mentre sviluppi.
- `uv sync --no-dev` — installa **solo** le dipendenze runtime. È quello che eseguirebbe una build di produzione o un'immagine container.

La differenza è esattamente il motivo per cui la distinzione esiste: l'ambiente che *esegue* l'applicazione non deve contenere gli strumenti che servono a *scriverla*. È anche il prerequisito per una build Docker multi-stage sensata, dove l'immagine finale contiene solo ciò che serve a far girare il programma.

## Progetto vs pacchetto: due cose diverse

C'è una distinzione concettuale che genera confusione. Il **progetto** (o "uv project") è la cartella che contiene `pyproject.toml`, `uv.lock` e `.venv`: è il *contenitore* che definisce come si costruisce l'ambiente. Il **pacchetto** è la cartella di codice importabile (`import mionome...`): è *cosa* è il codice. `uv init` crea il progetto, non il pacchetto — il nome passato a `uv init --name ...` scrive solo il campo `name` nel manifest; la cartella del codice la crei tu.

Perché il nome deve combaciare con la cartella? Perché tool come il type checker e il test runner risolvono il pacchetto dal nome dichiarato nel manifest. Se il manifest dice `name = "mionome"`, si importa `mionome.modulo`, e i tool sanno dove cercare il codice.

Due layout comuni:

- **Layout piatto**: il pacchetto sta accanto al manifest, es. `progetto/mionome/`. Gli import girano come `mionome.api`.
- **Layout `src`**: il pacchetto sta sotto `progetto/src/mionome/`. `uv init --package` genera questo, perché isola il codice dalla configurazione e rende impossibile importarlo per sbaglio senza averlo installato.

Il layout `src` è il default moderno per le librerie distribuite; il layout piatto è comune per le applicazioni, dove la distinzione importa meno. La scelta tra i due è una decisione reale, non un dettaglio.

## Trade-off: uv contro le alternative

- **`uv` vs `poetry`**: entrambi gestiscono ambiente e lockfile. `uv` è drammaticamente più veloce, legge il `pyproject.toml` standard (Poetry storicamente usava una tabella `[tool.poetry]` proprietaria e un proprio formato di lockfile), ed è anche il motore dietro il `pip` di fatto standard (`uv pip install`), quindi degrada con grazia in "un pip veloce".
- **`uv` vs `pip` + `venv` nudi**: pochi pezzi in movimento e un unico modo canonico di lanciare i comandi (`uv run`), ma nasconde i meccanismi dell'ambiente virtuale dietro un livello di astrazione. Se il tuo obiettivo è *capire* i meccanismi, prima o poi vale la pena guardare cosa succede sotto: i concetti (venv, lockfile, pinning) sono gli stessi, e li ritrovi nudi e crudi anche nel mondo dei container.

## Insidie

- **Usare `pip` o `python` nudi.** Una volta che il progetto usa `uv`, raggiungere i comandi nudi installa nell'interprete sbagliato o aggira il lockfile. Tutto passa da `uv run`.
- **Non committare il file di blocco.** Il lockfile è il contratto di riproducibilità; senza, "funziona sulla mia macchina" torna a essere la norma.
- **Dimenticare `uv sync` dopo aver modificato a mano il `pyproject.toml`.** L'ambiente virtuale vive separato dal manifest; se modifichi le dipendenze a mano, devi riconciliare l'ambiente con `uv sync`.

In sintesi: `uv` riduce la gestione di un ambiente Python a un manifest dichiarativo più un lockfile committato, e a pochi comandi che li tengono allineati. Il resto è disciplina — non aggirare il lockfile, non toccare i comandi nudi.