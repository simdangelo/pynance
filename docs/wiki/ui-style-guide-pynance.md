# UI Style Guide — Pynance ("Pietra & Petrolio")

> Il sistema di design del frontend Pynance. Ispirato per **filosofia** a un'interfaccia ordinata e
> pulita: bassa densità, gerarchia tipografica basata su dimensione/colore/spaziatura (non sul bold),
> e colori di stato usati solo sul dato. Il sistema adotta un'identità visiva originale ("Pietra &
> Petrolio"), con una base neutra e accenti propri.

Tutti i valori sono token (CSS custom properties / oklch) definiti in `frontend/src/index.css`.

---

## 1. Palette

Famiglia unica calda e desaturata. Mai nero puro, mai grigio freddo. Base neutra **grigio-pietra**
(deliberatamente diversa dal crema del riferimento) per non assomigliare a Wealthfolio.

### Neutri (base "Pietra")
| Ruolo | Es. hex | Note |
|---|---|---|
| Background pagina | `#ECEDEA` | grigio-pietra con leggera tinta verde |
| Card / popover | `#F5F5F2` | contrasto dato da bordo/ombra, non da colore |
| Superficie incassata (header tabella, tab container, hover) | `#E0E1DC` | sunk, non "white box" |
| Inchiostro primario | `#3A3934` | seppia-charcoal, mai nero puro |
| Testo secondario | `#6E6D66` | |
| Testo terziario | `#A6A49C` | label uppercase, meta |
| Bordi / hairline | `#D7D8D2` | |
| CTA primaria (sfondo) | `#2F2E2A` / `#F7F7F4` | unico elemento davvero scuro |

### Accenti ("Vivido su Pietra")
| Ruolo | Es. hex | Uso |
|---|---|---|
| Brand petrolio | `#2F5D66` | grafici, gauge, segmenti allocazione, badge Scheduled |
| Positivo (moss) | `#1E8E55` | solo sul dato: Income, guadagni, badge Income |
| Negativo (clay) | `#D6403A` | solo sul dato: Expense, perdite, badge Expense |
| Attenzione (ocra) | `#B07A2E` | Overdue / due, badge "due" |
| Serie grafico | `chart-income` / `chart-expense` | verde/rosso più leggibili per le serie |

### Regola d'uso
- Moss/argilla/ocra compaiono **solo** sul dato (numero, percentuale, badge), mai come riempimento
  di superfici, card o bottoni. La CTA primaria resta l'unico elemento scuro.
- L'allocazione è neutra: i **tipi** di asset usano petrolio/moss/ocra solo nei grafici.

### Dark mode
Variante "inchiostro rovesciato": carta scura calda, stessi accenti (schiariti di un gradino),
token dedicati per light e dark.

---

## 2. Tipografia

Due famiglie: un sans per UI/etichette, una **famiglia numerica dedicata** per i valori.

- **UI**: `Onest` (`--font-sans`)
- **Numerici**: `Space Grotesk` (`--font-numeric` utility, con `tabular-nums`) — cifre a larghezza
  fissa, distinto dal sans ma non un monospace typewriter.

Gerarchia per **dimensione + colore + spaziatura**, quasi mai bold:

| Ruolo | Dimensione | Peso | Colore |
|---|---|---|---|
| Numero hero | `text-5xl` | medium | primario, numerico |
| Valore KPI | `text-2xl`–`3xl` | medium | primario, numerico |
| Titolo sezione/card | `text-base` | medium | primario |
| Corpo / celle | `text-sm` | regular | primario/secondario |
| Label uppercase | `text-[11px]`, tracking `0.08em` | medium | terziario |
| Meta | `text-xs` | regular | terziario |

---

## 3. Componenti e pattern

- **Stat** (`components/stat.tsx`): label uppercase sopra / valore sotto / meta. `tone`
  `positive|negative|attention`.
- **Segmented** (`components/segmented.tsx`): pillole su contenitore incassato; segmento attivo
  = pillola chiara rialzata (`default`) o **scura piena** (`variant="dark"`, es. period toggle).
- **TypeToggle** (`components/type-toggle.tsx`): Income/Expense con stato moss/clay, riusato in
  transaction, recurring e category dialog.
- **EmptyState** (`components/empty-state.tsx`): icona in cerchio incassato + titolo + sottotitolo (+
  azione). Sostituisce le scritte "No …" spoglie.
