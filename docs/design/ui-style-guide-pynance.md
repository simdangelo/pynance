# UI Style Guide — Pynance

> Sistema di design del frontend Pynance: linguaggio **neutro da strumento**
> ispirato al Console (OpenCode) — superfici bianche/grigie, hairline, colore
> solo come informazione, tipografia compatta. Due paletti espliciti del
> progetto: i **numeri usano JetBrains Mono** e la **navigazione resta una
> sidebar a sinistra** (niente topbar).
> **Solo light mode**: la variante dark non fa parte del design.
>
> L'impaginazione e i pattern per pagina sono nella § 7.

Tutti i valori sono token (CSS custom properties) in `frontend/src/index.css`
(Tailwind v4, `@theme`). I componenti citati sono in `frontend/src/components/`
e `frontend/src/components/ui/`.

---

## 1. Palette

Neutra: mai nero puro, superfici separate da hairline. Il colore compare solo
come informazione (semantica o selezione), mai come decorazione.

### Neutri (fondi e superfici)

| Token | Hex | Uso |
|---|---|---|
| `--background` | `#FAFAFA` | Fondo pagina |
| `--sidebar` | `#FFFFFF` | Sidebar, staccata da hairline |
| `--card` / popover | `#FFFFFF` | Card, pannelli, dropdown, dialog |
| `--foreground` | `#171717` | Inchiostro primario |
| `--muted-foreground` | `#737373` | Testo secondario |
| `--faint-foreground` | `#A3A3A3` | Testo terziario: label, meta, tick, placeholder |
| `--border` | `#E5E5E5` | Hairline di card, tabelle, separatori |
| `--input` | `#D4D4D4` | Bordo di input, checkbox, controlli |
| `--muted` / `--secondary` / `--accent` | `#F5F5F5` | Superfici incassate, hover menu, selezione |
| `--row-group` | `#F5F5F5` | Bande di gruppo nelle tabelle raggruppate |
| `--row-hover` | `#FAFAFA` | Hover delle righe di tabella |
| `--chart-grid` | `#F0F0F0` | Griglia orizzontale dei grafici |

### Azione e semantica

| Token | Hex | Uso |
|---|---|---|
| `--primary` | `#171717` | Azioni primarie (bottoni), hover `#262626` |
| `--primary-foreground` | `#FAFAFA` | Testo su primary |
| `--selection` | `#2563EB` | **Azzurro di sistema**: voce selezionata in menu/select (testo + spunta); futuro switch |
| `--positive` / soft | `#15803D` / `#F0FDF4` | Income, stati positivi, badge |
| `--destructive` / soft | `#DC2626` / `#FEF2F2` | Expense, errori, overdue, eliminazioni |
| `--ring` | `#171717` | Focus outline |

### Serie dati (palette categorica cool)

| Token | Hex | |
|---|---|---|
| `--chart-1` | `#2563EB` | blu |
| `--chart-2` | `#0D9488` | teal |
| `--chart-3` | `#7C3AED` | violetto |
| `--chart-4` | `#DB2777` | rosa |
| `--chart-5` | `#D97706` | ambra (anche tono "attention") |
| `--chart-6` | `#475569` | ardesia |
| `--chart-7` | `#65A30D` | lime |
| `--chart-8` | `#0891B2` | ciano |

### Regole d'uso
- **Il primary è azione**: bottoni primari, mai decorazione. Un solo bottone
  primario per vista.
- **Il colore è informazione**: verde income/positivo, rosso expense/errori/
  overdue/delete, azzurro `--selection` per la voce selezionata in menu e
  select. Nessun riempimento decorativo.
- **I numeri restano in inchiostro**, salvo le liste di transazioni (importi
  `--positive`/`--destructive` insieme al segno) e i testi esplicitamente
  semantici ("Overdue", errori).
- **La palette categorica non è semantica**: serve a distinguere serie e
  categorie (asset, liquidity), non a indicare buono/cattivo.

---

## 2. Tipografia

Due famiglie: **Inter** per la UI e **JetBrains Mono** per le cifre (utility
`.font-numeric`, tracking `-0.01em`). Niente serif. La mono è monospaziata:
colonne allineate senza `tabular-nums`.

| Ruolo | Dimensione | Peso | Colore |
|---|---|---|---|
| Titolo pagina | 20px | 600 | primario |
| Numero hero (Overview) | 32px | 500 | primario, numerico |
| Valore KPI / Stat | 26px | 650 | primario, numerico |
| Titolo card/sezione | 15px | 600 | primario |
| Corpo, celle, form | 13.5–14px | 400 | primario/secondario |
| Label di campo | 13px | 500 | primario |
| Label KPI / StatLabel | 13px | 500 | `--muted-foreground`, sentence case |
| Meta, label tabella, tooltip | 12.5–13px | 400–500 | `--faint-foreground` |
| Micro-titolo sidebar | 11px, tracking `0.06em`, uppercase | 600 | terziario |

