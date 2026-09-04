# Autenticazione, autorizzazione e OAuth: tre cose diverse con lo stesso nome

La parola "autenticazione" viene usata per problemi molto diversi tra loro, e
confonderli porta a disegnare male un sistema. In realtà le domande sono tre:

- **"Chi sei?"** — autenticazione.
- **"Cosa puoi fare?"** — autorizzazione.
- **"Può un'altra app accedere ai tuoi dati al posto tuo?"** — delegazione.

Le prime due le gestisci tu, come parte normale della tua applicazione. La
terza è il territorio di **OAuth 2.0** e di **OpenID Connect (OIDC)**, protocolli
diversi che a volte vengono confusi con il login "normale" — soprattutto perché
"Sign in with Google" *sembra* un login.

---

## authN (authentication) — "chi sei?"

L'**autenticazione** risponde alla domanda "chi sei?". Verifica un'identità:
il server controlla una credenziale (una password, un passkey, un codice
temporaneo) e decide che la richiesta arriva da quell'utente. Nel gergo si
abbrevia **authN** (dall'inglese *auth*e*N*tication, con la N di
"autentication"). È il tipo di login "di prima parte": l'utente si registra
contro il *tuo* database e tu gestisci la sua sessione. È il caso normale di
un'applicazione con account propri.

## authZ (authorization) — "cosa puoi fare?"

L'**autorizzazione** risponde alla domanda "cosa ti è permesso fare?".
Stabilisce i permessi di un'identità già verificata: quali risorse può
leggere, modificare, cancellare. Si abbrevia **authZ**. In una applicazione
con più utenti è tipicamente il fatto che ogni utente vede e modifica *solo i
propri* dati (le righe del database di cui è proprietario).

## L'ordine concettuale

authN e authZ non sono opzionali o alternativi: sono due strati che si
susseguono. Prima verifichi *chi* è l'utente (authN), poi decidi *cosa* può
fare (authZ). Un sistema può avere l'uno senza l'altro (un'app senza login non
ha authN; un'app con login ma un unico livello di accesso ha authN senza
authZ vera), ma quando ci sono entrambi l'ordine è sempre: authN → authZ.

## OAuth 2.0 — la delegazione

**OAuth 2.0** è un **protocollo di delegazione**: risolve "fai accedere questa
app di terze parti ai *miei* dati su un altro servizio, senza dargli la mia
password". Esempio classico: un'app chiede di leggere i tuoi dati bancari; la
banca emette un **token** limitato e revocabile, valido solo per l'ambito
concestato; l'app usa quel token per accedere *solo* a quello, e la banca può
revocarlo in qualsiasi momento senza che tu cambi password.

Punto fondamentale: **OAuth 2.0 da solo non autentica l'utente.** Non dice
"chi è l'utente": delega solo l'accesso a una risorsa. Un token OAuth
dimostra "quest'app può toccare questi dati", non "questo utente è Alice".

## OpenID Connect — OAuth più un'identità

**OpenID Connect (OIDC)** è OAuth *più* un livello di identità: oltre al token
di accesso, fornisce al client l'**identità** dell'utente ("questo utente è
Alice, e la sua email è alice@..."). È per questo che "Sign in with Google"
*sembra* un login: tecnicamente è **OIDC**, non OAuth semplice e non un login
di prima parte. La terza parte (Google, GitHub, Apple...) attesta al tuo
servizio chi è l'utente, e tu gli crei (o colleghi) un account.

## Mettiamoli in pratica

| Scenario | Cosa succede | È OAuth? |
|---|---|---|
| **Login nel tuo sito** | L'utente fa login con email + password contro il tuo database; imposti la tua sessione | **No** — authN di prima parte |
| **"Sign in with Google"** | Una terza parte (Google) ti dice "questo è Alice" | **Sì, OIDC** (OAuth + identità) |
| **Un'app legge i dati bancari** | Un'app chiede accesso; la banca emette un token limitato | **Sì, OAuth 2.0** |

## Quando arriva OAuth (e quando no)

OAuth/OIDC non *sostituisce* il login di prima parte: è un livello diverso che
può *affiancarlo*. Diventa rilevante in due situazioni tipiche:

- **"Sign in with Google"** (via OIDC) — se vuoi evitare di gestire password e
  lasciare l'identità a una terza parte.
- **Integrazioni con servizi esterni** — far leggere/scrivere alla tua app i
  dati di un altro servizio, o viceversa dare ad altre app accesso ai dati
  dei tuoi utenti.

Se la tua applicazione ha solo account propri e non delega né riceve accessi
esterni, di OAuth non hai bisogno: ti servono authN (login + sessione) e authZ
(permessi). La sequenza da interiorizzare è quindi: **authN** (chi) →
**authZ** (permessi) →, separatamente, **OAuth/OIDC** (delegazione a terze
parti).