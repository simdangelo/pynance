# UI Style Guide — Pynance

> Sistema di design del frontend Pynance, derivato come **clone visivo fedele** di `app2/`
> (SharkFin): fondo off-white caldo, superfici neutre quasi bianche, arancio come unico
> colore d'azione, grigi caldi per il testo, colori saturi **solo** su dati, azioni e stati.
> **Solo light mode**: la variante dark non fa parte del design e va rimossa.
> Unica deviazione voluta dal riferimento: i numeri usano **JetBrains Mono** invece del
> sans (§ 2).
>
> L'impaginazione e la struttura delle pagine saranno trattate separatamente a partire da
> `app1/` (vedi § 7). Qui si definisce lo stile: palette, tipografia, forme, componenti.

Tutti i valori sono token (CSS custom properties) da definire in `frontend/src/index.css`
(Tailwind v4, `@theme`). I componenti citati sono quelli in `frontend/src/components/` e
`frontend/src/components/ui/`, che verranno ri-stilizzati mantenendo la stessa API.

---

## 1. Palette

Base calda desaturata: mai nero puro, mai grigio freddo. L'unico colore pieno di superficie
è l'arancio, e solo sulle azioni. Il resto è neutro caldo.

### Neutri (fondi e superfici)

| Token | Hex | Uso |
|---|---|---|
| `--background` | `#F6F5F2` | Fondo pagina |
| `--sidebar` | `#FAF9F7` | Fondo della sidebar (appena più chiaro della pagina) |
| `--card` / popover | `#FCFCFB` | Card, pannelli, dropdown |
| superficie bianca | `#FFFFFF` | Input, righe tabella, dialog |
| `--muted` | `#F0EFEB` | Superfici incassate: segmented container, track barre |
| `--row-group` | `#F2F0EB` | Bande data/intestazione di gruppo nelle liste |
| `--row-hover` | `#F6F5F2` | Hover delle righe di tabella (tono pagina) |
| `--foreground` | `#24211F` | Inchiostro primario (seppia-charcoal caldo) |
| `--muted-foreground` | `#696664` | Testo secondario |
| `--faint-foreground` | `#A09F9F` | Testo terziario: label, meta, tick assi, placeholder |
| `--border` | `#EBEAE5` | Hairline di card, tabelle, separatori |
| `--input` | `#E1E1DE` | Bordo di input, checkbox, controlli |
| `--chart-grid` | `#EFEEE9` | Griglia orizzontale dei grafici |
| `--primary` | `#ED7240` | Arancio brand |
| `--primary-foreground` | `#FFFFFF` | Testo su arancio |
| `--primary-soft` | `#FBF3EC` | Tinta arancio: voce nav attiva, badge soft, hover primario |

### Semantica

| Token | Hex | Uso |
|---|---|---|
| `--positive` | `#437B36` | Income, stato positivo, badge "Income"/"Active" |
| `--positive-soft` | `#EAF3E7` | Tinta verde per badge |
| `--positive-chart` | `#53AC7D` | Verde più morbido per serie/grafici (flussi) |
| `--destructive` | `#A94440` | Eccezioni: overdue, "da rivedere", errori, eliminazioni |
| `--destructive-soft` | `#F9E9E7` | Tinta rossa per badge e bottone destructive |

### Serie dati (palette categorica)

Un colore per categoria/serie, indipendente dal segno. Ordine di assegnazione:

| Token | Hex | |
|---|---|---|
| `--chart-1` | `#4176CF` | blu |
| `--chart-2` | `#E2A439` | ambra |
| `--chart-3` | `#3D832A` | verde |
| `--chart-4` | `#D694A3` | rosa |
| `--chart-5` | `#B2B0AD` | grigio caldo |
| `--chart-6` | `#91808A` | mauve (estensione) |
| `--chart-7` | `#3E8E8E` | teal (estensione) |
| `--chart-8` | `#556F9C` | indaco (estensione) |

### Regole d'uso
- **L'arancio è azione, non decorazione**: bottoni primari, voce nav attiva, focus ring,
  link/azioni, linea del net worth. Un solo bottone primario per vista.
- **Il rosso è eccezione**: overdue, righe da rivedere, errori, azioni distruttive, e il lato
  Expense di toggle/badge. Mai come riempimento di card o bottoni pieni (solo tinte soft).
