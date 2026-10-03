# Frontend task — Rebrand Console

> **Stato: implementato (2026-10-03).** Fase 0-2 complete: fondamenta (token,
> primitivi, shell), pilota Transactions con filtri data condivisi, tutte le
> pagine migrate. Restano: cleanup Fase 3 (alias/dark/dead code), giro visivo
> finale e commit.
> Riferimenti:
> - `docs/design/ui-style-guide-pynance.md` (guida attuale, clone app2 — da riscrivere)
> - decisioni prese a voce il 2026-10-03 (analisi + approvazione sezioni)

## 1. Obiettivo

Portare Pynance dal linguaggio caldo di app2 (crema, arancio, ombre morbide) a
un linguaggio **neutro da strumento**: superfici bianche/grigie, hairline,
colore solo come informazione, tipografia più compatta. Nessuna modifica al
backend, nessuna business logic: è un intervento di presentazione.

## 2. Decisioni chiave

- **Azione primaria quasi-nera** (`#171717`), non più arancio. L'arancio esce
  dalla palette.
- **Colore solo semantico/informativo**: verde income, rosso expense/errori,
  dot e badge; nessun riempimento decorativo.
- **Numeri in JetBrains Mono** (invariato, richiesta esplicita). La riduzione di
  densità si ottiene su titoli/meta, non sui numeri.
- **Sidebar a sinistra** (invariata come meccanica: collasso + peek), con voce
  attiva a pillola `--muted` e testo inchiostro (stile sub-nav Console).
- **Colonna contenuto centrata `max-w-[1440px]`**; sidebar e hairline fuori
  dalla colonna.
- **Tab di pagina stile Console**: sotto il titolo, attiva con underline 2px
  `#171717`, hairline a chiudere la riga. Sparisce la banda header `h-14`.
- **JetBrains Mono resta anche nei grafici** per tick/valori.

## 3. Token proposti

### Neutri e superfici

| Token | Nuovo | Vecchio (app2) |
|---|---|---|
| `--background` | `#FAFAFA` | `#F6F5F2` |
| `--sidebar` | `#FFFFFF` | `#FAF9F7` |
| `--card` / `--popover` | `#FFFFFF` | `#FCFCFB` |
| `--foreground` | `#171717` | `#24211F` |
| `--muted-foreground` | `#737373` | `#696664` |
| `--faint-foreground` | `#A3A3A3` | `#A09F9F` |
| `--border` | `#E5E5E5` | `#EBEAE5` |
| `--input` | `#D4D4D4` | `#E1E1DE` |
| `--muted` / `--secondary` / `--accent` | `#F5F5F5` | `#F0EFEB` |
| `--row-group` | `#F5F5F5` | `#F2F0EB` |
| `--row-hover` | `#FAFAFA` | `#F6F5F2` |

### Azione e semantica

| Token | Nuovo | Vecchio |
|---|---|---|
| `--primary` | `#171717` | `#ED7240` |
| `--primary-foreground` | `#FAFAFA` | `#FFFFFF` |
| `--selection` | `#2563EB` | — (nuovo) |
| `--positive` | `#15803D` | `#437B36` |
| `--positive-soft` | `#F0FDF4` | `#EAF3E7` |
| `--destructive` | `#DC2626` | `#A94440` |
| `--destructive-soft` | `#FEF2F2` | `#F9E9E7` |
| `--ring` | `#171717` | `#ED7240` |
| `--selection` | `#2563EB` | — (nuovo) |

### Grafici (set cool, da tarare sul pilota)

`--chart-1 #2563EB` · `--chart-2 #0D9488` · `--chart-3 #7C3AED` ·
`--chart-4 #DB2777` · `--chart-5 #D97706` · `--chart-6 #475569` ·
`--chart-7 #65A30D` · `--chart-8 #0891B2` · `--chart-grid #F0F0F0`.

### Sidebar

`--sidebar-border #E5E5E5` · `--sidebar-accent #F5F5F5` ·
`--sidebar-accent-foreground #171717` · `--sidebar-primary #171717`.

### Rimandato

- **`--selection` (`#2563EB`)** è l'azzurro di sistema del Console: marca la
  voce selezionata in menu e select (testo + spunta). Lo riuserà anche lo
  switch iOS quando servirà.
- La palette categorica è l'unico punto da **tarare a schermo sul pilota**
  (saturazioni/ordine possono cambiare).
