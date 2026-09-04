# Il package come facciata: organizzare i moduli Python

Quando un programma cresce, i file non restano tutti nella stessa cartella:
si raggruppano in **package**. Un package Python è una cartella con un file
speciale `__init__.py` dentro, e proprio quel file decide come gli altri
moduli vedono il package dall'esterno. La domanda di questo capitolo è: come
si organizza bene un package perché i consumatori importino una API chiara e
stabile, senza conoscere i dettagli interni? La risposta è il **pattern
facade**: l'`__init__.py` come porta d'ingresso unica.

---

## Il package: una cartella che diventa un oggetto importabile

Un **modulo** è un file `.py`. Un **package** è una cartella di moduli che ha
un `__init__.py`, e quella cartella diventa essa stessa importabile. Il
`__init__.py` può essere vuoto — in quel caso `import pkg` funziona ma non
espone niente di comodo — oppure può contenere codice che *decide cosa rendere
pubblico*.

Quando il progetto è grande, la struttura interna di un package può cambiare
spesso: un file si divide in due, un modulo si sposta, un'entità cambia casa.
Se chi usa il package importa da ogni singola posizione interna
(`from pkg.sub.modulo import Cosa`), ogni ristrutturazione diventa una rottura
per tutti i consumatori. Il pattern facade risolve esattamente questo: gli
interni possono cambiare, purché la porta d'ingresso resti la stessa.

## La facciata: un `__init__.py` che ri-esporta la API

L'idea è semplice: il `__init__.py` del package **importa** i simboli pubblici
dai suoi moduli interni e li mette a disposizione a livello del package. Chi
usa il codice importa dal package, mai dai percorsi profondi.

```python
# pkg/__init__.py — la facciata
from pkg.shapes.circle import Circle
from pkg.shapes.square import Square
from pkg.shapes.types import ShapeKind

__all__ = ["Circle", "Square", "ShapeKind"]
```

E i consumatori scrivono:

```python
from pkg import Circle, ShapeKind   # la porta d'ingresso
```

non:

```python
from pkg.shapes.circle import Circle   # percorso interno: fragile
```

Il vantaggio si vede quando gli interni cambiano. Se `Circle` si sposta da
`pkg/shapes/circle.py` a `pkg/shapes/forms.py`, si aggiorna *solo* la facciata:
i consumatori continuano a scrivere `from pkg import Circle` e non se ne
accorgono. È lo stesso principio della facciata in architettura: un'unica
interfaccia semplice che nasconde la complessità e la variabilità dietro di sé.

## `__all__`: dichiarare esplicitamente la API pubblica

`__all__` è una lista di stringhe, dichiarata a livello di modulo, che elenca i
nomi *pubblici* di quel modulo. Ha due effetti pratici:

1. **Controlla `from package import *`**: con `__all__` dichiarato, l'asterisco
   importa solo i nomi elencati; senza, importa tutto ciò che non inizia con
   un underscore. In un package facade, l'asterisco importa la API pubblica e
   basta.
2. **Documenta l'intento**: chi legge l'`__init__.py` vede subito quali nomi
   sono considerati parte della API stabile e quali sono dettagli interni.

È importante un dettaglio: `__all__` **serve davvero solo nella facciata del
package** (o in moduli pensati per l'import con asterisco). Nei moduli
interni normali è cerimonia inutile: nessuno li importa con `*`, e una lista
di nomi pubblici su un file interno che nessuno importa direttamente non
aggiunge valore, solo manutenzione.

## Import assoluti o relativi: la regola pratica

Dentro un package ci sono due modi per importare un altro modulo dello stesso
package:

- **Relativo**: `from .types import ShapeKind` — il punto indica "parti dalla
  posizione corrente".
- **Assoluto**: `from pkg.types import ShapeKind` — si scrive il percorso
  completo a partire dalla radice del progetto.

Gli import **assoluti** sono la scelta consigliata (e quella preferita da
PEP 8 e dai type checker come mypy): il percorso completo rende esplicito da
dove arriva ogni simbolo, resta robusto quando un package viene annidato in un
altro, e non crea ambiguità quando due package hanno moduli con lo stesso
nome. Gli import relativi si leggono bene nei punti giusti, ma una volta che
il package cresce di livello, i `..` multipli (`from ...parent import X`)
diventano fragili e difficili da seguire.

## L'import circolare: il motivo per cui la facciata non è ricorsiva

L'errore più comune nell'organizzare i package è l'**import circolare**: il
modulo A importa dal modulo B, che a sua volta importa da A. Python non lo
vieta a priori, ma al momento dell'import uno dei due è ancora a metà
inizializzazione e il simbolo cercato non esiste ancora — l'errore tipico è
`ImportError: cannot import name 'X'`.

Il pattern facade aiuta anche qui, con una regola chiara: **solo
l'`__init__.py` importa i moduli interni**. I moduli interni importano tra
loro per percorso di modulo, ma **mai** dal package root
(`from pkg import ...`). Il motivo: se un modulo interno importa dal package
root, sta ripercorrendo la facciata, che a sua volta importa i moduli interni
— e si crea subito il cerchio. Tenendo le importazioni in una sola direzione
(facciata → interni, interni → interni per percorso), i cerchi non hanno modo
di formarsi.

## Trade-off e alternative

- **Facciata vs import dai percorsi interni**: la facciata aggiunge un livello
  di indirezione (un `__init__.py` da mantenere) ma rende stabile la API e
  libera di riorganizzare gli interni. Senza facciata il codice è più diretto
  da scrivere, ma ogni refactor interno rompe i consumatori. Per un package
  che altri moduli usano, la facciata paga subito; per un singolo script che
  importa un paio di moduli, è sproporzionata.
- **`__all__` ovunque vs solo nella facciata**: dichiararlo ovunque sembra
  coerente, ma è rumore; il suo scopo è definire una API pubblica, e quella
  esiste solo ai confini del package. Nei moduli interni si usa il
  convenzionale underscore per marcare i privati (`_helper`), non `__all__`.
- **Import relativi vs assoluti**: i relativi sono concisi e locali; gli
  assoluti sono espliciti e robusti. La scelta standard in progetti che
  vogliono chiarezza e type-checking è quella assoluta.

## Insidie

- **Import circolare silenzioso** — non sempre esplode subito: se il cerchio
  passa per un percorso che non viene esercitato all'avvio, il programma parte
  e crasha solo quando quel percorso viene toccato. La regola "i moduli interni
  non importano mai dal package root" previene il caso più comune.
- **`__all__` dimenticato** — `from pkg import *` espone anche i nomi importati
  internamente alla facciata (per esempio il modulo stesso o simboli di
  supporto), sporcando la API. Dichiarare `__all__` tiene l'asterisco pulito.
- **Percorsi interni duri da eliminare** — una volta che i consumatori
  importano da `pkg.sub.modulo`, toglierli è un refactor invasivo. Meglio
  vietarli dal principio e importare solo dalla facciata.
- **Facade che fa troppo** — l'`__init__.py` deve solo *ri-esportare*, non
  contenere logica o istanziare oggetti al momento dell'import. Un package che
  esegue lavoro all'import è lento da caricare e fragile da testare.