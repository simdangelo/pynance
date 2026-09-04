# Password hashing: perché le password non si salvano mai in chiaro

Quando un utente crea un account, il sistema deve ricordare la sua password
per verificare i login successivi. La soluzione ingenua — salvare la password
così com'è in un campo del database — è un disastro di sicurezza: se il
database esce (anche solo una copia di backup finita nelle mani sbagliate),
ogni password è compromessa. E le persone riusano la stessa password su più
siti, quindi una fuga in un posto si propaga all'email, alla banca, ai social.
Il database deve quindi contenere qualcosa che *non* è la password ma che
permette comunque di verificare un login: questo qualcosa è un **hash**.

---

## Cos'è un hash (con un esempio giocattolo)

Un hash è una **funzione**: gli dai un input, ti dà un output. Due proprietà
contano davvero:

1. **Deterministico** — lo stesso input produce sempre lo stesso output.
2. **A senso unico** — dall'output non puoi risalire all'input.

Immagina un hash inventato che si limita a contare le lettere:

```
hash("password") = "8"     (8 lettere)   -- sempre "8"
hash("hello")    = "5"                   -- sempre "5"
hash("pizza")    = "5"                   -- stesso output di "hello"! (collisione)
```

È un hash *brutto* (le collisioni lo rendono inutile), ma mostra l'idea: una
macchina che mappa qualsiasi input in un output di dimensione fissa, in modo
deterministico.

**Il senso unico è il punto cruciale.** Niente nell'output ti dice qual è
l'input. Se il database contiene `"8"`, non puoi sapere se la password era
"password", "computer" o "elephant". L'unico modo per scoprirlo è **provare
input candidati, eseguire la funzione e vedere se un tentativo produce `"8"`**.

## L'attaccante ha già la funzione: il segreto è la velocità

Una funzione di hash (SHA-256, Argon2) è **pubblica**. La sicurezza non viene
dal nasconderla (quello sarebbe "security by obscurity"); dopo una fuga del
database l'attaccante ha la *lista degli hash* — uno per utente — e la funzione
la conosce già. Il suo piano è un attacco **a dizionario / brute-force**:
provare password candidate, calcolare l'hash e vedere se qualcuno corrisponde a
uno di quelli rubati.

E funziona. L'unica domanda è **quanto è veloce** a provare i candidati. Questa
è la proprietà più importante da capire: un hash veloce rende economico il
gioco di prova-e-verifica dell'attaccante; un hash lento lo rende
rovinosamente costoso.

Vediamolo coi numeri. Prendi un attaccante con la **lista del milione di
password più comuni** (un "dizionario"), provate contro ogni hash rubato.

**Scenario A — l'hash è una funzione veloce (tipo SHA-256).** SHA-256 gira a
circa **10 miliardi di hash al secondo** su una singola macchina (e le GPU
vanno molto più veloci). Provare 1 milione di candidati:

```
1.000.000 / 10.000.000.000 = 0,0001 secondi
```

Un decimo di millisecondo per controllare l'intero dizionario. Le password
reali sono quasi tutte in quella lista, quindi gran parte degli account cade in
**pochi minuti**. Le funzioni veloci sono esattamente ciò che l'attaccante
vuole.

**Scenario B — l'hash è volutamente lento (Argon2).** Argon2 è tarato per
impiegare ~0,5 *secondi* per hash. Provare lo stesso milione:

```
1.000.000 × 0,5s = 500.000 secondi ≈ 5,8 giorni
```

E questo è *solo* il dizionario, senza i milioni di tentativi casuali
successivi. "Lento di proposito" significa: **la funzione è resa costosa
apposta**, così che una verifica legittima (una per login) passi inosservata,
ma farla un milione di volte costi una fortuna.

Quindi: **l'attaccante *può* eseguire la funzione su tutte le password — la
difesa è rendere troppo costoso farlo.** La velocità è la sicurezza, non la
segretezza. La frazione di secondo che spendi per loggarti non è nulla; le
centinaia di migliaia di secondi che spende l'attaccante sono tutto.

