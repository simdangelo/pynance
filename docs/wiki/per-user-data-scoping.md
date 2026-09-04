# Isolare i dati per utente: lo scoping per proprietario

Quando un'applicazione passa da "strumento personale" a "app con account", il
problema di sicurezza più importante non è il login: è che **i dati di un
utente non finiscano mai nelle mani di un altro**. Un utente autenticato può
fare qualunque richiesta all'API; se le query non sono limitate al
proprietario, basta indovinare un id per leggere o modificare dati altrui. La
regola ha un nome semplice: ogni riga del database ha un **proprietario**, e
ogni operazione ci lavora solo entro i confini di quel proprietario.

---

## Il modello: una colonna `user_id` su ogni entità

Il modo più diretto per rendere un'app multi-utente è aggiungere a **ogni**
entità che appartiene a un utente una colonna `user_id` (una foreign key verso
la tabella degli utenti). Transazioni, categorie, asset, preferenze: tutto
quello che un utente crea porta con sé chi lo possiede.

```
Transaction
├── id
├── user_id          (FK → users)
├── amount
├── category_id
└── ...
```

Da quel momento "i dati dell'utente" è una query: `WHERE user_id = ?`.

## Le tre operazioni, e la regola per ciascuna

Lo scoping va applicato in modo coerente a *ogni* operazione:

- **Create** — imposta `user_id` al proprietario autenticato. Il client non
  deve poter scegliere di chi è la riga: il valore arriva dall'utente che hai
  autenticato, non dal corpo della richiesta.
- **Read / List** — aggiungi sempre `WHERE user_id = ...`. Anche i join con
  altre entità vanno filtrati per l'utente: se un dettaglio di una
  transazione tira dentro la categoria, anche la categoria dev'essere
  dell'utente.
- **Update / Delete** — cerca la riga *già filtrata* per proprietario: se non
  esiste (perché non è tua, o perché non c'è), comportati come se non
  esistesse.

## Il bug classico: dimenticare il `WHERE`

L'errore più comune è dimenticare lo scope in una query isolata. La firma
"dopo" deve rendere il parametro impossibile da ignorare: se la funzione
riceve l'`user_id` e lo usa in ogni query, il compilatore (o almeno il
reviewer) può verificarlo. Il pericolo vero sono le vie laterali: un report
che somma senza filtro, una lista che ordina senza `WHERE`, un'operazione di
aggiornamento che carica l'oggetto con una query non filtrata e poi lo
modifica. Ogni accesso al database deve passare da una funzione che conosce il
proprietario.

## 404, non 403: non rivelare che una riga esiste

Quando un utente chiede una riga di un altro utente, quale status code
restituire? Le due opzioni:

- **403 Forbidden** — "sì, la riga esiste, ma non è tua." È più esplicito, ma
  **conferma l'esistenza** della riga.
- **404 Not Found** — "non esiste nulla con quell'id." Non distingue tra "non
  c'è" e "c'è ma non è tua".

Per dati privati la scelta sicura è **404**: non rivelare *che* un dato esista
è parte della privacy. Trattare "non è tuo" come "non esiste" è la prassi per
le app con dati sensibili; il 403 è accettabile solo quando l'esistenza
dell'entità non è informazione sensibile.

## Il paradosso del redirect: creare una riga di un altro utente

Il lato create ha una sua trappola: se `create` accetta un `category_id` dal
corpo della richiesta, devi verificare che *anche quella categoria sia
dell'utente* — altrimenti un utente può agganciare le proprie transazioni alle
categorie (o agli asset) di un altro, leggendo indirettamente che esistono e
inquinando i dati altrui. La regola vale per ogni riferimento: **tutte** le
entità raggiungibili da un'operazione vanno verificate per proprietario, non
solo quella principale.

## I vincoli di unicità diventano per-utente

Con più utenti, i vincoli `UNIQUE` globali diventano sbagliati: se "nome
categoria" è unico su tutta la tabella, il primo utente che crea "Cibo"
impedisce a tutti gli altri di usare lo stesso nome. Il vincolo giusto è
composto: `UNIQUE (user_id, nome)`. È un dettaglio che le migrazioni
autogenerate tendono a non produrre da sole — vanno aggiustate a mano.

## Quando arriva dopo: la backfill dei dati esistenti

Se lo scoping arriva *dopo* che l'app girava senza utenti, la colonna `user_id`
non può nascere `NOT NULL`: le righe esistenti non hanno un proprietario. La
sequenza sicura è:

1. Crea la colonna `nullable` (permettendo `NULL`).
2. **Backfill**: assegna tutte le righe esistenti a un utente "seed" (quello
   che possedeva l'app quando era monoutente).
3. Rendi la colonna `NOT NULL` e aggiungi la foreign key.

È una migrazione che tocca dati esistenti: merita un backup prima di essere
eseguita. Il punto concettuale è che "aggiungere la proprietà" è un cambio di
schema *e* di dati, non solo di schema.