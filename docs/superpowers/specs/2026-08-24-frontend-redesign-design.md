# Pynance Frontend Redesign — Design Spec

**Date:** 2026-08-24
**Status:** Approved (brainstorm phase complete)
**Scope:** Redesign the 5 existing pages + restructure the Overview into sub-tabs. No new backend features, no auth, no settings, no net-worth/allocation dedicated pages (those report views live inside Overview).

---

## 1. Goals & principles

The current frontend is rough and disjointed: a top horizontal nav, a centered `max-w-5xl` column, and every page following the same "PageHeader + stacked cards" rhythm with no hierarchy. This spec replaces that structure entirely.

The redesign is guided by four principles (from the project owner):

1. **System cohesion & unified language** — every page, section, and widget speaks the same visual and functional language. Components feel natively integrated, not arbitrarily placed together.
2. **Information hierarchy & visual weight** — important data and actions have stronger visual resonance than secondary details. The user's eye follows an intentional path.
3. **Logical information architecture** — clear, topic-focused pages. Neither too many fragmented views nor too few overloaded screens. Commands and data arranged logically and predictably.
4. **Unconstrained layout redesign** — the existing layout is discarded. This spec proposes a completely new arrangement from scratch.

A secondary principle, discovered during brainstorming:

5. **Workspaces vs. reports are separated.** A finance app has two kinds of screens: *workspaces* (where the user does things — record, edit, delete) and *reports* (where the user reads things — trends, breakdowns, allocations). The current design conflates them by putting reports (spending chart, summary cards) inside a workspace (Transactions). This spec separates them: reports live in the Overview; workspaces stay focused on doing. A workspace may keep a *small contextual summary* ("while you're working, here's where you stand") but loses full reports.

Reference inspiration: **Wealthfolio** — for its sense of order, structural clarity, and seamless UI/UX execution. Pynance does not adopt Wealthfolio's complexity or feature breadth, only its structural discipline. Notably, both apps share the same stack (shadcn/ui, Recharts, TanStack Query), so the design language translates naturally.

---

## 2. Scope

**In scope:**
- Redesign all 5 existing pages: Overview, Transactions, Recurring, Assets, Transfers, Categories (6 total — Overview has sub-tabs).
- New app shell: left sidebar navigation replacing the top horizontal nav.
- Overview restructured into two sub-tabs: "Net worth" and "Cash flow".
- "Due now" action queue moves from Overview to the Recurring page, with a count badge on the Recurring sidebar item.
- Transactions page loses its spending-by-category chart (moved to Overview → Cash flow) and keeps only a small contextual summary strip.

**Out of scope (deferred / not built yet):**
- Visual style layer (color palette, typography, card styling, shadows, gradients). Decided in principle (tinted hero + soft elevation, light mode, shadcn defaults) but applied during implementation, not part of this structural spec.
- Auth / login screens (Module 5, not built).
- Settings / preferences page (not built).
- Dedicated Net worth or Allocation pages as separate sidebar entries (they live as Overview sub-tabs).
- Dark mode (deferred behind a future theme toggle).
- New backend APIs. All data sources referenced in this spec already exist in `backend/pynance/api/routers/`.

---

## 3. App shell & navigation

### 3.1 Shell (desktop, ≥1024px)

A persistent **left sidebar** (width: 240px, fixed position, `bg-white`, right border `border-r border-border`) holds:

- **Brand header** (56px tall): `◆ Pynance` wordmark, padded `px-18px`. Bottom border `border-b border-border-light`.
- **Nav items** (top group, in fixed order):
  1. Overview (icon: LayoutDashboard)
  2. Transactions (icon: ArrowLeftRight)
  3. Recurring (icon: Repeat) — with a count badge when items are due
  4. Assets (icon: Landmark)
  5. Transfers (icon: ArrowRightLeft)
- **Footer group** (separated by `border-t`): Categories (icon: Settings or Tag). Visually muted (`text-muted-foreground`, smaller font) to read as configuration, not a daily workspace.

Each nav item: icon + label, `px-3 py-2 rounded-md text-sm`, active state `bg-accent text-accent-foreground font-medium`, inactive `text-muted-foreground hover:bg-accent/50 hover:text-foreground`. These are the same shadcn token classes the current top nav uses — relocated, not restyled.