- **Money** (`components/money.tsx`): formatta EUR, `signed` mostra `+`/`−`.
- **DateField** (`components/date-field.tsx`): input YYYY-MM-DD + pulsante calendario (date picker
  nativo via `showPicker()`).
- **Cartellini modali** (transaction, recurring, transfer, asset, category, confirm): `sm:max-w-md`,
  `space-y-1.5` con Label, prefix importo con segno/€, riga di anteprima colorata, footer
  Cancel + azione. Il Confirm di delete ha icona cestino su cerchio argilla + testo centrato.

### Tabella (globale, `components/ui/table.tsx`)
- Header **incassato** (pietra scura) con label uppercase.
- Righe con separatori hairline, hover leggero, celle numeriche a destra in font numerico.
- Azioni con pulsanti `icon-sm`.
- Padding compatto (`h-8` header, `p-1.5` celle) per alta densità.

### Grafici
- Nessun asse/griglia superflui (o minimi), tick terziari in font numerico.
- Net worth: **area con gradiente mood** (petrolio se il saldo cresce, argilla se cala).
- Cash flow: linee income (verde)/expense (rosso)/net (petrolio, più spessa).
- Composizione: **barra composita unica** (segmenti per tipo) + legenda.

### Spaziatura e radius
- Base **4px**, spazi e padding prevalenti multipli di 4/8. Padding interno card ~16px, gap card 16px,
  gap sezioni 20px, padding del contenuto dopo la sidebar 24–32px.
- **Radius** (token `--radius: 0.35rem`), con scalatura dei token derivati:
  - `rounded-sm` ≈ 0.21rem · `rounded-md` ≈ 0.28rem · `rounded-lg` = 0.35rem (bottoni/input)
  - `rounded-xl` ≈ 0.49rem (card) · `rounded-2xl` ≈ 0.63rem
- Le **pillole** restano `rounded-full` (TypeToggle/Segmented sm, badge); i dot dei grafici `rounded-[2px]`.
  Decorazioni e toggle (TypeToggle/Segmented md) usano i token radius (`rounded-xl`/`rounded-md`), quindi
  scalano con `--radius`.

---

## 4. Layout generale

- **Full-width**: nessun `max-w` sul contenuto (si riempie lo spazio dopo la sidebar da 224px).
- **Niente titoli di pagina ridondanti**: la sidebar (griglia attiva) dice dove sei; le pagine
  iniziano con i loro contenuti (toggle, hero, o un'azione a destra).
- Sidebar fusa sulla carta, voce attiva = pillola incassata; logo con segno €.
- Pagine "di report" (Overview): hero numero + grafico informativo full-width.
- Pagine "di gestione" (Assets, ecc.): azione Add in alto a destra + contenuto.

---

## 5. Pagine — struttura

- **Overview → Net worth**: hero "Net worth" + delta `▲ +x% · since Mon YYYY (range)`; trend
  full-width; pannello "Current allocation / By asset type, today" (barra composita + legenda
  tipo·importo·%, ordinata dal più grande, link "View accounts in Assets →").
- **Overview → Cash flow**: banda 3 Stat (Income/Expense/Net), grafico cash flow full-width,
  spending per categoria sotto.
- **Transactions**: banda 3 Stat (In/Out/Net) + Add, toolbar filtri (mese, ricerca, tipo,
  categoria), tabella.
- **Recurring**: banda 3 Stat (Active/Due/Paused) + Add, card "Due now" (solo se c'è qualcosa),
  tabella, badge di stato Scheduled(petrolio)/Overdue(ocra)/Paused.
- **Assets**: Add in alto, barra composita + legenda, lista **raggruppata per tipo** (header con
  pallino + subtotale, righe senza divider intra-gruppo), riga finale "Net worth" col totale.
- **Transfers**: Add in alto + tabella completa (nessun filtro mese/KPI).
- **Categories**: Add in alto a destra; **due tabelle** affiancate (Expense | Income) con header
  colorato + conteggio, ordinate alfabeticamente; Add/Edit via `CategoryDialog` condiviso.

---

## 6. Formati comuni

- **Date**: sempre `YYYY-MM-DD` (input validati con pattern, display ISO ovunque).
- **Money**: EUR, `Money` con `signed` per i Net (`+€X` / `−€X`).
- **Tipi income/expense**: badge tinta moss/clay; filtro via toggle o sezione dedicata.

> Nota: il frontend non contiene business logic. Quando serve un dato derivato (composizione,
> totali per tipo, delta), viene calcolato lato client a partire dalle risposte API già esistenti.
