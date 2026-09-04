# Sessioni web: come il server si ricorda che sei loggato

L'autenticazione di un'applicazione web è fatta di due problemi separati, che
vengono spesso confusi:

1. **Verificare chi sei** — il server controlla la tua password (o un'altra
   credenziale) e decide "sì, sei tu".
2. **Ricordarsi che sei loggato** — dopo il login, come fa il browser a
   dimostrare la tua identità su ogni richiesta *successiva*, senza che tu
   ridigiti la password?

Il dibattito tra "sessioni lato server" e JWT riguarda **solo il punto 2**. Le
password vanno comunque hashate (vedi la wiki sul password hashing): non esiste
versione di questo problema in cui la password si salva in chiaro.

---

## Il problema: il browser dimentica tutto tra una richiesta e l'altra

HTTP è **senza stato (stateless)**. Ogni richiesta è indipendente: il server
non ha idea che quella prima "venisse dalla stessa persona". È come uno
sconosciuto che suona a una porta ogni volta:

```
Richiesta 1:  "Ciao, sono Alice, ecco la mia password."   → server: "ok, loggata!"
Richiesta 2:  "Ciao, voglio le mie transazioni."            → server: "Chi sei?"
```

Dopo la richiesta 1 il server si è *dimenticato* che esisti. Il browser ha
quindi bisogno di un modo per dire "sono sempre Alice" a ogni singola
richiesta. A questo serve il **token di sessione**.

## Il flusso, passo dopo passo (il modello del biglietto del guardaroba)

Il modello mentale più semplice: il token di sessione è come il **numerino di
una guardaroba**.

1. **Login** — dai la password al server. Lui la verifica (ricalcolo e
   confronto dell'hash). Se è corretta, fa due cose:
   - **Scrive una riga in una tabella `sessions`**: un token lungo e casuale
     (il "numero del biglietto"), il tuo id utente e una scadenza.
   - **Ti consegna il biglietto** — invia il token al tuo browser come
     **cookie**.
   
   Un cookie è un pezzetto di dati che il browser salva e **rispedisce
   automaticamente a ogni richiesta verso quel sito**. Non lo digiti mai; lo
   gestisce il browser.

2. **Ogni richiesta** — il browser invia il cookie (il biglietto) insieme. Il
   server legge il biglietto, lo cerca nella tabella `sessions`, trova il tuo
   id utente e sa chi sei. Nessuna password da ridigitare.

3. **Logout** — il server **cancella la riga** nella tabella `sessions`. Il
   biglietto non esiste più → la richiesta successiva con quel cookie viene
   rifiutata. La sessione è morta *all'istante*.

L'idea chiave: **il biglietto vale solo perché è nella lista del server.** Il
server ha il record vero; il cookie è solo un puntatore a quel record.

## Cos'è un cookie, in concreto

Un cookie è semplicemente `nome=valore` che il browser ricorda per un sito:

```
Cookie: session_token=a1b2c3...
```

Viene impostato dal server al login (tramite un header HTTP, `Set-Cookie`). Il
browser lo salva e, da allora, lo allega a ogni richiesta verso quel sito.

```
Fai login      → server: "Set-Cookie: session_token=a1b2..." 
Richiesta dopo → browser: "Cookie: session_token=a1b2..."   (automatico)
```

Tutto qui. È un post-it che il browser tiene e rispedisce per te.

## L'alternativa: il JWT, un token che non vive sul server

L'alternativa alle sessioni lato server è il **JSON Web Token (JWT)**: un
token autodescrittivo e firmato che il server genera al login e che il browser
conserva (tipicamente in `localStorage`). A ogni richiesta l'app lo legge e lo
manda (di solito nell'header `Authorization`), e il server lo verifica
*senza consultare nulla*: la firma dimostra che il token l'ha emesso lui, e la
scadenza è scritta dentro il token stesso.

La differenza fondamentale è **dove sta lo stato**:

| | Sessione lato server (cookie) | JWT |
|---|---|---|
| Dove vive il record | Una riga in una tabella del server | Dentro il token stesso |
| Come si revoca | Si cancella la riga, è morto subito | Vale fino alla scadenza (o serve una blacklist) |
| Il browser lo protegge da JavaScript? | Sì, se il cookie è `HttpOnly` | No, `localStorage` è leggibile da JS |
| Serve una ricerca nel DB per richiesta? | Sì | No |
| Scala su molti server? | No (lo stato è in un posto solo) | Sì (lo stato viaggia col token) |

## I due problemi seri del JWT

**Non puoi revocare un token.** Una volta emesso, resta valido fino alla
scadenza. L'unico modo per fermarlo prima è tenere una **blacklist** — cioè
mantenere stato lato server comunque, vanificando il punto del "stateless".

**Il token è leggibile da JavaScript.** Vive in `localStorage`, che qualunque
script nella pagina può leggere. Se un bug di **XSS** (cross-site scripting)
permette a un attaccante di eseguire il proprio script nella tua pagina, quel
script legge `localStorage` e ruba il token — e spesso il furto è ancora più
facile che con un cookie, perché è il codice dell'app stessa a leggerlo e
inviarlo a ogni richiesta.

## Come scegliere

Il **vantaggio vero del JWT** è l'assenza di stato: funziona su un numero
qualsiasi di server senza condividere nulla. Se l'applicazione deve girare su
molte istanze in orizzontale (scaling), quel vantaggio è prezioso. Se invece
l'app è un servizio piccolo a istanza singola — anche in produzione pubblica —
quel vantaggio non si applica: un solo server non ha bisogno di token
senza stato.

Le **sessioni lato server** vincono su due fronti che per un'app con dati
privati sono decisivi:

- **Revoca immediata.** Logout, "logout ovunque", revoca di una sessione
  compromessa: cancelli la riga e quella sessione è morta *adesso*. Con il JWT
  devi aspettare la scadenza o mantenere una blacklist.
- **Protezione da XSS.** Un cookie `HttpOnly` è invisibile a JavaScript; un
  token in `localStorage` no.

Il prezzo è una ricerca nel database per ogni richiesta autenticata (trascurabile
per un'app piccola) e uno stato condiviso che rende lo scaling orizzontale più
complicato. La regola pratica: **se ti serve la revoca e i tuoi dati sono
privati, scegli le sessioni lato server; se hai molti server e la revoca non è
critica, il JWT ha senso.** Gli attributi del cookie che rendono sicura una
sessione sono spiegati nella wiki sui flag dei cookie.

## Perché la scelta di "dove sta il cookie" complica o semplifica tutto

Le sessioni a cookie si complicano molto quando frontend e backend vivono su
**origini diverse** — e "origine" per il browser significa *dominio o porta
diversi*. In quel caso il cookie va configurato con `SameSite=None; Secure`,
il backend deve inviare header CORS con `credentials: true`, le chiamate
`fetch` del frontend devono impostare `credentials: 'include'`, e la
protezione CSRF diventa un problema reale.

Se invece frontend e backend sono **sulla stessa origine** (per esempio il
backend serve anche i file statici del frontend, o un proxy di sviluppo
instrada le richieste), il cookie scorre in modo naturale: niente acrobazie
cross-site, e `SameSite=Lax` basta a mitigare il CSRF senza altra
infrastruttura. È uno dei motivi per cui il pattern "single-origin" (una sola
porta, un solo dominio) semplifica di molto l'autenticazione a cookie.