- Gli alias legacy (`petrol/moss/clay/ochre/slate/plum/teal/rust/stone`) e la
  variante `dark` restano finché non tutte le pagine sono migrate; rimozione
  nel cleanup finale.

## 4. Tipografia

Scala Console, più compatta. Inter per la UI, JetBrains Mono per ogni cifra.

| Ruolo | Ora | Nuovo |
|---|---|---|
| Titolo pagina | 24/600 | 20/600 |
| Titolo card/sezione | 16/600 | 15/600 |
| Corpo, celle, form | 14–15 | 13.5–14 |
| Label campo | 13/500 | 13/500 |
| Meta, label tabella | 12–13 | 12.5–13, `--faint-foreground` |
| KPI | 28–30/700 mono | 26/650 mono |
| Numero hero | 36–40/500 mono | 32/500 mono |
| Micro-titolo sidebar | 11/600 uppercase faint | invariato |

## 5. Forme, elevazione, ritmo

- **Radius**: card/container 12, dialog 16, bottoni/input/select 10, badge e
  pillole 6 (non più full), checkbox 4, chip `code` 4.
- **Ombre**: card solo hairline, **nessuna ombra**; popover/dialog
  `0 10px 30px rgb(0 0 0 / 0.08)`; overlay `rgb(23 23 23 / 0.30)`.
- **Focus**: outline 2px `#171717` offset 2; input in focus con bordo
  `#171717`. Mai ring colorati.
- **Densità**: righe tabella **36px** (≈45px sulle righe con controlli inline), padding celle 10–14px, gap sezioni 16–20px, padding card 20px.

## 6. Shell

- **Sidebar**: bianca, hairline destra; voci 13/500 `--muted-foreground`,
  icona 16 `--faint-foreground`; hover pill `--muted`; attiva pill `--muted` +
  testo/icona `--foreground`. User menu in basso con avatar quadrato 20px
  quasi-nero + email; "Sign out" rosso. Alert dot default asset: rosso.
- **Header di pagina**: nel flusso (niente banda): titolo 20/600, descrizione
  opzionale 13 muta, azioni a destra (outline + icon-button). Tab sotto il
  titolo con underline; hairline a chiudere.
- **Contenuto**: colonna centrata `max-w-[1440px]`, `px-6` (`md:px-8`), fondo
  `#FAFAFA`.

## 7. Componenti

- **Card**: bianca, hairline, radius 12, padding 20, senza ombra; titolo
  15/600, descrizione 13 muta.
- **Button**: primary quasi-nero (hover `#262626`, active `translate-y-px`);
  outline bianco + hairline + ombra `0 1px 2px rgb(0 0 0 / 0.04)`; ghost
  hover `--muted`; destructive soft; **icon-button outline 36px** come
  standard utility.
- **Input/Select**: h-9/10, radius 10, bordo `--input`, focus `#171717`;
  search con icona a sinistra.