### 3.2 Recurring "due" badge

The Recurring nav item displays a small count badge (amber background, amber text, pill-shaped) showing the number of recurring templates where `due == true`. The badge appears whenever the count is > 0 and is hidden when 0. This surfaces the action queue from anywhere in the app without putting the queue itself on the dashboard.

The badge value comes from the existing `recurring_templates` list endpoint — the frontend counts rows where `due === true`. No new API needed.

### 3.3 Mobile (<1024px)

The sidebar is hidden. A slim top bar (brand + hamburger button only) replaces it. Tapping the hamburger opens the same sidebar as a drawer: an overlay (`bg-black/40`) over the page, with the sidebar sliding in from the left. All nav items are identical to the desktop sidebar. Tapping a nav item navigates and closes the drawer.

The drawer reuses the same component as the desktop sidebar — same items, same order, same footer — rendered in a different container. No separate mobile nav model.

### 3.4 Content area

`flex-1`, `max-w-6xl mx-auto px-6 py-8`, own scroll. The wider max-width (vs. current `max-w-5xl`) gives the Overview's 2:1 grids room to breathe. Every page renders inside this shell; no page brings its own header or nav.

### 3.5 Consistency rule

Every page renders inside this shell. No page-level headers or nav bars. The only thing that changes between pages is the content inside the main area. Sub-tabs (Overview only) live inside the content area, below the page header.

---

## 4. Information architecture

### 4.1 Locked structure

**Flat 5 sidebar entries + 1 footer entry:**

```
Overview          ← has sub-tabs: "Net worth" | "Cash flow"
Transactions      ← pure workspace
Recurring         ← Due now action queue + templates table (badge in sidebar)
Assets            ← totals-by-type strip + table
Transfers         ← mini summary + filters + table
─── (footer) ───
Categories        ← config: add form + list
```

### 4.2 Why this structure

- **Transfers is elevated to its own top-level page** (it was wedged inside Assets in the current design). Transfers is a log of money movements between assets — a distinct job from managing asset records.
- **Categories is demoted to a sidebar footer entry.** Categories is taxonomy configuration, not a daily workspace. Promoting it to a peer of Transactions overweighted it.
- **Overview has sub-tabs, not separate sidebar entries.** Net worth and Cash flow are reports, not workspaces — they would compete with Transactions/Assets if promoted to top-level. Sub-tabs keep the sidebar flat 5 while separating the two report concerns (wealth position vs. cash flow over time).
- **No grouping labels** (e.g. "Activity" / "Wealth"). With only 5 items, grouping into 2 sections of 2 adds a label layer for little navigational payoff. Flat is honest at this scale.

### 4.3 Workspaces vs. reports

| Page | Kind | Job |
|---|---|---|
| Overview → Net worth | Report | "Where do I stand" — wealth, trend, allocation |
| Overview → Cash flow | Report | "How is the period going" — income vs expense over time, category breakdown |
| Transactions | Workspace | Record/edit/delete transactions |
| Recurring | Workspace (+ action queue) | Manage templates, record due occurrences |
| Assets | Workspace | Manage asset records |
| Transfers | Workspace | Record/edit/delete transfers |
| Categories | Config | Manage taxonomy |

A workspace may include a small contextual summary (Transactions has a one-line "in $X · out $Y · net $Z" for the selected month — context for editing, not analysis). Full reports (charts, trends, comparisons) live only in Overview. The remaining "duplication" is intentional and bounded: same data, different job, different presentation.

---

## 5. Page specs

### 5.1 Overview

The Overview page has a page header ("Overview", subtitle varies by tab) and a **sub-tab bar** directly below it. Two tabs: **Net worth** and **Cash flow**. The tab bar is `border-b` with the active tab using a 2px bottom border in `tab-active` color; inactive tabs are `text-muted-foreground`.

Tabs are URL-addressable so a refresh preserves the active tab and the browser back button works. The default tab is **Net worth**. The default range selector on both tabs is **ALL** (not YTD). Exact URL structure (nested routes `/overview/net-worth` vs. query param `?tab=net-worth`) is an open implementation question — see §8.3.

#### 5.1.1 Net worth tab

Subtitle: "Where you stand — wealth, allocation, trend."

Layout, top to bottom:

1. **Hero card** (full width, tinted — `bg-sky-50` with `border-sky-200`, heavier border 1.5px).
   - Label: "Net worth" (uppercase, small, muted).
   - Value: total net worth, large (32px), bold, `text-sky-900`. Tabular-nums.
   - Delta line: a pill badge ("+4.5%") + "+$2,060 this month" text, `text-sky-700`, 12px.
   - Data: derived from the existing `assets.list` endpoint (sum of `balance`). The "this month" delta is derived by comparing against the `net-worth-trend` endpoint's latest point vs. the prior month — no new API.

2. **Net worth trend card** (full width).
   - Card title: "Net worth trend" + range selector (right-aligned): ALL / 5Y / 1Y / YTD. **Default: ALL.** Button group, active button `bg-primary text-white`.
   - Chart: line chart, `min-height: 280px`. X axis = month (YYYY-MM), Y axis = amount. Single line, `stroke: var(--color-primary)`, `strokeWidth: 2`, `dot: false`, `isAnimationActive: false`.
   - Data: `assets.netWorthTrend(start, end)` where `start`/`end` are derived from the selected range (ALL → 2000-01-01 to today, 5Y → today-5y to today, 1Y → today-1y to today, YTD → Jan-1 to today).
   - Empty state: "No net worth history in this range."
   - Error state: "Failed to load net worth." (`text-destructive`)
   - Loading state: "Loading…" (`text-muted-foreground`)

3. **Allocation card** (full width — single column, not 2:1, on this tab).
   - Card title: "Allocation".
   - Content: donut chart (left) + legend list (right), in a flex row.
   - Donut: Recharts `<PieChart>` with inner donut (`innerRadius: 55`, `outerRadius: 85`), no animation. Segments colored by asset type: Liquid `#0284c7`, Savings `#059669`, ETF `#d97706`. Zero-balance types are filtered out.
   - Legend: one row per asset type with a color swatch, the type name, percentage (`pct%`), and the balance value (tabular-nums, bold).
   - Data: derived from `assets.list` — group by `asset_type`, sum `balance`.
   - Empty state: "No assets yet."

**Why single-column on Net worth tab (not 2:1 as in earlier mockups):** the trend chart is a time series that wants full width to read, and the allocation donut is small enough that a 2:1 grid would leave it awkwardly tall. Stacking gives each its own full-width row. The Cash flow tab follows the same stacked full-width rhythm for its three cards (trend, month table, category breakdown) — the earlier 2:1 mockups for these tabs were superseded in favor of uniform full-width cards.

#### 5.1.2 Cash flow tab

Subtitle: "Income vs expense across time."

Layout, top to bottom — **every widget respects the selected range** (the range selector drives both cards; the category card additionally supports a per-month drill-down):

1. **Cash flow chart card** (full width, heavy border 1.5px, white background — *not* tinted). This is the visually-heaviest card on the tab (the chart is the headline here), but it does **not** use the tinted hero variant — that treatment is reserved for the Net worth tab's hero number. The distinction: on Net worth, a *number* is the headline (tinted hero); on Cash flow, a *chart* is the headline (heavy-bordered plain card).
   - Header row: card title "Cash flow" (left) + range selector (right): ALL / 5Y / 1Y / YTD. **Default: ALL.**
   - Chart: line chart, `min-height: 320px`. **Three lines** — the chart is the single "all months in a single view" of income, expense, and net: income (`stroke: #059669`, positive, above the axis), expense (`stroke: #e11d48`, **mirrored negative below the axis** — an outflow), net (`stroke: #0284c7`). X axis = month (YYYY-MM), Y axis = signed amount. `dot: false`, `isAnimationActive: false`. Legend below the chart (ChartLegend).
   - **Month drill-down:** clicking a month on the chart sets it as the active month for the Spending by category card below. A dashed `ReferenceLine` at the active month's x-position highlights the selection. Clicking an empty area does nothing.
   - Data: `transactions.trend(start, end)` where `start`/`end` come from the range selector. Expense points are negated (`expense: -Number(point.expense)`); `net = income - expense`.
   - **Why no month-by-month table:** an earlier design added a per-month income/expense/net table, but on the "ALL" range it produced hundreds of rows. The project owner rejected it. The chart is the single view of all months' income, expense, and net; the drill-down answers "what happened in a specific month" without a giant table.
   - Empty state: "No activity in this range."
   - Error state: "Failed to load cash flow."