- **Il verde è income/positivo**: badge e testi Income/Active, serie income nei grafici.
- **I numeri restano in inchiostro**: il segnale di stato è un dot da 6–8px, un badge o un
  segno (`+`/`−`), non un numero colorato. Fanno eccezione i testi esplicitamente semantici
  ("Overdue", "Uncategorized", "da rivedere"), che usano il rosso. Nelle **liste di
  transazioni** gli importi sono colorati (`--positive`/`--destructive`) insieme al segno
  (vedi § 4 Money).
- **La palette categorica non è semantica**: serve a distinguere le serie, non a indicare
  buono/cattivo. Income/expense nei grafici cash-flow usano verde/rosso dedicati.

---

## 2. Tipografia

Due famiglie, con ruoli nettissimi: **Inter** per tutta la UI e **JetBrains Mono** per le
cifre (`@fontsource-variable/jetbrains-mono`, già in `package.json`). Niente serif.

- `--font-sans`: `'Inter Variable', ui-sans-serif, system-ui, sans-serif`
- `--font-numeric`: `'JetBrains Mono Variable', ui-monospace, monospace` (utility
  `.font-numeric`), tracking leggermente negativo (`-0.01em`). Essendo monospaziata, le cifre
  sono già allineate in colonna (nessun bisogno di `tabular-nums`) e lo zero è distinguibile
  dalla O. Da usare **solo** per numeri, importi, date, tick e percentuali.
- Da rimuovere: Onest e Space Grotesk (import e token).

**Perché JetBrains Mono** (e non le altre varianti):
- *Mono* = monospaziata: ogni glifo ha la stessa larghezza, quindi cifre e separatori si
  incolonnano da soli. È la scelta giusta per un'app di numeri.
- *Nerd Font* = build patchate per terminali, con migliaia di glifi-icona aggiunti: nel web
  sarebbero solo peso in più, senza alcun beneficio.
- *JetBrains Sans* = sans proporzionale (non mono): non allineerebbe le colonne di importi,
  quindi non serve allo scopo.
- Le ligature di programmazione di JetBrains Mono (`->`, `>=`, …) non riguardano cifre e
  separatori: per numeri e date l'effetto è identico alla versione "NL" (no-ligatures), che
  quindi non è necessaria.

Nota pratica: alla stessa dimensione la mono appare più larga del sans; nei contesti densi
(tabelle) si può scendere di 1px (13 invece di 14) per mantenere la densità visiva.

| Ruolo | Dimensione | Peso | Colore |
|---|---|---|---|
| Titolo pagina (banda) | 18px | 600 | primario |
| Numero hero (Overview) | 36–40px | 500 | primario, numerico |
| Valore KPI / Stat | 28–30px | 700 | primario, numerico |
| Titolo card/sezione | 16–18px | 600 | primario |
| Corpo, celle, form | 14–15px | 400 | primario/secondario |
| Label di campo | 13px | 500 | primario |
| Meta, sub-label, tooltip | 12–13px | 400 | terziario |
| Micro-titolo sidebar | 11–12px, tracking `0.06em`, **uppercase** | 600 | terziario |

Regole:
- **Sentence case** per titoli e label (`Spending breakdown`, `Total spending`). L'uppercase è
  riservato ai micro-titoli di sezione della sidebar (`PROPERTIES`).
- Titoli stretti (`tracking-tight`, `-0.02em`), line-height 1.15–1.2; corpo 1.5.
- Un valore numerico è sempre `.font-numeric`: KPI, importi, date, tick, percentuali.

---

## 3. Forme, elevazione, spaziatura

### Radius
- Token base `--radius: 0.75rem` (12px): bottoni, input, segmented, tooltip, piccoli pannelli.
- **Card**: `rounded-2xl` (16px). **Dialog**: 16–20px (sul pannello bianco).
- **Pillole e dot**: `rounded-full` (badge, barre, dot, contenitore segmented).
- **Checkbox**: `rounded-md` (6px), bordo `--input`.
- Scale derivate come in Tailwind v4 (`--radius-sm/md/lg/xl/2xl`).

### Elevazione
- Card e superfici: bordo hairline 1px `--border` + ombra quasi impercettibile
  `0 1px 2px rgb(36 33 31 / 0.04)`. Mai bordo pesante + ombra forte insieme.