- **Tabella**: unico contenitore bordato radius 12; header **12.5/500 faint
  sentence case su banda `--muted/50`** (≈#FAFAFA) + hairline; righe 36px con
  hairline; hover `--row-hover`; **footer interno** (sx "N transactions/rows"
  12.5 faint, dx pager Prev/Next quando esiste); toolbar dentro la card;
  **celle a due righe** dove c'è informazione secondaria; chip `code` inline
  (bordo, radius 4, mono 12, fondo `--muted`); bande gruppo `--row-group` dove
  la pagina raggruppa per data.
- **Badge**: radius 6, 12/500, tinta soft + testo forte. **Dot di stato 6px +
  label neutra** per stati (due/paid/paused…).
- **Empty state**: box bordo tratteggiato radius 10, fondo `#FAFAFA`, icona
  faint + testo 13–14 muto + eventuale azione inline sottolineata. Sostituisce
  i "No … yet" testuali ovunque.
- **Setting rows**: card con righe titolo 13.5/600 + descrizione 13 muta a
  sinistra, controllo a destra, hairline tra le righe; heading 13.5/600.
  Sub-nav verticale a icone con voce attiva a pillola `--muted`.
- **Filtri data** (un solo linguaggio in tutte le pagine): bottone outline
  `[icona calendario] etichetta [chevron]` che apre un menu Console con voci
  e spunta in azzurro `--selection`; **la voce selezionata resta azzurra
  anche in hover/highlight** (override espliciti: i menu base colorano
  l'highlight con `accent-foreground`). **`PeriodFilter`** (Dashboard, Reports):
  Year to date · All time · separatore · anni **solo con transazioni**
  (dalla trend all-time, `lib/period.ts` per tipo/range/label).
  **`MonthFilter`** (Transactions): selectbox anno (stessi anni con
  transazioni, valore azzurro) + 12 mesi. `Segmented` non è più usato.
- **Grafici**: griglia hairline; serie net worth **quasi-nera** `#171717` con
  gradiente grigio soft; cash flow income verde, expense rosso, net
  quasi-nero; categorie dalla palette cool; tooltip popover bianco hairline.
- **Dialog/Dropdown/Checkbox**: dialog radius 16 + ombra raised + footer con
  hairline; dropdown bianco radius 10, item 13.5, destructive rosso; checkbox
  16 radius 4, checked `#171717`.
- **Toast**: bianco + hairline + ombra raised, niente riempimenti colorati.

## 8. Adattamenti per pagina

- **Dashboard**: card neutre; donut cool; net worth quasi-nero; delta pill
  radius 6; KPI 26 / hero 32; filtro periodo Console condiviso.
- **Transactions**: **header visibili** (Date · Description · Category ·
  Amount · Actions) e **colonna Date** in prima posizione, formato
  **`Sep 08, 2026`** — niente più bande giorno. **Toolbar fuori dalla tabella**
  ma **ravvicinata** (toolbar e tabella formano un gruppo con gap 8px), ordine:
  **search libera · MonthFilter · Filter · refresh**. Nell'header di pagina
  solo **Add transaction**. **MonthFilter**:
  calendario + mese corrente; nel menu un **selectbox per l'anno** e i 12 mesi
  dell'anno scelto. **Filter categorie**: menu raggruppato Expense/Income con
  spunta. **Voce selezionata in azzurro `--selection`** (testo + spunta).
  Download in futuro. Footer conteggio. Importi restano verde/rosso.
- **Assets (Accounts)**: card bucket neutre; empty state tratteggiati;
  donut allocation cool.
- **Transfers**: tabella come Transactions: **header visibili** (Date ·
  Description · From → To · Amount · Actions), **colonna Date
  `Sep 08, 2026`**, niente bande giorno, footer conteggio.
- **Recurring/Categories**: tabelle con **header visibili** + footer conteggio;
  badge radius 6; empty dashed; label di sezione del reconcile in sentence
  case 13 muta.
- **Reports**: tab underline sotto il titolo; filtro periodo Console (**Year to
  date · All time · anni con transazioni**, voce attiva azzurra
  `--selection`); grafici recolored (net quasi-nero).
- **Import**: dropzone allineato ai token; pager con icon-button; tabella in
  container.
- **Settings**: diventa setting rows; **stringhe tradotte in inglese** (unica
  pagina fuori lingua).

## 9. Rollout (approccio A)

1. **Fondamenta**: token `index.css`, primitivi `ui/*`, shell (`layout`,
   `sidebar-nav`, nuovo `page-header` con tab underline), condivisi (`stat`,
   `badge`, `empty-state`, `segmented`, `type-toggle`, dialog/table).
2. **Pilota Transactions**: validazione visiva insieme; qui si tarano palette
   grafici e densità.
3. **Resto a gruppi**, con check visivo a ogni giro: (a) Dashboard,
   (b) Assets, (c) Recurring + Categories, (d) Reports, (e) Import + Settings.
4. **Cleanup**: alias legacy e variante `dark`, `lib/prefetch.ts`,
   `accounts-table.tsx` se resta inutilizzato — solo su autorizzazione.

## 10. Docs e verifica

- Riscrittura di `docs/design/ui-style-guide-pynance.md` sulla lingua validata
  dal pilota (non più clone app2). Task per pagina aggiornati durante i lavori.
- Per ogni giro: `npm run build` + `npm run lint` + check visivo dell'utente
  (screenshot come da tecnica già nota).
- Niente ADR: non è una decisione architetturale.

## 11. Fuori scope

- Paginazione delle liste lunghe (Transactions/Categories): il footer mostra
  il conteggio, il pager arriva quando esisterà la paginazione.
- Componente switch (vedi §3).
- Qualsiasi modifica a backend, API, business logic.
