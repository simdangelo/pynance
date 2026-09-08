# Deploy su VPS Oracle gratuito: la guida passo-passo dal zero

Questa guida racconta **come rifare da capo** l'intero percorso che porta
Pynance da "gira sul mio computer" a "raggiungibile su internet con un suo
dominio e HTTPS". È scritta per essere seguita **tra un anno**, quando ci
servirà ricostruire tutto dimenticando i dettagli. Ogni concetto è spiegato
la prima volta che compare: se non sai cos'è una subnet o una security list,
qui lo scopri al momento giusto, mentre la configuri.

Serve una premessa: questa è la forma di deploy chiamata **strategia C** nella
`deploy-guide.md` — VPS + Docker Compose + reverse proxy. Non è l'unica (c'è
il PaaS, più semplice), ma è quella che dà il controllo totale e che il
progetto ha scelto come destinazione finale. La guida assume che tu stia
ripartendo da zero, con un account Oracle Cloud pronto ma nessuna risorsa
creata.

---

## Parte 1 — Le fondamenta: di cosa stiamo parlando

Prima di cliccare qualsiasi cosa, tre concetti che ricorreranno ovunque.

**Il VPS.** Un *Virtual Private Server* è un computer che non è il tuo: è una
macchina fisica in un datacenter, divisa in tante macchine virtuali che
affitti. Tu la controlli per intero (sistema operativo, software, firewall)
via SSH, da remoto. Nel nostro caso il VPS è gratuito perché rientra nel
*free tier* di Oracle Cloud: una quota mensile di risorse che Oracle offre
senza farti pagare, in cambio del fatto che alcune persone finiranno per
passare a un piano a pagamento. Gratis non significa "non affidabile":
significa che **i limiti possono cambiare** (Oracle ha dimezzato la quota ARM
a giugno 2026 senza preavviso) — quindi il deploy va pensato per poter
rinascere da zero, ed è esattamente ciò che questa guida ti permette di fare.

**L'SSH.** È il protocollo con cui ti colleghi a un computer remoto in modo
sicuro. Invece della password, usa una coppia di *chiavi crittografiche*:
una privata (resta solo a te, come una chiave di casa) e una pubblica
(la installi sulla macchina remota, come una serratura). Chi ha la chiave
privata può entrare; chi ha solo quella pubblica no. Oracle te le genera alla
creazione della macchina: scarichi la chiave privata **una sola volta** e la
tieni al sicuro.

**L'IP pubblico.** Ogni computer su internet ha un indirizzo numerico (es.
`79.72.44.6`), come una targa. Il tuo VPS ne ha uno pubblico, raggiungibile
da tutto il mondo. Il dominio che compriamo serve proprio a non dover
ricordare quella targa: `pynance.online` "punta" all'IP.

---

## Parte 2 — Il dominio e il DNS: dare un nome alla macchina

### Perché serve un dominio