## Il salt: perché due password uguali non devono dare due hash uguali

Ecco un problema sottile: se due utenti hanno la stessa password e la hashi
nello stesso modo, ottengono **lo stesso hash**. Questo permette a un
attaccante di:

1. **Scoprire gli utenti con password identiche** — un segnale d'allarme che
   hanno riusato la stessa password.
2. Usare una **tabella precalcolata** (le "rainbow table", o "hash di tutte le
   password comuni") e fare un semplice *lookup* — niente brute-force per le
   password più diffuse.

Il punto 2 merita di essere reso concreto. Senza salt, un attaccante può
precalcolare, *in anticipo e offline*, gli hash di ogni password comune:

```
tabella precalcolata (costruita una volta sola, offline):
  hash("password")   = "a1ba..."
  hash("123456")     = "0de9..."
  hash("qwerty")     = "30f2..."
  ... (un milione di voci)
```

Poi, quando il database fugge, non calcola nulla — fa solo un **lookup** di
ogni hash rubato nella tabella:

```
riga rubata:  "a1ba..."    → la tabella dice "a1ba..." = "password"   → FATTO, all'istante
```

Una tabella serve *ogni* utente e *ogni* sito che ha usato la stessa password.
Ecco perché `lento` da solo non basta: la velocità non conta se l'attaccante ha
fatto il lavoro una volta sola, in anticipo.

**Il salt spezza tutto questo.** Un salt è un valore casuale mescolato
nell'hash, unico per ogni password:

```
utente A:  password="password",  salt="s_7K2q"  →  hash("s_7K2q" + "password") = "9f14..."
utente B:  password="password",  salt="m_9wX1"  →  hash("m_9wX1" + "password") = "c3a0..."
```

Due conseguenze:

1. **Stessa password → hash diversi.** Il duplicato sparisce; due utenti che
   condividono una password non possono più essere individuati.
2. **La tabella precalcolata ora è inutile.** L'attaccante avrebbe dovuto
   precalcolare `hash(salt + password)` per *ogni possibile salt*, il che è
   impossibile (i salt sono astronomicamente tanti). Così è costretto a fare
   brute-force *per utente* — ed è qui che `lento` torna a mordere.

### Ma il salt non è visibile anche all'attaccante?

Sì. **Il salt non è un segreto, e non deve esserlo.** Chi fugge il database
legge il salt dalla stringa dell'hash esattamente come te. Ma non gli serve a
nulla, per quello che il salt fa davvero.

Il salt non è una "chiave nascosta" che protegge la password. Il suo unico
compito è rendere ogni hash unico e rendere inutili le tabelle precalcolate.
Ripercorriamolo:

```
la tabella precalcolata dell'attaccante contiene:  hash("password") = "a1ba..."
la riga rubata ha:  salt="s_7K2q",  risultato = "9f14..."   (= hash("s_7K2q"+"password"))
```

L'attaccante conosce `salt="s_7K2q"`. Ma la sua tabella contiene
`hash("password")`, **non** `hash("s_7K2q"+"password")`. Quindi la tabella non
combacia. Per attaccare quell'utente specifico dovrebbe fare brute-force su
`password` senza poter riusare lavoro precalcolato — cioè esattamente il
percorso lento e costoso.

Il valore del salt **non è la segretezza: è l'unicità per utente.** Costringe
l'attaccante a rifare il lavoro per *ogni singolo* utente (niente lavoro
precalcolato condiviso), e poi `lento` rende quel lavoro per-utente
rovinosamente caro. Salt e lentezza sono una coppia: il salt toglie la
scorciatoia, la lentezza rende proibitivo il percorso che resta.

### Il riepilogo della coppia password/salt

- La **password** è il segreto nascosto che l'attaccante deve indovinare.
- Il **salt** è pubblico. Non nasconde nulla; impedisce solo all'attaccante di
  riusare lavoro precalcolato.

