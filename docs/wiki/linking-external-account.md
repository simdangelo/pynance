# Collegare un account esterno: il flusso di link

Un'app web e un servizio esterno (un bot, un client mobile, un'app di terze
parti) sono due mondi separati: l'utente è autenticato *dentro* l'app, ma il
servizio esterno non sa chi è. "Collegare" i due significa creare un ponte
tra l'identità interna (l'account utente dell'app) e quella esterna (per un
bot Telegram: l'`chat_id` di quella persona). Questo file spiega il problema
e i modi per risolverlo, e perché il design della soluzione è delicato.

---

## Il problema: due identità, un solo utente

Quando un utente interagisce con l'app attraverso il browser, il server sa
chi è: la sessione (o il token) lo identifica. Ma quando lo stesso utente
scrive a un bot Telegram, il bot riceve solo informazioni *esterne*: l'id
della chat, il testo del messaggio. Non c'è nessuna sessione, nessun login.

Il bot deve capire *quale account dell'app* corrisponde a quella chat, per
fare cose per conto di quell'utente (registrare una transazione, leggere un
saldo). Questo è il "link" tra le due identità.

La tentazione iniziale è usare una scorciatoia: un'unica identità condivisa
("tutti i messaggi al bot appartengono all'unico utente dell'app"). Funziona
solo finché l'app ha un solo utente; appena gli utenti diventano due, il bot
non sa a chi imputare un movimento. Serve un collegamento *per-utente*.

## La forma della soluzione: una mappa chat → account

Il collegamento è una mappa tra l'identificatore esterno e quello interno:

```
chat_id (esterno)  →  user_id (interno)
```

In un database relazionale, questa mappa è una **tabella di collegamento**
con due colonne: l'id esterno (es. `chat_id`) e l'id interno (es. `user_id`).
Ogni riga dice "la chat 123456 appartiene all'utente 42". Quando il bot
riceve un messaggio, guarda la chat, trova l'utente, e agisce per conto suo.

Due proprietà rendono la tabella robusta:

- **L'id esterno è unico** — una chat non può essere collegata a due utenti
  (altrimenti il bot non saprebbe a chi imputare). Vincolo `UNIQUE` su
  `chat_id`.
- **L'id interno è unico** — un utente non può avere due chat collegate
  (o le regole su "quale chat vince" diventano arbitrarie). Vincolo `UNIQUE`
  su `user_id`. Questa seconda regola è una *scelta* (potresti volere più
  dispositivi), ma per un bot personale è la più semplice da ragionare.

## Come si crea il collegamento: tre approcci

Il collegamento non si crea da solo: l'utente deve dimostrare che la chat
esterna è sua. I modi classici sono tre.

Una distinzione importante prima di vederli: **il codice è una-tantum, il
collegamento è permanente.** La scadenza del codice serve solo al passaggio
di autenticazione iniziale ("dimostri che questa chat è tua"): una volta
consumato, il collegamento che crea non scade più. L'utente si autentica una
volta e la "sessione" esterna resta aperta finché non la stacca
esplicitamente (un comando di scollegamento). Questo è di solito ciò che un
utente vuole da un bot personale: configuralo una volta, usalo per sempre.

### 1. Codice di collegamento (link code)

Il flusso più comune e più sicuro:

1. L'utente, **dentro l'app** (dove è già autenticato), chiede un codice di
   collegamento (es. un breve token alfanumerico generato dal server).