2. **Spending by category card** (full width).
   - Card title: "Spending by category · {label}" where `label` is either the range label (ALL → "All time", 5Y → "Past 5 years", 1Y → "Past year", YTD → "Year to date") for the **range total**, or the drilled-down month's name (e.g. "August 2026") when a month is selected. **The default view is the range total — the breakdown is aggregated over the same range the trend shows, not a single month.** When a month is drilled down from the chart, the card shows that month's breakdown and a ghost "All months" button (top-right) resets to the range total.
   - Chart: horizontal bar chart (categories on Y axis, amount on X axis). Sorted descending by amount. `isAnimationActive: false`. Horizontal bars (rather than a donut) because they read better when there are many categories and support readable labels without a separate legend. **Every category label is always rendered** (`interval={0}` on the category axis — Recharts otherwise skips ticks when there are many categories); long names are truncated with an ellipsis and show the full name on hover. The chart height grows with the number of categories (`max(280, n × 32)px`) so labels never overlap.
   - Data (range total): `transactions.trendByCategory(start, end)` (already range-aware — returns per-category monthly points), filtered to expense categories via the `categories.list` data (`transaction_type === "expense"`), each category's points summed to a range total. Zero/negative totals dropped. Amounts are positive because ADR 0001 stores amounts unsigned; direction comes from `transaction_type`. **No backend change needed.**
   - Data (drilled-down month): `transactions.summaryByCategory("expense", year, month)` — the existing single-month endpoint. The active month is only applied while it is within the current range; changing the range clears the drill-down.
   - Empty state: "No spending in this range." / "No spending this month."
   - Error state: "Failed to load spending."

**Consistency principle (this tab):** the range selector is the single source of truth. The cash-flow chart and the category breakdown both answer the same question over the same period. There is deliberately no "current month" card on this tab — a single month is just the latest point on the trend, and the drill-down reaches it on demand. This is the project owner's explicit requirement after reviewing two earlier implementations (the first mixed a range-scoped trend with a current-month-only category breakdown; the second added a month table that produced hundreds of rows on "ALL").

**Sign convention (whole app):** amounts are stored unsigned/positive (ADR 0001), so direction is a *presentation* concern resolved at display time. Expenses are always shown as **negative** (`-€84.20`) and income as positive (`€5,200`); net is shown with its true sign. The shared `Money` component does **not** force a `+` prefix — callers pass a negative value for expenses (see §6).

#### 5.1.3 Tab switching

Tabs are controlled by URL (structure TBD — see §8.3). Clicking a tab navigates to the corresponding URL. The sidebar's "Overview" item is active for both tab URLs. The range selector state is per-tab and per-URL — switching tabs resets to the default (ALL). The range is part of the URL (query param `?range=ALL` / `?range=5Y` / `?range=1Y` / `?range=YTD`) so a refresh preserves it.

### 5.2 Transactions

Subtitle: "Record and manage your income and expenses."

A pure workspace. Layout, top to bottom:

1. **Page header**: title + subtitle (left), "+ Add" button (right, primary).
2. **Contextual summary strip** (single card, full width, small).
   - Label: "Context · {Month Year}" (uppercase, small, muted).
   - Content: one line — "in €X · out −€Y · net €Z" (expense shown negative, net signed). No chart, no comparison, no card-per-metric. This is context for editing, not analysis.
   - Data: `transactions.summary(year, month)` for the selected month.
3. **Filter bar** (full width, flex row, wraps on narrow screens):
   - MonthPicker (existing component).
   - Search input (icon + text input, `flex-1 min-w-[200px]`).
   - Type select (All / Income / Expense, `w-[130px]`).
   - Category select (All categories + list, `w-[180px]`).
