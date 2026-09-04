# Design: bot Telegram multi-utente con flusso conversazionale per spese

Data: 2026-09-01
Stato: approvato (sezioni 1-5)

## Contesto

Il bot Telegram (journal 06) è oggi single-user: `TELEGRAM_ALLOWED_CHAT_ID`
permette una sola chat e ogni comando risolve al primo utente del database.
Con l'arrivo degli account (ADR 0005) e il deploy in produzione (ADR 0007,
Render), il bot deve diventare **multi-utente** (ADR 0008: collegamento
per-user via link code una-tantum) e **conversazionale**: l'utente non scrive
più `/expense 50.0 categoria`, ma viene guidato a passi con pulsanti.

Questa spec unisce le due cose già decise:
- ADR 0008 (linking per-user) — già scritto.
- Il nuovo flusso conversazionale per le **sole spese** (income fuori scope).

## Decisioni di prodotto (confermate in brainstorming)

1. **Single-select categoria**: il bot mostra le categorie di *spesa* come
   pulsanti inline; una spesa = una categoria. Niente digitazione della
   categoria.
2. **Pulsante fisso** `➕ Nuova spesa` (tastiera di risposta persistente) come
   unico avvio del flusso. Il comando `/expense` viene rimosso.
3. **Importo a testo libero validato**: l'utente scrive un numero positivo
   (accetta virgola e punto come separatore decimale). Niente pulsanti per
   l'importo.
4. **Descrizione obbligatoria**: il bot la chiede e aspetta testo; niente
   pulsante "Salta".
5. **Riepilogo con conferma**: prima di salvare, il bot mostra il riepilogo
   e l'utente conferma o annulla con pulsanti inline.
6. **Paginazione delle categorie**: ~8 per schermata, pulsanti `◀️`/`▶️`.
7. **Solo spese**: income non è nel bot (rimandato).

## Architettura

### Flusso conversazionale con `ConversationHandler`

La libreria `python-telegram-bot` offre `ConversationHandler`, che gestisce
lo stato della conversazione per-chat. Il flusso:

```
[➕ Nuova spesa]  →  states:
  CATEGORIA   (callback_query: categoria | ◀️ ▶️)
  IMPORTO     (message: testo validato)
  DESCRIZIONE (message: testo obbligatorio)
  CONFERMA    (callback_query: conferma | annulla)
  fallbacks: /cancel
  per_chat=True, conversation_timeout=300
```

Nessuna tabella per la conversazione: lo stato vive in memoria nel
ConversationHandler (accettato: un riavvio del bot azzera le conversazioni
in corso, ma nulla viene salvato a metà).

### Modello dati (aggiunto ad ADR 0008)

| Tabella | Scopo |
|---|---|
| `telegram_links` | `chat_id → user_id` permanente, UNIQUE su entrambi |
| `link_codes` | codici una-tantum con scadenza (~10 min) |

Nessuna tabella nuova per il flusso conversazionale.

> **Stato attuale del codice**: `backend/pynance/models/telegram_link.py`
> esiste già (non committato) con le due classi `TelegramLink` e `LinkCode`.
> Mancano: l'export nel facade `models/__init__.py`, la migrazione Alembic,
> il service, l'endpoint, il bot aggiornato e i test. Il modello esistente
> viene riusato così com'è.

### Moduli nel bot (`backend/pynance/bot/`)

- `main.py` — registra `ConversationHandler` + comandi `/start`, `/link`,
  `/unlink`
- `handlers.py` — rifattorizzato: rimossi `/expense` e `/income`; la logica
  di registrazione (`_log_transaction`) è riusata dai passi della
  conversazione
- `conversation.py` (nuovo) — i passi del flusso (categoria → importo →
  descrizione → conferma)

### Servizio nuovi (`backend/pynance/services/telegram_link.py`)

- `create_link_code(db, user_id)` — genera codice random, scade ~10 min
- `link_chat(db, code, chat_id)` — valida, consuma, crea `TelegramLink`
- `unlink_chat(db, chat_id)`, `unlink_by_user(db, user_id)`
- `get_user_by_chat(db, chat_id)` — risolve l'utente dai comandi

### Endpoint nuovi

- `POST /api/telegram/link-code` (autenticato) → genera e restituisce il
  codice (per il flusso `/link`).
- (Lo scollegamento può avvenire dal bot con `/unlink`.)

### Salvataggio

Solo il passo **CONFERMA** chiama `create_transaction`. Ogni passo DB gira
in `asyncio.to_thread` con una `SessionLocal()`, come nel bot attuale.

## Gestione errori e casi limite

| Caso | Comportamento |
|---|---|
| Pulsante non-categoria toccato | resta sul passo (ignora) |
| Importo non valido (`abc`, negativo, zero) | messaggio + resta sul passo |
| Descrizione con comando (`/expense`) | ignorato, ripete "Descrizione?" |
| Annulla alla conferma | "Registrazione annullata", torna all'inizio |
| Categoria non trovata | impossibile (scelta dai pulsanti); se accade, messaggio senza crash |
| Asset Liquid mancante | "Nessun asset disponibile, creane uno dall'app" |
| Errore imprevisto | "Qualcosa è andato storto, riprova" (niente dettagli interni in chat) |
| `/cancel` in qualunque momento | chiude senza salvare |
| Timeout 5 min | ConversationHandler abbandona; prossimo `➕` riparte da zero |
| Bot riavviato a metà flusso | stato perso, nessun danno (nulla salvato) |
| Chat non collegata tocca `➕` | "Collega prima il tuo account" + istruzioni `/link` |

## Test

- **Service**: `telegram_link.py` testato (link, unlink, get_user_by_chat,
  scadenza/consumo codice). `_parse_amount`-style testato (virgola/punto).
- **Endpoint**: `POST /api/telegram/link-code` testato attraverso HTTP.
- **Flusso bot**: verificato manualmente su Telegram (coerente col journal
  06: il bot è un processo esterno, non testato automaticamente).

## Deploy su Render

Due servizi, stessa immagine (`backend/Dockerfile`), stessa `DATABASE_URL`,
stessa regione (Frankfurt):

- **web service** (esistente): comando `./entrypoint.sh`
- **background worker** (nuovo): comando `uv run python -m pynance.bot.main`

`TELEGRAM_ALLOWED_CHAT_ID` diventa obsoleto (l'identità è nel DB) e viene
rimosso dal config.

## Fuori scope

- Income via bot (solo spese).
- Webhook (resta long-polling).
- Multi-dispositivo per un utente (una chat per utente, UNIQUE su user_id).

## Documentazione correlata

- Wiki: `docs/wiki/linking-external-account.md`
- ADR: `docs/adr/0008-telegram-per-user-linking.md`
- Journal: `docs/journal/06-telegram-bot.md` (da aggiornare)