2. L'utente invia quel codice al bot esterno (es. scrive `/link
   ABC123` in chat).
3. Il bot riceve il codice, ma **il codice da solo non basta**: deve
   verificarne l'autenticità. Il codice è legato all'utente *nel database*
   (una riga `link_code` → `user_id`), quindi il bot guarda il codice, trova
   l'utente, e crea la mappa chat → utente.

La sicurezza del codice sta nel fatto che è **effimero** (scade dopo
qualche minuto), **usa e getta** (una volta consumato, non vale più), e
**segreto** (solo chi è loggato nell'app può ottenerlo). Chi possiede il
codice dimostra di controllare quell'account.

### 2. Login via link (deep link)

L'utente, dentro l'app, genera un link che contiene un token. Apre quel link
sul dispositivo esterno (o lo incolla in una chat col bot). Il servizio
esterno riceve il token e lo scambia per l'identità. È la stessa idea del
codice, ma il token viaggia in un URL invece che digitato a mano.

### 3. Fiducia dichiarata (trusted id)

Si dichiara in configurazione che una certa identità esterna appartiene a un
certo utente (es. un file di config che dice "la chat 123456 è di user 42").
Semplice e zero codice, ma è la scorciatoia single-user: ogni nuovo
collegamento richiede una modifica al codice/config, non è autoservito.

## Perché il flusso di collegamento è delicato

La parte difficile non è la tabella — è **non aprire una falla** nel momento
in cui leggi il codice. Le insidie ricorrenti:

- **Il codice deve essere segreto.** Se un codice di collegamento finisce
  nei log, in un messaggio a un'altra persona, o è predicibile, chiunque può
  rubare la mappa. Mai loggare il codice, mai renderlo incrementale (il
  codice `000001` è indovinabile), sempre con scadenza.
- **Il codice va consumato una volta.** Se lo stesso codice collega più
  chat, l'ultimo collegamento sovrascrive il precedente (grazie al vincolo
  UNIQUE) — e l'utente originario perde l'accesso. Dopo il primo uso, il
  codice deve essere invalidato.
- **La chat è l'identità esterna, ma non è l'identità dell'utente.** Un
  `chat_id` è un numero che appartiene a una chat, non un dato personale
  verificato. Il collegamento è *fiducia dichiarata dall'utente*: chi ha il
  codice dimostra di controllare l'account, non che la chat è "sua" in
  senso assoluto.
- **Prima del collegamento, il bot non deve fare nulla.** Un messaggio da
  una chat non collegata va ignorato (o al più ricevere "collega prima il
  tuo account"), mai eseguito per conto di un utente di default.
- **L'annullamento deve esistere.** L'utente deve poter scollegare la chat
  (dall'app o dal bot), altrimenti l'unico rimedio a un collegamento
  sbagliato è la cancellazione manuale nel database.

## Il pattern ricorrente

Sotto la superficie, questo è il pattern che ritrovi ovunque: **prova di
possesso di un canale esterno**. Un codice che l'utente ottiene da una parte
autenticata e presenta all'altra. È lo stesso principio del *device pairing*
(accoppiare un TV e un telecomando), dell'*email verification* (un link che
dimostra di possedere la casella) e del *OAuth device flow* (un codice da
digitare su un'altra schermata). Se capisci questo flusso qui, lo
riconoscerai in molti altri sistemi.

## Minimal illustrative example

Una tabella di collegamento, due unicità, e il bot che risolve l'utente:

```python
class ExternalLink(Base):
    __tablename__ = "external_links"
    id: Mapped[int] = mapped_column(primary_key=True)
    external_id: Mapped[str] = mapped_column(unique=True)   # chat_id
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    created_at: Mapped[datetime]
```

Il bot, su ogni messaggio:

```python
def resolve_user(session, chat_id):
    link = session.execute(
        select(ExternalLink).where(ExternalLink.external_id == chat_id)
    ).scalars().first()
    if link is None:
        raise NotLinkedError("Collega prima il tuo account")
    return link.user_id
```

Il codice di collegamento, con scadenza e consumo singolo:

```python
class LinkCode(Base):
    __tablename__ = "link_codes"
    code: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    expires_at: Mapped[datetime]

def link_chat(session, code, chat_id):
    row = session.execute(
        select(LinkCode).where(LinkCode.code == code)
    ).scalars().first()
    if row is None or row.expires_at < now():
        raise InvalidCodeError("Codice non valido o scaduto")
    # consuma il codice: una sola chat può usarlo
    session.delete(row)
    session.add(ExternalLink(external_id=chat_id, user_id=row.user_id))
    session.commit()
```

## General rules

- **Il link è una mappa** (esterno → interno), mai un default "primo utente".
- **Due unicità**: l'esterno e l'interno devono essere univoci.
- **Il codice è una prova di possesso**: segreto, effimero, usa-e-getta.
- **Il bot non agisce per chat non collegate.**
- **Deve esistere lo scollegamento.**
- **Il concetto si ripete ovunque** (device pairing, email verification,
  OAuth device flow): capirlo qui serve per riconoscerlo altrove.