4. **Transactions table card** (full width — this is the workspace, it gets the most vertical space).
   - Card title: "Transactions · {Year}" or just the table with no card title (the filters above act as the table's header).
   - Table columns: Date (110px, tabular-nums) · Description (truncate, max 280px) · Category (name + TypeBadge) · Amount (right-aligned, tabular-nums, **signed**: income `+`/positive in emerald, expense negative in rose) · Actions (edit + delete icon buttons, right-aligned).
   - Row hover: `bg-muted/50`. Edit/delete buttons are always visible (not hover-revealed) for discoverability on touch.
   - Data: `transactions.list({ year, month, q, transaction_type, category_id })`.
   - Empty state: "No transactions match the filters."

**What was removed vs. current page:** the 3 separate summary cards (Income/Expense/Net) — collapsed into the one-line contextual strip. The spending-by-category bar chart — moved to Overview → Cash flow tab. The comparison-vs-last-month delta — dropped from this page (it's a report concern; could return as a tooltip on the trend chart later).

**Dialogs:** TransactionDialog (existing) for create/edit. ConfirmDialog (existing) for delete. Unchanged from current behavior.

### 5.3 Recurring

Subtitle: "Templates that generate transactions when they happen."

Workspace + action queue. Layout, top to bottom:

1. **Page header**: title + subtitle (left), "+ Add" button (right).
2. **Due now card** (amber-tinted: `bg-amber-50`, `border-amber-200`).
   - Card title: "Due now" + a count badge on the right ("2 due", amber).
   - Content: a list of due items (templates where `due === true` && `active === true`). Each item is a row with:
     - Left: description (bold) + meta line ("Monthly · was due Aug 1").
     - Right: amount (tabular-nums) + "▶ Record" button (amber primary, calls `recurringTemplates.generate(id)`).
   - **Empty state**: "Nothing due — templates up to date." (The card is still rendered, just with the empty message. The sidebar badge is hidden when count is 0.)
   - On successful generate: toast "Generated \"{description}\" for {occurred_on}" (existing behavior), invalidate queries.
   - On error (409 = paused): toast "Template is paused" (existing behavior).
3. **All templates card** (full width).
   - Table columns: Description (truncate) · Category (name + TypeBadge) · Frequency (110px, muted) · Next occurrence (130px, tabular-nums, amber if `due`) · Amount (right-aligned, signed/colored by type) · Status (badge: Overdue / Scheduled / Paused) · Actions (✎ Edit · 🗑 Delete, right-aligned).
   - **No ▶ Record button in the table.** Generating a due occurrence happens only in the "Due now" card at the top of the page — every due & active template already appears there, so a second generate action in the table would be a duplicate. (The generate mutation lives in `DueNowCard`.)
   - Data: `recurringTemplates.list()`.
   - Empty state: "No templates yet."

**Why Due now is here, not on Overview:** the due queue is a to-do list, not a report. It belongs where the templates live, so the action and its target are on the same screen. The sidebar badge surfaces it from anywhere.

**Dialogs:** RecurringDialog (existing) for create/edit. ConfirmDialog (existing) for delete. Unchanged.

### 5.4 Assets

Subtitle: "The money pools where your funds live."

Pure workspace. Layout, top to bottom:

1. **Page header**: title + subtitle (left), "+ Add" button (right).
2. **Totals-by-type strip** (3-up grid).
   - Three cards: Liquid, Savings, ETF. Each shows the type label (small, uppercase, muted) + the sum of balances for that type (20px, bold, colored: Liquid `text-sky-600`, Savings `text-emerald-600`, ETF `text-amber-600`).
   - Data: derived from `assets.list()` grouped by `asset_type`.
   - Zero-balance types are still shown (with $0.00) — the 3-up grid is a fixed structure, not data-driven filtering.
3. **All assets card** (full width).
   - Table columns: Name (font-medium) · Type (AssetTypeBadge) · Balance (right-aligned, tabular-nums, bold) · Actions (edit + delete).
   - Data: `assets.list()`.
   - Empty state: "No assets yet."
   - Delete error handling: if the asset has transactions or transfers, toast "Cannot delete: this asset has transactions or transfers" (existing behavior).

**What is NOT on this page:** an allocation donut. Allocation is an Overview concern (Net worth tab), not an Assets-page concern. The totals-by-type strip gives the same "where's my money" answer without a chart, and stays out of the table's way.

**Dialogs:** AssetDialog (existing) for create/edit. ConfirmDialog (existing) for delete. Unchanged.

### 5.5 Transfers

Subtitle: "Money moved between your assets."

Pure workspace, same skeleton as Transactions (strip → filters → table) for consistency. Layout, top to bottom:

1. **Page header**: title + subtitle (left), "+ Add transfer" button (right).
2. **Mini summary strip** (3-up grid).
   - Three cards: "This month" (sum of transfers in selected month) · "Count · {Month abbrev}" (count) · "This year" (sum year-to-date).
   - Data: derived from `transfers.list({ year, month })` for the first two; `transfers.list({ year })` for the year total. Both use the existing endpoint's year/month filtering.
3. **Filter bar**: MonthPicker + Search input (no Type or Category — transfers don't have those).
4. **Transfer log card** (full width).
   - Table columns: Date (110px) · From → To (asset names with arrow icon between) · Description (truncate) · Amount (right-aligned) · Actions (edit + delete).
   - Data: `transfers.list({ year, month, q })`.
   - Empty state: "No transfers yet."

**Why no chart:** transfers are a log of movements, not a trend. A chart would imply a trajectory that doesn't exist. The mini summary answers "how much is moving around" without making the user sum rows.

**Dialogs:** TransferDialog (existing) for create/edit. ConfirmDialog (existing) for delete. Unchanged.

### 5.6 Categories

Subtitle: "The categories used to tag your transactions."

Config page, reached from the sidebar footer. Layout, top to bottom:

1. **Page header**: title + subtitle only — no "+ Add" button in the header (the add form is a card below).
2. **Add category card**.
   - Card title: "Add category".
   - Form: Name (input, grow) + Type (select: Expense / Income) + Add button. Inline form, not a dialog — adding a category is lightweight enough to not need a modal.
   - On submit: `categories.create({ name, transaction_type })`. On 409: toast "A category with this name already exists" (existing behavior).
3. **All categories card**.
   - A list (not a table — categories are simple enough that a list reads cleaner). Each row: category name (font-medium) + TypeBadge + edit/delete icon buttons (right).
   - Data: `categories.list()`.
   - Empty state: "No categories yet."

**Dialogs:** an inline Dialog (existing) for editing a category's name/type. ConfirmDialog for delete. Unchanged.

---

## 6. Visual language (principles — applied during implementation)

Decided in principle during brainstorming; applied during implementation, not part of this structural spec.

- **Light mode only** for now. Dark mode is a deferred feature (Settings → Appearance, Module 6).
- **Card primitive:** 10px radius, 1px border (`border-border`), white background, soft shadow (`0 1px 2px rgba(0,0,0,0.04)`). Shared component — every card in the app uses the same primitive.
- **Hero variant:** the Net worth tab's hero card uses a subtle sky gradient (`linear-gradient(135deg, #f0f9ff, #e0f2fe)`) + `border-sky-200` + heavier border (1.5px). This is the *only* tinted card in the app. All other cards are plain white.
- **Page background:** `bg-neutral-50` (slate-50 equivalent).
- **Accent colors:** primary sky-600 (`#0284c7`), income emerald-600 (`#059669`), expense rose-600 (`#e11d48`), amber for due/overdue (`#d97706` text / `#fffbeb` bg).
- **Money sign convention:** amounts are stored unsigned (ADR 0001); direction is a presentation concern. The `Money` component formats a signed value as-is (no forced `+`). Expenses are displayed as **negative** (`-€84.20`, rose), income as positive (`€5,200`, emerald), net with its true sign (sky when ≥ 0, rose when < 0), transfers and balances neutral/signed-as-is. Callers pass a negated value for expenses (e.g. `(-Number(amount)).toFixed(2)`).
- **Typography:** system font stack (already in use). Tabular-nums for all numeric values (`font-variant-numeric: tabular-nums` via a `font-numeric` utility class — already present in the codebase).
- **Iconography:** lucide-react (already in use). Each sidebar item gets a real lucide icon, not a placeholder glyph.

**Why two card treatments (tinted hero + plain):** the hero reads as the headline without shouting; the soft shadow gives cards just enough lift to feel like objects. Two patterns to keep consistent — manageable via a shared `<Card>` primitive with a `variant="hero"` prop.

---

## 7. Responsive behavior

| Breakpoint | Sidebar | Grids |
|---|---|---|
| ≥1024px (desktop) | Persistent left sidebar, 240px | 3-up summary strips as specified; Overview cards are full-width stacked |
| <1024px (tablet/mobile) | Hidden, hamburger drawer | All grids collapse to single column |

The Cash flow tab uses stacked full-width cards (trend, month table, category breakdown), so no grid collapse is needed there — cards naturally flow to single column on narrow screens.

The sidebar drawer on mobile is the same component, rendered in an overlay. No separate mobile nav model.

---

## 8. Open implementation questions

These are resolved during implementation, not in this spec:

1. **Range-aware spending-by-category on Cash flow tab.** **RESOLVED during implementation** — no backend change needed. The existing `transactions.trendByCategory(start, end)` endpoint is already range-aware (returns per-category monthly points over a date range). The frontend filters it to expense categories using the `categories.list` data (`transaction_type === "expense"`) and sums each category's points to a range total. This supersedes the earlier plan of calling `summaryByCategory` (single-month) per month or adding a new backend endpoint.

2. **Net worth "this month" delta.** The hero card shows "+$2,060 this month" and "+4.5%". This is derived by taking the latest point from `net-worth-trend` and subtracting the prior month's point. No new API — but the frontend needs at least the last 2 months of trend data even when the user selects a short range. Implementation: fetch a small "last 2 months" trend in parallel for the delta, independent of the chart's range selector.

3. **URL structure for Overview tabs.** `/overview/net-worth` and `/overview/cash-flow` (nested routes) vs. `/?tab=net-worth` (query param). Nested routes are cleaner and more conventional with React Router. To be decided during implementation.

4. **Transfer mini-summary "this year" calculation.** The existing `transfers.list` endpoint accepts `year` + `month`. For the year total, call with just `year` (no month) and sum the `amount` client-side. Confirmed the endpoint supports this (current code already calls `transfers.list({})` with no params to get everything).

---

## 9. Empty / loading / error states

Every data-backed widget has three states beyond the happy path:

- **Loading:** "Loading…" in `text-muted-foreground`, same container as the data. No skeleton screens for this iteration (deferred).
- **Error:** "Failed to load {thing}." in `text-destructive`. No retry button in this iteration (deferred).
- **Empty:** a meaningful empty-state message in `text-muted-foreground` (e.g. "No assets yet.", "No transactions match the filters.", "Nothing due — templates up to date."). Empty states are phrased as the absence of a thing the user might expect, not as instructions.

For the Recurring "Due now" card specifically, the empty state renders the card with the message — the card is always present, only its contents change. This keeps the page structure stable.

---

## 10. What this spec does NOT decide

- The exact shadcn/Tailwind class names for every element (implementation detail).
- Whether to add skeleton loading states (deferred — "Loading…" text for now).
- Whether to add retry buttons on error (deferred).
- Pagination/virtualization for long tables (the current tables render all rows; deferred until performance is a real concern).
- The exact chart styling (axis tick formatting, grid line density, tooltip layout) — implementation detail using the existing `ChartContainer` / `ChartTooltip` shadcn wrappers.
- Dark mode (deferred).
- Any new backend endpoint beyond the one open question in §8.

---

## 11. Summary of changes from current frontend

| Area | Current | Redesigned |
|---|---|---|
| Navigation | Top horizontal nav, 5 items | Left sidebar, 5 items + Categories in footer |
| Max width | `max-w-5xl` | `max-w-6xl` |
| Overview | Single page: net worth + trend + allocation + 3 summary cards + cash flow chart + (was going to have) due widget | Two sub-tabs: Net worth (hero + trend + allocation) · Cash flow (chart of income/expense/net over the range + range-aggregated category breakdown). No month-cards. No month table. No due widget. |
| Transactions | Filters + 3 summary cards + spending chart + table | Filters + small contextual strip + table. Chart moved to Overview. Summary cards collapsed to one line. |
| Recurring | Templates table only | Due now action queue (amber card, top) + templates table. Sidebar badge shows due count. |
| Assets | 3 totals cards + asset table + transfers section (wedged in) | 3 totals cards + asset table. Transfers moved to own page. |
| Transfers | Wedged inside Assets page as a section | Own top-level page: mini summary + filters + table. |
| Categories | Top-level nav item | Sidebar footer entry. |
| Visual style | Default shadcn, flat | Tinted hero + soft elevation, 10px radius, light mode (applied during implementation). |

---

## 12. Reference mockups

Wireframe mockups from the brainstorm session are saved in `.superpowers/brainstorm/` (gitignored). They are reference material, not source of truth — this spec is. If there's a conflict between a mockup and this spec, the spec wins.