Tecnicamente l'app potrebbe girare solo sull'IP, ma per due motivi il dominio
è necessario: perché è un nome che ricordi e puoi mostrare, e soprattutto
perché **HTTPS non si può avere senza** — il sistema che emette i certificati
(Let's Encrypt) verifica che il dominio che stai chiedendo risolva davvero
al tuo server prima di firmarti il certificato. Un IP nudo non è accettato.

### Dove e come comprarlo

Il dominio si compra da un **registrar**: un'azienda autorizzata a registrare
nomi su internet. Noi usiamo **Porkbun** (economico, DNS facile). Altre
opzioni: Cloudflare Registrar (costo puro, senza margine) o Namecheap.
Compra un solo dominio, **senza** gli extra che il carrello propone (hosting,
email professionale, "SSL premium": inutili per noi).

I prezzi variano a seconda dell'**estensione** (`.com`, `.online`, ecc.):
ogni estensione è gestita da un'azienda diversa che fissa il suo prezzo, e i
TLD nuovi come `.online` fanno spesso promozioni sul **primo anno** per poi
rinnovare a prezzo pieno. Controlla sempre il **renewal price**, non il
prezzo di lancio. Per un anno di test va benissimo un dominio da 2 euro;
disattiva subito l'**auto-renew**, così non ti rinnova da solo al prezzo
pieno se decidi di non continuare.

### Il DNS e il record A

Il **DNS** (Domain Name System) è la rubrica di internet: associa nomi a
indirizzi IP. Quando scrivi `pynance.online`, il browser chiede al DNS
"qual è l'IP di pynance.online?" e riceve `79.72.44.6`. Il record che fa
questa associazione si chiama **record A** (A = address). Lo aggiungi nel
pannello DNS di Porkbun, con l'IP del tuo VPS.

⚠️ **L'insidia del record parcheggiato**: quando compri un dominio, Porkbun
crea automaticamente un record **ALIAS** che punta alla sua pagina di
parcheggio (es. `pixie.porkbun.com`). Quel record "occupa" la radice del
dominio e va **eliminato** prima di aggiungere il record A, altrimenti
avrai un errore di conflitto.

---

## Parte 3 — Oracle Cloud: creare la rete del VPS

### Il tenancy e la regione

Quando accedi a Oracle Cloud ti trovi nel tuo **tenancy**: è il tuo "conto"
gratuito, con un **compartment** (una cartella logica di separazione, per
noi quella di default). Prima di tutto scegli la **regione** (es. Frankfurt
o Milan): è il datacenter geografico dove vivranno le risorse. Non è
irrilevante: deve essere la stessa per tutto ciò che crei, altrimenti i pezzi
non si vedono tra loro.

### La VCN e la subnet: il quartiere e la via

La **VCN** (*Virtual Cloud Network*) è la rete privata virtuale del tuo VPS:
un "quartiere" isolato dove vive la macchina. Oracle la definisce con un
**CIDR**: un blocco di indirizzi IP interni (noi usiamo `10.0.0.0/16`, cioè
tutti gli IP da `10.0.0.0` a `10.0.255.255`). Sono indirizzi **privati**,
non visibili da internet — il VPS ne ha uno privato per parlare con la rete
interna, e uno pubblico per ricevere visite.

La **subnet** è un sotto-quartiere dentro la VCN: prendiamo un pezzo del
blocco (`10.0.0.0/24`) e lo dichiariamo **pubblico**. "Pubblica" qui non
significa "senza protezione": significa che le macchine al suo interno
possono ricevere un IP pubblico e parlare con internet. La scelta subnet
pubblica vs privata decide *dove* può arrivare il traffico.

### L'Internet Gateway: la porta del quartiere

Una subnet pubblica di per sé non è raggiungibile da internet: serve un
**Internet Gateway** — letteralmente la porta del quartiere verso l'esterno.
Lo crei come oggetto a sé, poi dici al quartiere di usarla.

### La route table: il cartello "tutto verso la porta"

La **route table** è l'elenco di regole che dice alla rete *dove* mandare il
traffico. Ne serve una regola: tutto ciò che esce (`0.0.0.0/0`, cioè
"chiunque/dovunque") va verso l'Internet Gateway. Senza questa regola, anche
con la porta aperta, il traffico non sa da dove uscire.

### La security list: il portinaio del palazzo

La **security list** è il firewall di rete: decide *chi* può entrare.
Contiene **ingress rules** (regole di ingresso) del tipo "permetto il
traffico TCP verso la porta X da chiunque". Le tre porte che ci servono:

- **22** (SSH) — per collegarti al server da remoto
- **80** (HTTP) — il traffico web normale, che Caddy userà per il redirect
- **443** (HTTPS) — il traffico web cifrato, dove vive l'app vera

Con `0.0.0.0/0` come origine permettiamo l'accesso a tutti; in futuro si
può restringere la 22 al solo tuo IP di casa. (Nota: una porta aperta non è
un rischio di per sé — il software dietro la porta decide cosa fare del
traffico. Ma ogni porta esposta aumenta la superficie d'attacco, quindi
apriamo solo il minimo necessario.)

### La VM: il computer vero

La **VM** (Virtual Machine) è il VPS vero e proprio: un computer virtuale
con sistema operativo. In Oracle si sceglie la **shape** (la "taglia" della
macchina) e l'**immagine** (il sistema operativo preinstallato). Le nostre
scelte:

- **Image**: `Canonical Ubuntu 22.04 Minimal aarch64`. Il suffisso
  `aarch64` è la versione per processori **ARM**; le altre (senza suffisso)
  sono per processori x86 e non partono su una shape ARM.
- **Shape**: `Ampere A1.Flex`, la famiglia ARM del free tier, con
  **2 OCPU / 12 GB RAM**. L'OCPU è l'unità di calcolo di Oracle; 12GB di RAM
  sono abbondanti per il nostro stack (DB + web + bot + proxy insieme).
  ⚠️ Le shape ARM sono spesso sature: se vedi "Out of host capacity", non è
  un errore tuo — riprova, o prova un altro Availability Domain.

Durante la creazione:
- **Networking**: aggancia la VM alla VCN e alla subnet pubblica, e attiva
  "Assign a public IPv4 address" (è l'IP che punterà il dominio).
- **SSH keys**: scegli "Generate a key pair for me" e scarica la chiave
  privata (`.key`). Spostala in `~/.ssh/pynance.pem` con permessi `600`.

---

## Parte 4 — Prima connessione e Docker

### Collegarsi al server

Dal tuo computer:

```bash
ssh -i ~/.ssh/pynance.pem ubuntu@<IP_PUBBLICO>
```

Al primo collegamento ti chiederà di confermare la fingerprint del server
(digi `yes`): è il meccanismo per assicurarti di parlare con la macchina
giusta. Ti troverai nel prompt di Ubuntu, sul server.

### Installare Docker

**Docker** è il software che impacchetta le applicazioni in *container*:
ambienti isolati e riproducibili (stesso codice, stesse dipendenze, stesso
comportamento ovunque). **Docker Compose** è il suo orchestratore: con un
file di testo (`docker-compose.yaml`) descrivi l'intero stack e lo avvii con
un comando. Su Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
```

`enable --now` fa partire Docker ora e all'avvio del server; `usermod -aG
docker` aggiunge il tuo utente al gruppo `docker`, così non serve `sudo` a
ogni comando (va ri-loggato per avere effetto). L'immagine "Minimal" non
include editor di testo (nano/vim): si creano i file con `cat > file <<'EOF'`.

---

## Parte 5 — Il codice sul server

### Clonare il repo

```bash
cd ~
git clone https://github.com/<UTENTE>/pynance.git
cd pynance
```

### Il file `.env`: i segreti

Il `.env` è il file dove stanno le variabili di configurazione sensibili
(user, password, token). Non è mai committato (è nel `.gitignore`): vive
solo sul server. Il contenuto minimo:

```env
POSTGRES_USER=app_user
POSTGRES_PASSWORD=<password_forte>
POSTGRES_DB=pynance_db
POSTGRES_PORT=5432
POSTGRES_HOST=db
DOMAIN=pynance.online
SECURE_COOKIES=true
ALLOWED_HOSTS=["pynance.online","localhost","127.0.0.1"]
TELEGRAM_BOT_TOKEN=<token_del_bot>
```

Due dettagli critici:

- **`POSTGRES_HOST=db`** è il nome del servizio *dentro* la rete Docker, non
  `localhost`: il backend si collega al database tramite la rete interna di
  compose, dove il container si chiama `db`.
- **La password del DB non deve contenere caratteri speciali** come `@`,
  `:` o `/`. La connessione è costruita come una URL
  (`postgresql://utente:password@host:porta/db`) e quei caratteri rompono
  l'interpretazione della stringa (l'errore tipico è "failed to resolve
  host 'xxx@db'"). Genera una password solo alfanumerica:
  ```bash
  openssl rand -hex 24
  ```

---

## Parte 6 — Il primo avvio e i problemi che troverai

### Lo stack

```bash
docker compose --profile bot up -d --build
```

- `up` crea e avvia i servizi; `-d` li fa girare in background; `--build`
  ricostruisce le immagini dal codice.
- `--profile bot` attiva il servizio opzionale del **bot Telegram**: senza
  quella flag parte solo web + DB + proxy. (I *profiles* di compose sono
  gruppi di servizi che si includono a richiesta.)

Lo stack ha **quattro servizi**: `db` (Postgres), `backend` (FastAPI che
serve anche il frontend compilato), `bot` (Telegram), `proxy` (Caddy, il
reverse proxy). Il **reverse proxy** è il portinaio del palazzo: sta davanti
a tutto, riceve le richieste HTTPS, le passa al backend e gestisce da solo i
certificati. Caddy lo abbiamo scelto perché emette e rinnova i certificati
Let's Encrypt automaticamente, senza cerimonie manuali.

### Il problema dell'immagine stantia

Al primo `up` senza `--build`, compose può riusare un'immagine vecchia che
non contiene le migrazioni più recenti: il backend entra in restart loop con
"Can't locate revision identified by '...'". **Si usa sempre `--build`** al
primo avvio (è lo standard, non l'eccezione).

### Il problema di `uv` nel bot

L'immagine runtime **non contiene il binario `uv`** (serve solo in fase di
build per installare le dipendenze). Il bot, che prima lo invocava, va
avviato col python del venv già pronto:

```
command: ["/app/.venv/bin/python", "-m", "pynance.bot.main"]
```

La regola di fondo: in un container con `.venv` già costruito e congelato,
si usa direttamente l'interprete del venv — `uv` è uno strumento da
sviluppo, non da runtime.

### Il problema della password con caratteri speciali

Se vedi `failed to resolve host 'y5Q1V@db'`, è la password del DB con un
`@` (o simili). Due fix: cambiarla in `.env` **e ricreare il container del
DB**, perché Postgres fissa la password al primo avvio dentro il volume:
```bash
docker compose down -v   # rimuove anche il volume (dati persi: ok se il DB è vuoto)
docker compose --profile bot up -d --build
```

### Verificare che tutto funzioni

```bash
docker compose --profile bot ps          # tutti i servizi Up
docker compose logs backend --tail 15    # migrazioni + uvicorn
curl -sk https://pynance.online/api/health   # → {"status":"ok"}
```

Nei log del backend dovresti vedere gli **IP reali dei client** (es.
`172.20.0.1`, il gateway di rete): è la conferma che il proxy inoltra
l'informazione corretta.

---

## Parte 7 — Il deploy successivo e la manutenzione

### Aggiornare l'app

Non c'è auto-deploy: la VM gira sul codice del clone locale, e va aggiornata
a mano. Il repo contiene `scripts/deploy.sh` che fa tutto in un comando:

```bash
./scripts/deploy.sh    # = git pull + docker compose --profile bot up -d --build
```

I dati non si perdono: il volume di Postgres e il `.env` sopravvivono ai
rebuild.

### Il backup

Su un VPS gratuito **nessuno protegge i tuoi dati** — la piattaforma tratta
il free tier come usa-e-getta. Il backup è un cron sul server che esegue
`scripts/backup.sh` (pg_dump → gzip → tiene le ultime 7 copie):

```bash
mkdir -p /opt/pynance/backups
crontab -e   # aggiungi:
# 0 3 * * * cd /home/ubuntu/pynance && ./scripts/backup.sh >> /opt/pynance/backups/backup.log 2>&1
```

---

## Checklist finale: cosa tenere al sicuro

- [ ] Chiave SSH privata (`~/.ssh/pynance.pem`) — irrecuperabile se persa
- [ ] Token Telegram del bot — rigenerabile ma da non esporre
- [ ] `.env` del server — contiene password e token
- [ ] IP pubblico della VM e regione Oracle — per ritrovare le risorse
- [ ] Dominio e registrar (Porkbun) con auto-renew disattivato

## Insidie raccolte in un colpo d'occhio

1. **Record ALIAS di parcheggio** su Porkbun va eliminato prima del record A.
2. **Shape ARM satura**: "Out of host capacity" → retry / altro AD.
3. **Password DB senza caratteri speciali** — mai `@`, `:`, `/`.
4. **`--build` sempre** al primo avvio (immagine stantia).
5. **Il bot usa il python del venv**, non `uv`.
6. **Regione unica** per tutto (VCN, VM, ecc.).
7. **`POSTGRES_HOST=db`**, non `localhost`.
8. **Free tier volatile**: backup + deploy riproducibile (questa guida).