- Elementi rialzati (popover, dropdown, dialog, tooltip): ombra
  `0 12px 32px rgb(36 33 31 / 0.10)`, bordo hairline.
- Bottoni piatti (nessuna ombra); hover = scurimento leggero o `--muted`; active =
  `translate-y-px`.
- Overlay dialog: `rgb(36 33 31 / 0.25)`.

### Focus
- `outline: 2px solid var(--primary)` con offset 2px, oppure `ring-2 ring-[--primary]/35` +
  bordo `--primary` sugli input. Mai outline blu di default.

### Spaziatura
- Base **4px**; padding card 16–20px, gap tra card 16px, gap tra sezioni 20–24px, padding
  contenuto dopo la sidebar 24–32px.
- Righe tabella ~52–56px; padding celle `12px 16px` con numeri a destra.

---

## 4. Componenti

### Button (`components/ui/button.tsx`)
- **Primary**: fondo `--primary`, testo bianco, `h-9`, `px-3.5`, radius 12, 14px medium.
  Hover: arancio leggermente più scuro; active: `translate-y-px`. Usato per l'unica azione
  principale della vista (`Add transaction`, `Salva`, `Importa`).
- **Secondary/outline**: fondo bianco, bordo `--input`, testo primario. Hover `--muted`.
- **Ghost**: trasparente, hover `--muted`; per azioni di riga (edit/delete) con `icon-sm`.
- **Destructive**: tinta soft `--destructive-soft`, testo `--destructive`, mai rosso pieno.
- Icona opzionale a sinistra, size 16px, gap 6px.

### Input e Search
- Fondo bianco, bordo hairline `--input`, radius 12, `h-9`/`h-10`, 14px.
- Placeholder e icone in `--faint-foreground`; focus come in § 3.
- Search con icona a sinistra e eventuale bottone filtro a destra, stessa altezza.
- Vale anche per `SelectTrigger` e per la variante `outline` dei bottoni: fondo
  `--card` (non `--background`), così i controlli restano bianchi sul fondo pagina.

### Card e Stat (`components/stat.tsx`)
- Card bianca `--card`, radius 16, hairline + ombra soft, padding 16–20.
- **KPI**: sulla prima riga un **dot colorato 8px** opzionale + label 13px in
  `--muted-foreground`; sotto il valore 28–30px numerico bold; sotto una sub-label 12–13px
  terziaria.
- Niente label uppercase nei KPI: `Total spending`, non `TOTAL SPENDING`
  (nota: le `Stat` attuali usano ancora label uppercase; decisione rimandata,
  vedi `docs/tasks/transactions-redesign-frontend.md` § 7).
- In pagine con pochi KPI correlati (es. In | Out | Net in Transactions) le
  `Stat` stanno in **una sola Card** separate da hairline verticali (`border-l`
  sui blocchi della griglia): In e Out occupano la metà sinistra (un quarto
  ciascuno), Net la metà destra. Sotto `xl` il layout si riorganizza (In/Out
  affiancati, Net a tutta riga; sotto `sm` impilate), mai numeri sovrapposti o
  tagliati.
- Card di contenuto: titolo 16–18px/600, descrizione 14px secondaria, poi contenuto.

### Segmented (`components/segmented.tsx`)
- Contenitore incassato `--muted`, `rounded-full`, padding 4px.
- Voce inattiva: 13px medium, `--muted-foreground`.
- Voce attiva: **pillola bianca** con hairline `--border`, ombra minima, testo inchiostro.
  Vale anche per il toggle di periodo (`ALL 5Y 1Y YTD`): nessuna variante scura,
  label sans 13px (niente monospace sui toggle di testo).
- Stessa grammatica per il `TypeToggle`: voce attiva bianca, icona/testo Income in
  `--positive`, Expense in `--destructive`.

### Badge e pillole (`components/ui/badge.tsx`)
- `rounded-full`, 12px medium, fondo tinta soft + testo nel colore forte, senza bordo.
- Mappatura: Income `--positive-soft`/`--positive`; Expense `--destructive-soft`/
  `--destructive`; Active verde; Overdue/Due rosso; Paused/neutral `--muted`/
  `--muted-foreground`; Duplicate neutro.