Una fuga rivela quindi salt e hash — ma *non* la password, e non dà scorciatoie
per trovarla. L'attaccante resta con la brute-force, un hash lento alla volta,
per utente. Una password forte (uno spazio di ricerca grande) rende impossibile
anche quello.

## Dove vive il salt (la parte elegante)

Domanda naturale: **se il salt è casuale, come fa il sistema a ricordare quale
salt ha usato quando, al login, deve ricalcolare l'hash?**

Risposta: **il salt vive dentro la stringa dell'hash stesso.** Non sta in una
colonna separata. Le librerie di hashing (Argon2, bcrypt) impacchettano tutto
ciò che serve alla verifica — l'algoritmo, i parametri di costo, il salt e il
digest — in un'unica stringa autodescrittiva.

Un hash Argon2 reale ha questa forma:

```
$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$+2rT0a...
└─┬───┘  └─┬┘ └──┬──┘ └──┬──┘  └───┬──┘  └──┬──┘
algoritmo  versione costi  costi    salt    digest
(Argon2id)          (mem., tempo, parallelismo)  (base64)
```

- `$argon2id$` — l'algoritmo.
- `v=19` — la versione.
- `m=65536,t=3,p=4` — i **parametri di costo** (memoria, tempo, parallelismo).
  Sono le manopole della "lentezza voluta".
- `c29tZXNhbHQ` — il **salt arbitrario**, codificato in base64 (in questo
  esempio decodifica nella stringa ASCII `"somesalt"`).
- `+2rT0a...` — il **digest** vero e proprio (l'output dell'hash).

Poiché il salt è incorporato nella stringa, **la verifica non ha bisogno di
nient'altro**. Al login il sistema:

1. Legge la stringa salvata e ne **estrae salt e parametri di costo**.
2. Ricalcola l'hash usando *esattamente quel* salt e *quei* parametri.
3. Confronta il risultato col digest contenuto nella stringa.

Il salt "si ricorda da solo": viaggia insieme all'hash che ha contribuito a
produrre. Ecco cosa significa "autodescrittivo": la stringa contiene tutto
quello che serve a verificare una password, senza contabilità separata. Per
questo la libreria può prendere la stringa salvata e la password in chiaro e
dire sì/no — l'estrazione e il ricalcolo li fa lei.

## Usa una libreria, e non reimplementare mai queste parti

In Python la scelta moderna è `pwdlib` (o `argon2-cffi`/`bcrypt` direttamente).
Il pattern è sempre lo stesso:

```python
from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()   # Argon2 con default sensati

hashed = password_hash.hash("la mia password")   # registrazione: salva `hashed`
ok = password_hash.verify("la mia password", hashed)   # login: True/False
```

La libreria gestisce le parti critiche, che **non** vanno reimplementate a
mano:

- Genera un **salt unico** per ogni hash.
- Salva **salt + algoritmo + parametri di costo** nella stringa
  (autodescrittiva).
- Usa un **confronto a tempo costante** — confronta i byte dell'hash in tempo
  costante, così l'attaccante non può misurare *quanto* sbagliata fosse la
  password osservando i tempi di risposta. (Confrontare con `==` fa trapelare
  un canale laterale temporale.)

### Regole da tenere sempre presenti

- **Registrazione:** hasha la password, salva solo l'hash.
- **Login:** prendi la password in arrivo e verificala contro l'hash salvato.
- **Non loggare, stampare o salvare la password in chiaro** — mai, nemmeno
  temporaneamente in una riga di log o in un messaggio d'eccezione.
- **Non abbassare mai il costo** per renderlo "più veloce": reintrodurresti il
  problema della brute-force.
- **Mai pensare "hasho con SHA-256"** — quello serve all'integrità dei dati,
  non alle password. L'hashing delle password è una categoria diversa di
  algoritmo, costruita apposta per essere lenta e salata.