Regole: **sentence case** ovunque (l'uppercase è solo dei micro-titoli
sidebar); titoli `tracking-tight`; ogni valore numerico usa `.font-numeric`.

---

## 3. Forme, elevazione, spaziatura

- **Radius**: card e container 12; dialog 16; bottoni/input/select 10; badge e
  pillole 6; chip `code` 4; switch full.
- **Ombre**: card **solo hairline** (nessuna ombra); popover/dialog/peek
  `0 10px 30px rgb(0 0 0 / 0.08)`; bottoni outline `0 1px 2px rgb(0 0 0 / 0.04)`;
  overlay dialog `rgb(23 23 23 / 0.30)`.
- **Focus**: regola globale `:focus-visible` → outline 2px `--ring` con offset
  2. I menu/select usano l'**highlight** (`data-highlighted`, fondo `--accent`)
  e sopprimono l'outline interno (`outline-hidden`/`outline-none`).
- **Selezione azzurra**: la voce selezionata usa `text-selection` **anche in
  hover/highlight e focus** (override espliciti; attenzione: Tailwind compila
  `data-selected:` solo come `[data-selected=true]`, mentre Base UI emette
  attributi vuoti → usare `data-[selected]:`).
- **Spaziatura**: base 4px; padding card 20px; gap card 16px, sezioni 20px;
  contenuto in colonna centrata `max-w-[1440px]`.
- **Densità**: righe tabella **36px** (`px-4 py-2`), header 40px; sulle righe
  con controlli inline ~45px.

---

## 4. Componenti

### Button
- **Primary**: fondo `--primary` (quasi-nero), hover `#262626`, testo bianco;
  h-9, px-3, radius 10, 14px medium; active `translate-y-px`.
- **Outline**: bianco, bordo `--input`, ombra 4%; hover `--muted`.
- **Ghost**: trasparente, hover `--muted`; azioni di riga.
- **Destructive**: tinta soft `--destructive-soft`, testo `--destructive`.
- **Icon-button**: outline 36px (`size-9`) come standard utility (refresh,
  filtri); varianti `icon-sm` 32px per pager.
- Icona 16px a sinistra, gap 6px.

### Input, Select, Search
- Bianchi, bordo `--input`, radius 10, h-9; focus bordo `--ring` + outline
  globale. Placeholder e icone `--faint-foreground`. Search con icona a
  sinistra (`pl-9`).

### Card
- Bianca, hairline, radius 12, padding 20, senza ombra. Titolo 15/600,
  descrizione 13 muta. Card con contenuto full-bleed (tabelle, setting rows):
  `py-0` + `CardContent p-0`.