### Tabelle (`components/ui/table.tsx`)
- Nessun header pesante: label 12–13px in `--faint-foreground` su sfondo trasparente,
  sentence case.
- Righe bianche con separatori hairline `--border` **solo tra le righe dello stesso
  gruppo** (nessun divisore dopo l'ultima riga di un gruppo né sopra una banda data);
  hover `--row-hover`.
- Bande di raggruppamento (data/giorno) su `--row-group` (`bg-row-group`),
  **senza bordi tabella**, con data in 11px sans `--muted-foreground` (non uppercase);
  tra un gruppo e il successivo una riga spaziatrice di ~10px (`h-2.5 p-0`), mai prima
  del primo gruppo, se la pagina raggruppa per data.
- La barra filtri di una lista può stare **dentro la card della tabella** come toolbar
  (padding 12px, senza bordo inferiore: la prima banda separa già), così l'angolo
  arrotondato della card resta pulito.
- Importi a destra in `.font-numeric` (inchiostro, o verde/rosso nelle liste di
  transazioni — vedi Money) con la colonna dimensionata sul contenuto (`w-[1%]`) così
  l'importo resta vicino alle icone; azioni di riga in `--muted-foreground`.
- Checkbox `rounded-md` 16px, bordo `--input`; riga selezionata tinta `--primary-soft`.
### Barre e dot
- **Dot semantico/categoria**: 8px `rounded-full`, colore categoria o semantico, allineato
  con il testo.
- **Barra di ripartizione**: track 4–5px `--muted` `rounded-full`, fill colore categoria
  `rounded-full`; riga composta da dot + nome (14px) + categoria (13px terziaria) + importo
  (numerico, destra) + % (terziaria).
- **Barra composita** (allocazione): segmenti adiacenti, gap 2px, `rounded-full` sul
  contenitore, altezza 8–10px, legenda a dot.

### Dialog
- Pannello bianco, radius 16–20, ombra raised, padding 20–24.
- Titolo 18px/600 + descrizione 14px secondaria; label di campo 13px/500; errori in
  `--destructive` su tinta soft.
- Riga di anteprima dell'operazione su `--muted`, radius 12.
- Footer: `Cancel` outline + azione primaria arancio (o destructive soft per eliminazioni).
- Il `ConfirmDialog` di delete: icona cestino su cerchio `--destructive-soft`, testo
  centrato, azione destructive soft.

### EmptyState (`components/empty-state.tsx`)
- Icona in cerchio `--muted` con icona `--faint-foreground`, titolo 14px/600, sottotitolo
  12–13px terziario, eventuale azione primaria.

### Money (`components/money.tsx`)
- EUR, cifre tabellari, locale di formattazione invariato (`en-US`: `€1,234.56`).
- `signed` mostra `+`/`−`. Nelle viste aggregate (KPI, ripartizioni, totali) gli importi
  restano in **inchiostro**; nelle **liste di transazioni** il colore è ammesso per
  distinguere income/expense (`--positive` / `--destructive`), sempre insieme al segno.

---

## 5. Grafici

Libreria: Recharts via wrapper `components/ui/chart.tsx` (invariato).

- **Assi**: nessuna linea asse, tick 12px `--faint-foreground` numerici; griglia **solo
  orizzontale** `--chart-grid` (dash `3 3` opzionale). Niente griglia verticale.
- **Asse Y**: valori compatti in migliaia (`200k`), anche per lasciare più spazio al
  grafico.
- **Asse X**: etichette `Mmm YYYY` (`Jan 2026`), diradate con `minTickGap` e
  `interval="preserveStartEnd"` così restano leggibili anche su range lunghi (`ALL`).
- **Tratti**: 2px; la serie protagonista può arrivare a 2.5px. Nessuna animazione
  (`isAnimationActive={false}`), coerente con l'attuale.
- **Net worth**: linea arancio `--primary`, sempre (non più "umore" petrolio/argilla), con
  gradiente soft sotto la linea (arancio 18% → 0%).
- **Cash flow**: income `--positive`, expense `--destructive`, net `--primary` (tratteggiata
  o più spessa); nessun fill.
- **Tooltip**: uno solo, quello condiviso (`ChartTooltip`/`ChartTooltipContent`); niente
  tooltip o popup custom. Popover `--popover` con hairline, radius 12, ombra raised,
  testo 12–13px.
- **Ripartizione/classifica**: barre orizzontali sottili con colore categorico e dot di
  legenda; label categoria 12–13px, importi numerici.
- **Allocazione**: barra composita e/o donut classico (buco centrale, **senza gap tra le
  slice**) con spessore ~1/3 del raggio, **senza testo al centro**; legenda
  `dot · nome · importo · %`.
- **Flussi**: sola palette semantica/categorica, nessun arco decorativo; i colori seguono la
  categoria.
- Niente titoli duplicati dentro il grafico: il titolo è della card.

---

## 6. Formati

- **Date**: `YYYY-MM-DD` per input e viste dense; forma estesa `21 September 2026` nelle
  fasce di raggruppamento per giorno e `Mmm YYYY` sugli assi (mai ISO sulle fasce).
- **Money**: EUR via `Money`, cifre tabellari; `signed` per i net (`+€X` / `−€X`).
- **Tipi income/expense**: verde/rosso soft in badge e toggle; nei numeri il segno, non il
  colore.
- **Percentuali**: `.font-numeric`, una cifra decimale nei delta, intere nelle ripartizioni.

---

## 7. Impaginazione e pagine

Non ancora definita: sarà derivata da `docs/design/app1/` in un task dedicato (una pagina
alla volta), poi riportata qui. Le sezioni layout/pagine della versione precedente di questa
guida descrivevano la vecchia UI e sono state rimosse per non contraddire lo stile nuovo.

Principi già fissati che l'impaginazione dovrà rispettare:
- Full-width dopo la sidebar, nessun `max-w` centrale.
- Card e sezioni separate da gap 16/24px; una sola azione primaria per vista.
- Niente titoli di pagina ridondanti quando la voce di navigazione è già attiva.
- Niente dark mode.

---

## 8. Token attesi in `index.css`

```css
@theme inline {
  --font-sans: 'Inter Variable', ui-sans-serif, system-ui, sans-serif;
  --font-numeric: 'JetBrains Mono Variable', ui-monospace, monospace;
  --color-background: #F6F5F2;
  --color-sidebar: #FAF9F7;
  --color-card: #FCFCFB;
  --color-popover: #FCFCFB;
  --color-foreground: #24211F;
  --color-muted: #F0EFEB;
  --color-muted-foreground: #696664;
  --color-faint-foreground: #A09F9F;
  --color-border: #EBEAE5;
  --color-input: #E1E1DE;
  --color-chart-grid: #EFEEE9;
  --color-row-group: #F2F0EB;
  --color-row-hover: #F6F5F2;
  --color-primary: #ED7240;
  --color-primary-foreground: #FFFFFF;
  --color-primary-soft: #FBF3EC;
  --color-positive: #437B36;
  --color-positive-soft: #EAF3E7;
  --color-positive-chart: #53AC7D;
  --color-destructive: #A94440;
  --color-destructive-soft: #F9E9E7;
  --color-chart-1: #4176CF;
  --color-chart-2: #E2A439;
  --color-chart-3: #3D832A;
  --color-chart-4: #D694A3;
  --color-chart-5: #B2B0AD;
  --color-chart-6: #91808A;
  --color-chart-7: #3E8E8E;
  --color-chart-8: #556F9C;
  --radius: 0.75rem;
}
```

Da eliminare: blocco `.dark`, token `petrol/moss/clay/ochre/slate/plum/teal/rust/stone`,
import di Onest e Space Grotesk.

Import dei font in cima a `index.css` (mantiene JetBrains Mono, che sostituisce Onest/Space
Grotesk anche nel ruolo di `--font-mono`):

```css
@import "@fontsource-variable/inter";
@import "@fontsource-variable/jetbrains-mono";
```

`@fontsource-variable/jetbrains-mono` è oggi in `devDependencies`: va spostato in
`dependencies` insieme a Inter, perché è un asset servito in build.

La utility `.font-numeric` diventa:

```css
.font-numeric {
  font-family: var(--font-numeric);
  letter-spacing: -0.01em;
}
```

> Nota: il frontend non contiene business logic. I dati derivati mostrati (composizioni,
> totali, delta) sono calcoli di presentazione su risposte API già esistenti.