### Tabella
- Unico contenitore bordato radius 12; **header visibile** su banda
  `--muted/50` (≈#FAFAFA), label 12.5/500 `--faint-foreground`, sentence case,
  hairline sotto; righe 36px con hairline; hover `--row-hover`.
- **Footer interno**: a sinistra "N rows/transactions" 12.5 faint, a destra
  spazio per il pager.
- **Celle a due righe** dove c'è informazione secondaria; **chip `code`**
  inline (bordo, radius 4, mono 12, fondo `--muted`).
- Tabelle raggruppate (es. Reconcile) usano bande `--row-group`.
- Toolbar filtri: **fuori dalla card ma ravvicinata** (gruppo con gap 8px).

### Filtri data (linguaggio unico)
- Trigger outline `[icona calendario] etichetta [chevron]`; menu Console con
  voci, spunta e voce attiva in `--selection` (anche in hover).
- **`PeriodFilter`** (Dashboard, Reports): Year to date · All time ·
  separatore · anni **solo con transazioni** (da `useAllTimeTrend`,
  `lib/period.ts`).
- **`MonthFilter`** (Transactions): selectbox anno (stessi anni, valore
  azzurro) + 12 mesi.

### Badge, dot, barre
- Badge: radius 6, 12/500, tinta soft + testo forte, senza bordo.
- Dot di stato/categoria: 8px (6px nelle tabelle), colore semantico/categoria.
- Barre: track 4–5px `--muted` rounded-full, fill colore categoria.

### EmptyState
- Box **bordo tratteggiato** radius 10, fondo `--background`, icona faint,
  titolo 13.5/600, sottotitolo 13 muto, azione **link sottolineato**.
  Dentro card full-bleed: inset `m-4`.

### Setting rows
- Heading di sezione 13.5/600; card `py-0` con `divide-y`; riga `p-5`:
  titolo 13.5/600 + descrizione 13 muta a sinistra, controllo a destra.

### Dialog, Dropdown, Checkbox, Toast
- Dialog: radius 16, hairline + ombra raised, footer con hairline (senza
  fondo), titolo 16/600.
- Dropdown/Select menu: radius 10, item radius 8, highlight `--accent`,
  item destructive in rosso; label di gruppo `role="presentation"`.
- Checkbox 16px radius 4, checked `#171717`; focus outline globale.
- Toast: bianco + hairline + ombra raised; il focus ring di Sonner resta
  attivo (la regola ombra è `:not(:focus-visible)`).

---

## 5. Grafici

Recharts via wrapper `components/ui/chart.tsx`.

- **Assi**: nessuna linea, tick 12px `--faint-foreground` numerici; griglia
  **solo orizzontale** `--chart-grid` (dash `3 3`). Y compatta (`200k`), X
  `Mmm YYYY` diradata.
- **Tratti**: 2px (net 2.5px); nessuna animazione; marker `r=2.5` solo con
  ≤24 punti.
- **Net worth**: linea `--foreground` (quasi-nera) con gradiente grigio soft
  sotto. **Cash flow**: income `--positive`, expense `--destructive`, net
  `--foreground` (2.5px).
- **Ripartizioni**: barre orizzontali con colore categorico; donut (allocation)
  dentro una **Card**, buco centrale, senza gap tra le slice, "Other" in
  `--muted-foreground`.
- **Tooltip**: quello condiviso, popover bianco con hairline e ombra raised.

---

## 6. Formati

- **Date**: `YYYY-MM-DD` per input; **`Sep 08, 2026`** nelle tabelle;
  `Mmm YYYY` sugli assi.
- **Money**: EUR via `Money`, mono; `signed` per i net (`+€X` / `−€X`).
- **Tipi**: verde/rosso soft in badge e toggle; nelle liste di transazioni
  colore + segno sull'importo.
- **Percentuali**: `.font-numeric`, una cifra decimale nei delta, intere nelle
  ripartizioni.

---

## 7. Impaginazione e pagine

- **Sidebar** a sinistra (collassabile con peek): bianca, hairline destra;
  voce attiva pillola `--muted` + testo inchiostro; badge recurring
  `--destructive-soft`/`--destructive`; avatar utente quadrato 20px quasi-nero.
- **Contenuto**: colonna centrata `max-w-[1440px]`, `px-6 md:px-8`.
- **Header di pagina**: titolo 20/600 + sottotitolo 13 muto, azioni a destra
  (riga `min-h-9` per altezza stabile tra tab); **tab di pagina** sotto il
  titolo, attiva con underline 2px `--foreground`, hairline a chiudere.
- **Pattern per pagina**:
  - **Transactions**: tabella con header visibili e colonna Date; toolbar
    search · MonthFilter · Filter · refresh; footer conteggio.
  - **Assets**: donut allocation in Card; bucket raggruppati per liquidity
    category; Transfers con tabella in stile Transactions.
  - **Recurring/Categories**: tabelle con header visibili + footer; badge.
  - **Reports**: tab underline; filtro periodo Console; net quasi-nero.
  - **Import**: wizard a 3 step, dropzone tratteggiato, pager icon-button.
  - **Settings**: setting rows in inglese, sezioni General/Telegram.
- Principi: niente titoli ridondanti quando la voce nav è attiva; gap 16/20px;
  una sola azione primaria per vista; niente dark mode.

---

## 8. Token in `index.css`

```css
@theme inline {
  --font-sans: 'Inter Variable', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono Variable', ui-monospace, monospace;
  --color-background: #FAFAFA;
  --color-sidebar: #FFFFFF;
  --color-card: #FFFFFF;
  --color-popover: #FFFFFF;
  --color-foreground: #171717;
  --color-muted: #F5F5F5;
  --color-muted-foreground: #737373;
  --color-faint-foreground: #A3A3A3;
  --color-border: #E5E5E5;
  --color-input: #D4D4D4;
  --color-chart-grid: #F0F0F0;
  --color-row-group: #F5F5F5;
  --color-row-hover: #FAFAFA;
  --color-primary: #171717;
  --color-primary-foreground: #FAFAFA;
  --color-selection: #2563EB;
  --color-positive: #15803D;
  --color-positive-soft: #F0FDF4;
  --color-destructive: #DC2626;
  --color-destructive-soft: #FEF2F2;
  --color-chart-1: #2563EB;
  --color-chart-2: #0D9488;
  --color-chart-3: #7C3AED;
  --color-chart-4: #DB2777;
  --color-chart-5: #D97706;
  --color-chart-6: #475569;
  --color-chart-7: #65A30D;
  --color-chart-8: #0891B2;
  --radius: 0.625rem; /* sm 6 · md 8 · lg 10 · xl 12 · 2xl 16 */
}
```

Nel `:root`: gli stessi valori più `--font-numeric`, i token sidebar, `--ring`
e `--selection`. Rimosse le varianti dark e gli alias legacy.

Import dei font in cima a `index.css`:

```css
@import "@fontsource-variable/inter";
@import "@fontsource-variable/jetbrains-mono";
```

> Nota: il frontend non contiene business logic. I dati derivati mostrati
> (composizioni, totali, delta) sono calcoli di presentazione su risposte API
> già esistenti.
