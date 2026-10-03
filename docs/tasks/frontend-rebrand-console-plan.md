# Frontend Rebrand Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Applicare la spec `docs/tasks/frontend-rebrand-console.md`: portare il frontend dal linguaggio caldo app2 al linguaggio neutro del Console, con numeri in JetBrains Mono e sidebar a sinistra invariati.

**Architecture:** Nessun cambio di API o business logic. Tutto passa dai token in `index.css` (che si propagano a ogni pagina) più la riscrittura mirata dei primitivi in `components/ui/`, della shell e dei vuoti. Fase 0 fondamenta, Fase 1 pagina pilota (Transactions) con check visivo, Fase 2 pagine a gruppi, Fase 3 docs e cleanup.

**Tech Stack:** React + TypeScript strict, Tailwind v4 (token in `index.css`), Base UI, TanStack Query, Recharts, lucide-react.

**Nota su commit e test:** nessun commit senza richiesta esplicita dell'utente; niente git per i subagent. Il frontend non ha test automatici: verifica = `npm run build` + `npm run lint` in `frontend/` + controllo visivo dell'utente (a ogni gruppo di pagine).

**Valori di riferimento:** i token target sono nella spec §3 (palette), §4 (tipografia), §5 (forme). Le stringhe di codice in questo piano sono la fonte esatta: se una stringa non combacia col file, il file è cambiato e va riallineato alla spec.

---

## Fase 0 — Fondamenta

### Task 1: Token in `index.css`

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: sostituisci l'intero blocco `:root { ... }` con:**

```css
:root {
    /* Neutral surfaces — Console rebrand (light only) */
    --background: #FAFAFA;
    --foreground: #171717;
    --card: #FFFFFF;
    --card-foreground: #171717;
    --popover: #FFFFFF;
    --popover-foreground: #171717;
    --primary: #171717;
    --primary-foreground: #FAFAFA;
    --primary-soft: #F5F5F5;
    --secondary: #F5F5F5;
    --secondary-foreground: #171717;
    --muted: #F5F5F5;
    --muted-foreground: #737373;
    --faint-foreground: #A3A3A3;
    --accent: #F5F5F5;
    --accent-foreground: #171717;
    --destructive: #DC2626;
    --destructive-soft: #FEF2F2;
    --positive: #15803D;
    --positive-soft: #F0FDF4;
    --positive-chart: #22C55E;
    --border: #E5E5E5;
    --row-group: #F5F5F5;
    --row-hover: #FAFAFA;
    --input: #D4D4D4;
    --ring: #171717;
    --chart-grid: #F0F0F0;
    --chart-1: #2563EB;
    --chart-2: #0D9488;
    --chart-3: #7C3AED;
    --chart-4: #DB2777;
    --chart-5: #D97706;
    --chart-6: #475569;
    --chart-7: #65A30D;
    --chart-8: #0891B2;
    --radius: 0.625rem;
    --sidebar: #FFFFFF;
    --sidebar-foreground: #171717;
    --sidebar-primary: #171717;
    --sidebar-primary-foreground: #FAFAFA;
    --sidebar-accent: #F5F5F5;
    --sidebar-accent-foreground: #171717;
    --sidebar-border: #E5E5E5;
    --sidebar-ring: #171717;
    --font-numeric: 'JetBrains Mono Variable', ui-monospace, monospace;
    /* Legacy accent names — temporary aliases until every page is migrated. */
    --clay: var(--destructive);
    --moss: var(--positive);
}
```

Nota: `--petrol`, `--petrol-soft`, `--ochre`, `--slate`, `--plum`, `--teal`, `--rust`, `--stone` spariscono. Restano usati solo in `frontend/src/lib/asset-meta.ts`, che va migrato nello Step 6.

- [ ] **Step 2: in `@theme inline` elimina i mapping legacy** (`--color-petrol`, `--color-petrol-soft`, `--color-ochre`, `--color-slate`, `--color-plum`, `--color-teal`, `--color-rust`, `--color-stone`) e lascia solo:

```css
    /* Legacy accent names — temporary aliases so not-yet-restyled pages keep working. */
    --color-clay: var(--clay);
    --color-moss: var(--moss);
```

- [ ] **Step 3: aggiorna le scale del radius** (sostituisci il blocco `--radius-sm` … `--radius-4xl`):

```css
    --radius-sm: calc(var(--radius) * 0.6);
    --radius-md: calc(var(--radius) * 0.8);
    --radius-lg: var(--radius);
    --radius-xl: calc(var(--radius) * 1.2);
    --radius-2xl: calc(var(--radius) * 1.6);
    --radius-3xl: calc(var(--radius) * 2.2);
    --radius-4xl: calc(var(--radius) * 2.6);
```

- [ ] **Step 4: NON rimuovere `@custom-variant dark (&:is(.dark *));`** — con Tailwind v4 la sua assenza farebbe ricadere i `dark:` residui sul media query `prefers-color-scheme`, attivando controlli scuri su OS con tema dark. La variante resta inerte (nessuno setta `.dark`) e si rimuove nel Task 21, insieme agli ultimi `dark:`.

- [ ] **Step 5: migra `frontend/src/lib/asset-meta.ts`** — sostituisci i due record con (palette categorica nuova, "other" neutro come in Reports):

```ts
export const ASSET_CLASS_COLOR: Record<AssetClass, string> = {
  current_account: "var(--color-chart-1)",
  deposit_account: "var(--color-positive)",
  money_market_etf: "var(--color-chart-2)",
  government_bond: "var(--color-chart-6)",
  corporate_bond: "var(--color-chart-3)",
  bond_etf: "var(--color-chart-5)",
  equity_etf: "var(--color-chart-4)",
  stock: "var(--color-chart-8)",
  other: "var(--color-muted-foreground)",
}
```

```ts
export const LIQUIDITY_COLOR: Record<LiquidityCategory, string> = {
  liquid: "var(--color-chart-1)",
  reserve: "var(--color-positive)",
  invested: "var(--color-chart-5)",
}
```

- [ ] **Step 6: verifica.** Run: `npm run build && npm run lint` da `frontend/`. Expected: build ok, 4 warning `only-export-components` preesistenti (trend-range-selector, lib/auth, ui/button, ui/badge).

---

### Task 2: Focus globale + `ui/button.tsx`

**Files:**
- Modify: `frontend/src/index.css` (`@layer base`)
- Modify: `frontend/src/components/ui/button.tsx` (file intero)

- [ ] **Step 1: aggiungi il focus globale e i controlli nativi in `@layer base`**, subito dopo la regola `* { ... }`:

```css
  :focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
    }
  input[type="checkbox"],
  input[type="radio"] {
    accent-color: var(--foreground);
    }
```

- [ ] **Step 2: sostituisci l'intero contenuto di `ui/button.tsx` con:**

```tsx
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[#262626]",
        outline:
          "border-border bg-card shadow-[0_1px_2px_rgb(0_0_0_/_0.04)] hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 rounded-md px-2 text-xs in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 rounded-md px-2.5 text-[13px] in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-9",
        "icon-xs":
          "size-6 rounded-md in-data-[slot=button-group]:rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-md in-data-[slot=button-group]:rounded-md",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
```

Punti chiave: via `outline-none` e i `focus-visible:ring-*` (Ci pensa la regola globale), primary quasi-nero con hover `#262626`, outline con ombra 4%, destructive soft, altezze h-9/h-8/h-10.

- [ ] **Step 3: verifica.** Run: `npm run build && npm run lint`. Expected: build ok, 4 warning preesistenti.

---

### Task 3: `ui/card.tsx`

**Files:**
- Modify: `frontend/src/components/ui/card.tsx`

- [ ] **Step 1: `Card`** — sostituisci `ring-1 ring-foreground/10` con `border border-border` nella className.
- [ ] **Step 2: padding card a 20px** — `[--card-spacing:--spacing(4)]` → `[--card-spacing:--spacing(5)]` e `data-[size=sm]:[--card-spacing:--spacing(3)]` → `data-[size=sm]:[--card-spacing:--spacing(4)]`.
- [ ] **Step 3: `CardTitle`** — `"font-heading text-base leading-snug font-semibold ..."` → `"font-heading text-[15px] leading-snug font-semibold ..."`.
- [ ] **Step 4: `CardDescription`** — `"text-sm text-muted-foreground"` → `"text-[13px] text-muted-foreground"`.
- [ ] **Step 5: `CardFooter`** — `"flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)"` → `"flex items-center rounded-b-xl border-t p-(--card-spacing)"`.
- [ ] **Step 6: verifica.** Run: `npm run build && npm run lint`.

---

### Task 4: `ui/input.tsx` + `ui/select.tsx`

**Files:**
- Modify: `frontend/src/components/ui/input.tsx`
- Modify: `frontend/src/components/ui/select.tsx`

- [ ] **Step 1: `Input`** — nella className: `h-8` → `h-9`; rimuovi `outline-none` e `focus-visible:ring-3 focus-visible:ring-ring/50` (resta `focus-visible:border-ring`); rimuovi tutte le classi `dark:*`.
- [ ] **Step 2: `SelectTrigger`** — `data-[size=default]:h-8` → `data-[size=default]:h-9`; `data-[size=sm]:h-7` → `data-[size=sm]:h-8`; rimuovi `outline-none`, `focus-visible:ring-3 focus-visible:ring-ring/50` e le classi `dark:*`; nel ramo sm `rounded-[min(var(--radius-md),10px)]` → `rounded-md`.
- [ ] **Step 3: `SelectContent`** — `rounded-xl` → `rounded-lg`; `shadow-lg` → `shadow-[0_10px_30px_rgb(0_0_0_/_0.08)]`.
- [ ] **Step 4: `SelectItem`** — `rounded-lg` → `rounded-md`.
- [ ] **Step 5: verifica.** Run: `npm run build && npm run lint`.

---

### Task 5: `ui/table.tsx`

**Files:**
- Modify: `frontend/src/components/ui/table.tsx`

- [ ] **Step 1: `TableHead`** — `"h-8 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-faint-foreground ..."` → `"h-10 px-4 text-left align-middle text-[12.5px] font-medium whitespace-nowrap text-faint-foreground bg-muted/50 ..."` (banda header ≈#FAFAFA come da screenshot Console).
- [ ] **Step 2: `TableCell`** — `"p-1.5 px-3 align-middle whitespace-nowrap ..."` → `"px-4 py-2 align-middle whitespace-nowrap ..."` (righe 36px).
- [ ] **Step 3: `TableFooter`** — `"border-t bg-muted/50 font-medium [&>tr]:last:border-b-0"` → `"border-t font-medium [&>tr]:last:border-b-0"`.
- [ ] **Step 4: verifica.** Run: `npm run build && npm run lint`.

---

### Task 6: `ui/badge.tsx`

**Files:**
- Modify: `frontend/src/components/ui/badge.tsx`

- [ ] **Step 1:** nella base: `rounded-4xl` → `rounded-[6px]`; rimuovi `focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50` (il focus lo dà la regola globale); nel variant `destructive` rimuovi `focus-visible:ring-destructive/20` (ring orfano senza larghezza) e `dark:bg-destructive/20 dark:focus-visible:ring-destructive/40`.
- [ ] **Step 2: verifica.** Run: `npm run build && npm run lint`.

---

### Task 7: `ui/dialog.tsx`

**Files:**
- Modify: `frontend/src/components/ui/dialog.tsx`

- [ ] **Step 1: overlay** — `bg-[rgb(36_33_31_/_0.25)]` → `bg-[rgb(23_23_23_/_0.30)]`.
- [ ] **Step 2: content** — `rounded-xl` → `rounded-2xl`; `shadow-[0_12px_32px_rgb(36_33_31_/_0.10)]` → `shadow-[0_10px_30px_rgb(0_0_0_/_0.08)]`; `ring-1 ring-foreground/10` → `border border-border` (parità hairline con dropdown/select).
- [ ] **Step 3: footer** — `brightness` invariata tranne `bg-muted/50` → niente: `"-mx-5 -mb-5 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-5 ..."` → `"-mx-5 -mb-5 flex flex-col-reverse gap-2 rounded-b-2xl border-t p-5 ..."`.
- [ ] **Step 4: `DialogTitle`** — `text-lg` → `text-base`.
- [ ] **Step 5: verifica.** Run: `npm run build && npm run lint`.

---

### Task 8: `ui/dropdown-menu.tsx`

**Files:**
- Modify: `frontend/src/components/ui/dropdown-menu.tsx`

- [ ] **Step 1: content** — `rounded-xl` → `rounded-lg`; `shadow-lg` → `shadow-[0_10px_30px_rgb(0_0_0_/_0.08)]`.
- [ ] **Step 2: item** — `rounded-lg` → `rounded-md`; **lascia `outline-hidden`** (i menu usano l'highlight `data-highlighted`, non l'outline globale: coerente con `SelectItem`; un outline a offset 2 dentro un popup `p-1` si fonderebbe con gli angoli).
- [ ] **Step 3: item destructive** — `"text-clay data-highlighted:bg-clay/10 data-highlighted:text-clay"` → `"text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"`.
- [ ] **Step 4: verifica.** Run: `npm run build && npm run lint`.

---

### Task 9: `segmented.tsx` + `type-toggle.tsx`

**Files:**
- Modify: `frontend/src/components/segmented.tsx`
- Modify: `frontend/src/components/type-toggle.tsx`

- [ ] **Step 1: `Segmented`** — contenitore: `rounded-full bg-secondary p-1` → `rounded-lg bg-secondary p-1`; ramo `size === "md"`: `"gap-1.5 rounded-xl p-1.5"` → `"gap-1.5 rounded-lg p-1.5"`; voce sm: `rounded-full` → `rounded-md`; voce md: `rounded-lg` → `rounded-md`.
- [ ] **Step 2: `TypeToggle`** — contenitore: `"grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1"` → `"grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1"`; `itemClass`: `rounded-lg` → `rounded-md`; voce attiva: aggiungi `ring-1 ring-border` (parità con `Segmented`).
- [ ] **Step 3: verifica.** Run: `npm run build && npm run lint`.

---

### Task 9b: Tooltip grafici + toast

**Files:**
- Modify: `frontend/src/components/ui/chart.tsx`
- Modify: `frontend/src/components/ui/sonner.tsx`

- [ ] **Step 1: `chart.tsx`** — il contenitore del tooltip (riga ~192): `"grid min-w-44 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"` → `"grid min-w-44 items-start gap-1.5 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-[0_10px_30px_rgb(0_0_0_/_0.08)]"`.
- [ ] **Step 2: `sonner.tsx` + `index.css`** — NON usare `toastOptions.style`: l'inline style sul `<li>` sovrascrive la regola `[data-sonner-toast]:focus-visible` di Sonner e uccide l'indicatore di focus (WCAG 2.4.7). Lascia `toastOptions` invariato e aggiungi in fondo a `index.css`, **fuori dai layer**:

```css
/* Raised shadow for toasts, without killing Sonner's focus-visible ring. */
[data-sonner-toast].cn-toast:not(:focus-visible) {
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.08);
}
```

- [ ] **Step 3: verifica.** Run: `npm run build && npm run lint`.

---

### Task 10: `stat.tsx` + `stat-label.tsx`

**Files:**
- Modify: `frontend/src/components/stat.tsx`
- Modify: `frontend/src/components/stat-label.tsx`

- [ ] **Step 1: `Stat`** — sostituisci `sizeClasses`:

```ts
const sizeClasses = {
  sm: "text-[18px]",
  md: "text-[26px]",
  lg: "text-[28px]",
  xl: "text-[32px]",
} as const
```

- [ ] **Step 2: `Stat`** — tono `attention`: `text-chart-2` → `text-chart-5` (l'ambra semantica resta ambra anche nella nuova palette).
- [ ] **Step 3: `Stat`** — peso del valore: `font-medium` → `font-[650]` (spec §4: KPI 26/650 mono).
- [ ] **Step 4: `StatLabel`** — sostituisci il contenuto con:

```tsx
import type { ReactNode } from "react"

interface StatLabelProps {
  children: ReactNode
}

export function StatLabel({ children }: StatLabelProps) {
  return (
    <span className="text-[13px] font-medium text-muted-foreground">
      {children}
    </span>
  )
}
```

- [ ] **Step 5: verifica.** Run: `npm run build && npm run lint`.

---

### Task 11: `empty-state.tsx`

**Files:**
- Modify: `frontend/src/components/empty-state.tsx` (file intero)

- [ ] **Step 1: sostituisci il contenuto con:**

```tsx
import type { ReactNode } from "react"
import { Inbox, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  subtitle,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-input bg-background px-5 py-10 text-center",
        className,
      )}
    >
      <Icon className="size-5 text-faint-foreground" />
      <div className="space-y-0.5">
        <p className="text-[13.5px] font-semibold">{title}</p>
        {subtitle && (
          <p className="mx-auto max-w-sm text-[13px] text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
```

- [ ] **Step 2: verifica.** Run: `npm run build && npm run lint`.

---

### Task 12: Shell — `layout.tsx`, `sidebar-nav.tsx`, `page-header.tsx`, `page-tabs.tsx`

**Files:**
- Modify: `frontend/src/components/layout.tsx`
- Modify: `frontend/src/components/sidebar-nav.tsx`
- Modify: `frontend/src/components/page-header.tsx` (file intero)
- Modify: `frontend/src/components/page-tabs.tsx` (file intero)

- [ ] **Step 1: `layout.tsx`** — cinque sostituzioni esatte:
  - `collapsed && peeking && "shadow-[0_12px_32px_rgb(36_31_31_/_0.10)]"` → `collapsed && peeking && "shadow-[0_10px_30px_rgb(0_0_0_/_0.08)]"`
  - alert dot: `bg-clay ring-2 ring-sidebar` → `bg-destructive ring-2 ring-sidebar`
  - `SidebarIconLink` attivo: `isActive && "bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary"` → `isActive && "bg-muted text-foreground hover:bg-muted hover:text-foreground"`
  - contenuto: `<div className="px-6 py-6 md:px-8">` → `<div className="mx-auto w-full max-w-[1440px] px-6 py-6 md:px-8">`
  - overlay drawer mobile: `bg-black/40` → `bg-foreground/30`
  - shadow drawer mobile: `shadow-lg` → `shadow-[0_10px_30px_rgb(0_0_0_/_0.08)]`

- [ ] **Step 2: `sidebar-nav.tsx`** — tre sostituzioni esatte:
  - link attivo: `"bg-primary-soft text-primary"` → `"bg-muted text-foreground"`
  - badge conteggio (recurring due): `"ml-auto bg-primary-soft text-primary transition-opacity duration-150"` → `"ml-auto bg-destructive-soft text-destructive transition-opacity duration-150"` (stesso rosso di Recurring)
  - dot collapsed: `bg-primary transition-opacity` → `bg-destructive transition-opacity`

- [ ] **Step 3: `page-header.tsx`** — sostituisci il contenuto con (nota: `min-h-9` sulla riga titolo/azione tiene stabile l'altezza tra tab con e senza bottone, es. Assets → Transfers):

```tsx
import type { ReactNode } from "react"

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
  tabs?: ReactNode
}

export function PageHeader({ title, subtitle, action, tabs }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-9 min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="truncate text-[13px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {tabs && <div className="border-b border-border">{tabs}</div>}
    </div>
  )
}
```

- [ ] **Step 4: `page-tabs.tsx`** — sostituisci il contenuto con:

```tsx
import { NavLink } from "react-router-dom"

import { cn } from "@/lib/utils"

export interface PageTab {
  to: string
  label: string
}

export function PageTabs({ tabs }: { tabs: PageTab[] }) {
  return (
    <div className="flex items-center gap-5">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) =>
            cn(
              "-mb-px inline-flex h-9 cursor-pointer items-center border-b-2 px-0.5 text-[13px] font-medium transition-colors",
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: `user-menu.tsx`** — apri `frontend/src/components/user-menu.tsx` e allinea: avatar `size-5 rounded-[6px] bg-foreground text-background text-[11px] font-semibold` (quadrato quasi-nero con iniziale); sostituisci `shadow-[0_12px_32px_rgb(36_31_31_/_0.10)]` con `shadow-[0_10px_30px_rgb(0_0_0_/_0.08)]` e `rounded-xl` con `rounded-lg`; sul `Menu.Item` porta `rounded-lg` → `rounded-md` e aggiungi `outline-hidden` (pattern highlight-only dei menu, come `DropdownMenuItem`); verifica che il menu usi solo token nuovi (nessun `clay`).
- [ ] **Step 6: `row-actions.tsx`** — in `frontend/src/components/row-actions.tsx` rimuovi `outline-none` e `focus-visible:ring-3 focus-visible:ring-ring/50` dal bottone (il focus lo dà la regola globale).
- [ ] **Step 7: verifica.** Run: `npm run build && npm run lint`. Expected: build ok, 4 warning preesistenti.

---

## Fase 1 — Pilota

### Task 13: Transactions — footer di tabella + checkpoint visivo

**Files:**
- Modify: `frontend/src/pages/transactions.tsx`

- [ ] **Step 1: KPI.** In `transactions.tsx`, nei tre `Stat` (In/Out/Net): rimuovi `valueClassName="text-2xl xl:text-3xl"` e cambia `size="lg"` → `size="md"` (spec §4: KPI 26/650; gli override silenziavano la nuova scala).
- [ ] **Step 2: empty state.** In `transactions.tsx`, l'`EmptyState` dentro la Card `py-0`: aggiungi `className="m-4"` (evita il doppio bordo a filo) e converti l'azione in link sottolineato: `<Button variant="link" onClick={clearFilters} className="underline underline-offset-4">Clear filters</Button>`.
- [ ] **Step 3:** dentro la Card della tabella, subito dopo `</Table>`, aggiungi:

```tsx
              <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[12.5px] text-faint-foreground">
                <span>
                  {(transactions ?? []).length} transaction
                  {(transactions ?? []).length === 1 ? "" : "s"}
                </span>
              </div>
```

- [ ] **Step 4: verifica.** Run: `npm run build && npm run lint` da `frontend/`. Expected: build ok, 4 warning.

- [ ] **Step 5: CHECKPOINT UTENTE.** Avvia backend + Vite, apri `http://localhost:5173/transactions` e chiedi il check visivo su: token neutri, primary quasi-nero, focus da tastiera (Tab), densezza righe 44px, tab/filtri, dialog di creazione. Punti aperti da verificare esplicitamente: (a) **densità reale delle righe con controlli inline** — RowActions 28px porta la riga a ~53px, Select/Button `size="sm"` (h-8) a ~57px; se risultano troppo alte decidere tra `py-2` su TableCell o controlli più piccoli; (b) **stacking del ring rosso `aria-invalid` + outline nero** sui campi invalid in focus. Se qualcosa non convince, correggere **qui** (i valori si tarano sul pilota). Nessuna pagina successiva finché il pilota non è approvato.

---

### Task 13b: Transactions redesign — header visibili, colonna Date, filtri Console

**Files:**
- Create: `frontend/src/components/month-filter.tsx`
- Create: `frontend/src/components/category-filter.tsx`
- Modify: `frontend/src/components/ui/dropdown-menu.tsx` (aggiungi `DropdownMenuLabel`)
- Modify: `frontend/src/pages/transactions.tsx`

- [ ] **Step 1: `ui/dropdown-menu.tsx`** — aggiungi ed esporta:

```tsx
function DropdownMenuLabel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dropdown-menu-label"
      className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  )
}
```
(aggiungi `DropdownMenuLabel` all'export in fondo.)

- [ ] **Step 2: crea `frontend/src/components/month-filter.tsx`:**

```tsx
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

interface MonthFilterProps {
  year: number
  month: number
  onChange: (year: number, month: number) => void
}

export function MonthFilter({ year, month, onChange }: MonthFilterProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <CalendarDays className="size-4" />
        {MONTHS[month - 1]} {year}
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-[190px] overflow-y-auto">
        {MONTHS.map((name, index) => (
          <DropdownMenuItem
            key={name}
            onClick={() => onChange(year, index + 1)}
            className="justify-between"
          >
            {name}
            {index + 1 === month && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onChange(year - 1, month)}>
          <ChevronLeft className="size-4" /> {year - 1}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChange(year + 1, month)}>
          <ChevronRight className="size-4" /> {year + 1}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

Nota: i 12 mesi sono quelli dell'**anno selezionato** con navigazione anno in fondo (niente cap agli ultimi 12 mesi: l'import può avere transazioni vecchie).

- [ ] **Step 3: crea `frontend/src/components/category-filter.tsx`:**

```tsx
import { Check, Filter } from "lucide-react"

import type { Category } from "@/types/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface CategoryFilterProps {
  categories: Category[]
  value: number | "all"
  onChange: (value: number | "all") => void
}

export function CategoryFilter({ categories, value, onChange }: CategoryFilterProps) {
  const selected = value === "all" ? null : categories.find((c) => c.id === value)
  const expense = categories.filter((c) => c.transaction_type === "expense")
  const income = categories.filter((c) => c.transaction_type === "income")

  const renderItem = (category: Category) => (
    <DropdownMenuItem
      key={category.id}
      onClick={() => onChange(category.id)}
      className="justify-between"
    >
      {category.name}
      {value === category.id && <Check className="size-4" />}
    </DropdownMenuItem>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" />}
        className={cn(selected && "bg-muted")}
      >
        <Filter className="size-4" />
        {selected?.name ?? "Filter"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-[200px] overflow-y-auto">
        <DropdownMenuItem
          onClick={() => onChange("all")}
          className="justify-between"
        >
          All categories
          {value === "all" && <Check className="size-4" />}
        </DropdownMenuItem>
        {expense.length > 0 && <DropdownMenuSeparator />}
        {expense.length > 0 && <DropdownMenuLabel>Expense</DropdownMenuLabel>}
        {expense.map(renderItem)}
        {income.length > 0 && <DropdownMenuSeparator />}
        {income.length > 0 && <DropdownMenuLabel>Income</DropdownMenuLabel>}
        {income.map(renderItem)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 4: `transactions.tsx`** — riprogettazione:
  - Import: rimuovi `Fragment`, `useMemo`, `Filter`, `MonthPicker`, tutto il blocco `Select*`; aggiungi `RefreshCw` a lucide, `cn` da `@/lib/utils`, `CategoryFilter`, `MonthFilter`.
  - Sostituisci `MONTHS`/`dayLabel` con `SHORT_MONTHS`/`dateLabel` (poi estratti in `lib/period.ts`, formato finale `Sep 08, 2026`; vedi Task 13d e follow-up).
  - Elimina il `useMemo` `grouped` (niente più raggruppamento per giorno).
  - La query delle transazioni espone anche `isFetching`; aggiungi:
```tsx
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["transactions"] })
    void queryClient.invalidateQueries({ queryKey: ["summary"] })
  }
```
  - `PageHeader.action` diventa:
```tsx
        action={
          <div className="flex flex-wrap items-center gap-2">
            <MonthFilter
              year={year}
              month={month}
              onChange={(nextYear, nextMonth) => {
                setYear(nextYear)
                setMonth(nextMonth)
              }}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Refresh"
              onClick={refresh}
              disabled={isFetching}
            >
              <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
            </Button>
            <Button
              onClick={() => {
                setEditing(null)
                setDialogOpen(true)
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Add transaction
            </Button>
          </div>
        }
```
  - La toolbar dentro la Card diventa (niente MonthPicker, niente Select):
```tsx
        <div className="flex flex-wrap items-center gap-3 p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search descriptions..."
              className="pl-9"
            />
          </div>
          <CategoryFilter
            categories={categories ?? []}
            value={categoryId}
            onChange={setCategoryId}
          />
        </div>
```
  - La tabella diventa piatta con header visibili e colonna Date:
```tsx
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[200px]">Category</TableHead>
                    <TableHead className="w-[1%] text-right">Amount</TableHead>
                    <TableHead className="w-[1%] text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(transactions ?? []).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-numeric text-[13px] text-muted-foreground">
                        {dateLabel(t.occurred_on)}
                      </TableCell>
                      <TableCell>
                        <span className="block max-w-[320px] truncate">
                          {t.description}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {categoryName(t.category_id)}
                      </TableCell>
                      <TableCell className="w-[1%] text-right">
                        <Money
                          value={
                            t.transaction_type === "income"
                              ? t.amount
                              : (-Number(t.amount)).toFixed(2)
                          }
                          signed
                          className={
                            t.transaction_type === "income"
                              ? "font-medium text-positive"
                              : "font-medium text-destructive"
                          }
                        />
                      </TableCell>
                      <TableCell className="w-[1%] text-right">
                        <div className="flex justify-end">
                          <RowActions label={`Actions for ${t.description}`}>
                            <DropdownMenuItem
                              onClick={() => {
                                setEditing(t)
                                setDialogOpen(true)
                              }}
                            >
                              <Pencil /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeleteTarget(t)}
                            >
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </RowActions>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
```
  - Empty state, footer e dialog restano invariati; la condizione empty usa `(transactions ?? []).length === 0`.
  - Post-review (minori): la cella Category usa `<span className="block max-w-[200px] truncate">` per nomi lunghi; `dateLabel` ha la guardia `if (!year || !month || !day) return date`.

- [ ] **Step 5: verifica.** Run: `npm run build && npm run lint`.
- [ ] **Step 6: CHECKPOINT UTENTE** su `/transactions` (header visibili, Date `Sep 08, 2026`, filtri Console, refresh).

---

### Task 13c: Toolbar esterna, selezione azzurra, selectbox anno

**Files:**
- Modify: `frontend/src/index.css` (token `--selection`)
- Modify: `frontend/src/components/ui/select.tsx` (voce selezionata azzurra)
- Modify: `frontend/src/components/month-filter.tsx` (selectbox anno)
- Modify: `frontend/src/components/category-filter.tsx` (voce selezionata azzurra)
- Modify: `frontend/src/pages/transactions.tsx` (toolbar fuori dalla tabella)

- [ ] **Step 1: token `--selection`** — in `:root` aggiungi `--selection: #2563EB;` (accanto a `--ring`); in `@theme inline` aggiungi `--color-selection: var(--selection);`.
- [ ] **Step 2: `ui/select.tsx`** — `SelectItem`: aggiungi `data-[selected]:text-selection`, `data-[selected]:data-highlighted:text-selection` e `data-[selected]:focus:text-selection` alla className (la voce selezionata resta azzurra anche in hover/highlight; i menu base altrimenti applicano `data-highlighted:text-accent-foreground`/`focus:text-accent-foreground`). **Non usare `data-selected:`**: Tailwind lo compila solo come `[data-selected=true]`, mentre Base UI emette `data-selected=""` (presence) → non matcherebbe. Verifica nel CSS compilato che il selettore composto esista (`rg "data-selected.*data-highlighted" dist/assets/*.css`); se lo stacking non compila, fallback: regola unlayered in `index.css` `[data-selected][data-highlighted], [data-selected]:focus { color: var(--selection); }`.
- [ ] **Step 3: `month-filter.tsx`** — riscrivi con il selectbox anno nel menu:

```tsx
import { CalendarDays, Check, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const YEARS_BACK = 30

interface MonthFilterProps {
  year: number
  month: number
  onChange: (year: number, month: number) => void
}

export function MonthFilter({ year, month, onChange }: MonthFilterProps) {
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: YEARS_BACK + 2 }, (_, index) => currentYear + 1 - index)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <CalendarDays className="size-4" />
        {MONTHS[month - 1]} {year}
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[200px]">
        <div className="p-1">
          <Select
            value={String(year)}
            onValueChange={(value) => {
              if (!value) return
              onChange(Number(value), month)
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{year}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {years.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-64 overflow-y-auto">
          {MONTHS.map((name, index) => (
            <DropdownMenuItem
              key={name}
              onClick={() => onChange(year, index + 1)}
              className={cn("justify-between", index + 1 === month && "text-selection")}
            >
              {name}
              {index + 1 === month && <Check className="size-4" />}
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 4: `category-filter.tsx`** — voce selezionata azzurra e stabile in hover: `cn("justify-between", value === category.id && "text-selection data-highlighted:text-selection")` in `renderItem` e `cn("justify-between", value === "all" && "text-selection data-highlighted:text-selection")` per "All categories" (`cn`/tailwind-merge sostituisce il `data-highlighted:text-accent-foreground` della base). Stesso trattamento alle voci mese di `month-filter.tsx` e alle voci YTD/All time/anno di `period-filter.tsx`.
- [ ] **Step 5: `transactions.tsx`** — la toolbar esce dalla Card e diventa una riga separata sopra la tabella; l'azione nell'header resta solo `Add transaction`:

```tsx
        action={
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add transaction
          </Button>
        }
```

```tsx
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search descriptions..."
            className="pl-9"
          />
        </div>
        <MonthFilter
          year={year}
          month={month}
          onChange={(nextYear, nextMonth) => {
            setYear(nextYear)
            setMonth(nextMonth)
          }}
        />
        <CategoryFilter
          categories={categories ?? []}
          value={categoryId}
          onChange={setCategoryId}
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Refresh"
          onClick={refresh}
          disabled={isFetching}
        >
          <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
        </Button>
      </div>
```

Ordine: search · MonthFilter · Filter · refresh. **Toolbar e tabella formano un gruppo ravvicinato**: avvolgi toolbar + Card in `<div className="space-y-2">` (così la toolbar sta più vicina alla tabella che alla card KPI). La Card della tabella parte direttamente con `CardContent` (niente toolbar interna).

- [ ] **Step 6: verifica.** Run: `npm run build && npm run lint`. Se il `Select` annidato nel menu dà problemi (chiusura del menu o posizionamento), riportalo invece di aggirarlo.
- [ ] **Step 7: CHECKPOINT UTENTE** su `/transactions`.

---

### Task 13d: Filtri data coerenti in tutte le pagine

**Files:**
- Create: `frontend/src/lib/period.ts`
- Create: `frontend/src/components/period-filter.tsx`
- Modify: `frontend/src/components/month-filter.tsx`
- Modify: `frontend/src/pages/transactions.tsx`
- Modify: `frontend/src/pages/dashboard.tsx`
- Modify: `frontend/src/pages/reports.tsx`

Nota: `Task 13b` è superato per la parte MonthFilter (anni da dati + valore azzurro).

- [ ] **Step 1: crea `frontend/src/lib/period.ts`:**

```ts
export type Period = "ytd" | "all" | number

export function todayISO(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}

export function periodRange(period: Period): { start: string; end: string } {
  const now = new Date()
  if (period === "all") return { start: "2000-01-01", end: todayISO() }
  if (period === "ytd") return { start: `${now.getFullYear()}-01-01`, end: todayISO() }
  return { start: `${period}-01-01`, end: `${period}-12-31` }
}

export function periodLabel(period: Period): string {
  if (period === "ytd") return "Year to date"
  if (period === "all") return "All time"
  return String(period)
}
```

- [ ] **Step 2: crea `frontend/src/components/period-filter.tsx`:**

```tsx
import { CalendarDays, Check, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { periodLabel, type Period } from "@/lib/period"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface PeriodFilterProps {
  value: Period
  onChange: (value: Period) => void
  years: number[]
}

export function PeriodFilter({ value, onChange, years }: PeriodFilterProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <CalendarDays className="size-4" />
        {periodLabel(value)}
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuItem
          onClick={() => onChange("ytd")}
          className={cn("justify-between", value === "ytd" && "text-selection")}
        >
          Year to date
          {value === "ytd" && <Check className="size-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onChange("all")}
          className={cn("justify-between", value === "all" && "text-selection")}
        >
          All time
          {value === "all" && <Check className="size-4" />}
        </DropdownMenuItem>
        {years.length > 0 && <DropdownMenuSeparator />}
        <div className="max-h-64 overflow-y-auto">
          {years.map((year) => (
            <DropdownMenuItem
              key={year}
              onClick={() => onChange(year)}
              className={cn("justify-between", value === year && "text-selection")}
            >
              {year}
              {value === year && <Check className="size-4" />}
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 3: `month-filter.tsx`** — anni da prop e valore azzurro: aggiungi `years: number[]` alle props, elimina `YEARS_BACK`/`currentYear`/`years` interni, il `Select` mappa `years`, e il trigger anno diventa `<SelectTrigger className="w-full text-selection">`.

- [ ] **Step 4: `transactions.tsx`** — aggiungi la query condivisa degli anni e passala:

```tsx
  const { data: allTimeTrend } = useQuery({
    queryKey: ["trend", "all"],
    queryFn: () => api.transactions.trend("2000-01-01", todayISO()),
  })

  const yearOptions = useMemo(() => {
    const present = new Set((allTimeTrend ?? []).map((point) => point.year))
    if (!present.has(year)) present.add(year)
    return [...present].sort((a, b) => b - a)
  }, [allTimeTrend, year])
```

`<MonthFilter year={year} month={month} years={yearOptions} onChange={...} />`. Aggiungi gli import `todayISO` da `@/lib/period` e `useMemo` di nuovo in cima.

- [ ] **Step 4b: hook condiviso** — crea `frontend/src/lib/use-all-time-trend.ts`:

```ts
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { ALL_TIME_START, todayISO } from "@/lib/period"

export function useAllTimeTrend() {
  return useQuery({
    queryKey: ["trend", "all"],
    queryFn: () => api.transactions.trend(ALL_TIME_START, todayISO()),
    staleTime: 60_000,
  })
}
```

In `lib/period.ts` aggiungi `export const ALL_TIME_START = "2000-01-01"` e usalo in `periodRange`. Sostituisci la query letterale in `transactions.tsx`, `dashboard.tsx` e `reports.tsx` con `useAllTimeTrend()`. Nel `refresh` di `transactions.tsx` invalida anche `{ queryKey: ["trend", "all"] }`. In `reports.tsx`, unisci l'anno selezionato agli anni come fa Transactions (`if (!present.has(period)) present.add(period)` quando `typeof period === "number"`), così il menu è coerente in entrambi i filtri.

- [ ] **Step 5: `dashboard.tsx`** — sostituisci `TrendRangeSelector`/`rangeToDates`/`TrendRange` con il filtro condiviso:
  - import: `PeriodFilter`, `periodRange`/`todayISO`/`type Period` da `@/lib/period`; rimuovi l'import di `trend-range-selector`.
  - stato: `const [period, setPeriod] = useState<Period>("all")`.
  - query anni (identica chiave di Reports, dedupe TanStack):

```tsx
  const { data: allTimeTrend } = useQuery({
    queryKey: ["trend", "all"],
    queryFn: () => api.transactions.trend("2000-01-01", todayISO()),
  })

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const present = new Set((allTimeTrend ?? []).map((point) => point.year))
    return [...present].filter((year) => year < currentYear).sort((a, b) => b - a)
  }, [allTimeTrend])
```

  - `const { start, end } = useMemo(() => periodRange(period), [period])`.
  - nel `CardAction` della trend card: `<PeriodFilter value={period} onChange={setPeriod} years={years} />`.
  - Nota (deviazione necessaria): `NetWorthDelta.range` in `dashboard-hero.tsx` passa da `TrendRange` a `string`; il delta pill mostra `(All time)`/`(Year to date)` ma **niente parentesi quando è selezionato un anno** (`range: typeof period === "number" ? "" : periodLabel(period)`), perché `since Jan 2024 (2024)` è ridondante.

- [ ] **Step 6: `reports.tsx`** — elimina `type Period`, `todayISO`, `periodRange`, `periodLabel` locali (import da `@/lib/period`); sostituisci il `Select` del periodo con `<PeriodFilter value={period} onChange={setPeriod} years={years} />`; rimuovi gli import `Select*` se non più usati.

- [ ] **Step 7: verifica.** Run: `npm run build && npm run lint`.
- [ ] **Step 8: CHECKPOINT UTENTE** su `/transactions`, `/overview`, `/reports/*`.

---

## Fase 2 — Pagine a gruppi

> Dopo ogni task: `npm run build && npm run lint` e checkpoint visivo dell'utente sulla pagina del gruppo.

### Task 14: Dashboard

**Files:**
- Modify: `frontend/src/pages/dashboard.tsx`

- [ ] **Step 1:** `amount: { label: "Net worth", color: "var(--primary)" }` → `amount: { label: "Net worth", color: "var(--foreground)" }`.
- [ ] **Step 2:** in `frontend/src/components/dashboard-hero.tsx` il numero hero è hardcoded `text-4xl` (36px): porta a `text-[32px]` (spec §4: hero 32/500). Il tipo `NetWorthDelta.range` è già `string` (Task 13d).
- [ ] **Step 3:** l'empty state inline di `dashboard-hero.tsx` (`No accounts yet.`) resta inline: è un pannello piccolo, il box tratteggiato lo appesantirebbe. Nessun'altra modifica.
- [ ] **Step 4: verifica + CHECKPOINT UTENTE** su `/overview`.

### Task 15: Assets

**Files:**
- Modify: `frontend/src/components/accounts-list.tsx`
- Modify: `frontend/src/pages/assets.tsx`

- [ ] **Step 1: `accounts-list.tsx`** — sostituisci i due empty testuali:
  - `<p className="text-sm text-muted-foreground">No buckets yet.</p>` → `<EmptyState title="No buckets yet" subtitle="Add a bucket to start grouping your accounts." />`
  - il blocco `No assets in this bucket yet.` (dentro `<div className="p-1.5">`) → `<EmptyState className="py-5" title="No assets in this bucket yet" />`
  - aggiungi l'import `import { EmptyState } from "@/components/empty-state"`.
- [ ] **Step 2: `transfers.tsx`** — tabella allo stile Transactions: rimuovi `grouped`/`dayLabel`/`MONTHS` (usa `SHORT_MONTHS` + `dateLabel` come in Transactions), header visibili (Date w-[120px] · Description · From → To w-[240px] · Amount right · Actions sr-only), righe piatte con cella Date `font-numeric text-[13px] text-muted-foreground`, footer conteggio dentro la Card, empty con `className="m-4"` e azione link sottolineata; rimuovi l'import `Fragment` e `useMemo` se non più usati.
- [ ] **Step 3:** in `frontend/src/pages/assets.tsx` converti le azioni dell'`EmptyState` di pagina in link sottolineati: `Button variant="link" className="underline underline-offset-4"` (spec §7: azione inline sottolineata).
- [ ] **Step 3b: container del donut** — in `frontend/src/components/allocation-overview.tsx` avvolgi la sezione in `Card > CardHeader > CardTitle "Allocation" > CardContent` (come Dashboard/Reports); la `<section>` interna diventa un `<div>` con lo stesso layout.
- [ ] **Step 4: verifica + CHECKPOINT UTENTE** su `/assets/accounts` e `/assets/transfers`.

### Task 16: Recurring + Categories + reconcile

**Files:**
- Modify: `frontend/src/pages/recurring.tsx`
- Modify: `frontend/src/pages/categories.tsx`
- Modify: `frontend/src/pages/transfers.tsx`
- Modify: `frontend/src/components/reconcile-panel.tsx`

- [ ] **Step 1: `recurring.tsx`** — banner default asset: `border-clay/30 bg-clay/10 ... text-clay` → `border-destructive/30 bg-destructive-soft ... text-destructive`.
- [ ] **Step 2: `reconcile-panel.tsx`** — tutte le occorrenze: `text-moss` → `text-positive`; `text-clay` → `text-destructive`.
- [ ] **Step 3: `reconcile-panel.tsx`** — la label di sezione (riga ~169): `"flex items-center gap-2 text-xs font-semibold tracking-[0.06em] uppercase"` → `"flex items-center gap-2 text-[13px] font-medium text-muted-foreground"`.
- [ ] **Step 3b: `categories.tsx`** — header visibile: `<TableHeader className="sr-only">` → `<TableHeader>`; la cella azioni diventa `<TableHead className="w-[1%] text-right"><span className="sr-only">Actions</span></TableHead>`.
- [ ] **Step 4: footer conteggio.** In `recurring.tsx`, subito dopo `</Table>` (riga ~249) dentro la Card:

```tsx
              <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[12.5px] text-faint-foreground">
                <span>
                  {(templates ?? []).length} template
                  {(templates ?? []).length === 1 ? "" : "s"}
                </span>
              </div>
```

In `categories.tsx`, subito dopo `</Table>` (riga ~125) dentro la Card:

```tsx
              <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[12.5px] text-faint-foreground">
                <span>
                  {groups.expense.length + groups.income.length} categories
                </span>
              </div>
```

- [ ] **Step 5: empty state.** In `recurring.tsx`, `transfers.tsx` e `categories.tsx`: aggiungi `className="m-4"` agli `EmptyState` renderizzati dentro Card `py-0`/`p-0` (evita il doppio bordo a filo) e converti le azioni in `Button variant="link" className="underline underline-offset-4"` (spec §7).
- [ ] **Step 6: verifica + CHECKPOINT UTENTE** su `/recurring` e `/categories`.

### Task 17: Reports

**Files:**
- Modify: `frontend/src/pages/reports.tsx`

- [ ] **Step 1:** `net: { label: "Net", color: "var(--primary)" }` → `net: { label: "Net", color: "var(--foreground)" }`.
- [ ] **Step 2: KPI.** In `reports.tsx`, su tutti gli `Stat` delle righe KPI: rimuovi `valueClassName="text-2xl xl:text-3xl"` e cambia `size="lg"` → `size="md"` (spec §4: KPI 26/650, coerente con Transactions).
- [ ] **Step 3:** controlla che `CHART_COLORS` punti a `var(--chart-1)` … `var(--chart-8)` (palette nuova via token) e che `OTHER_COLOR = "var(--color-muted-foreground)"` resti invariato.
- [ ] **Step 4: verifica + CHECKPOINT UTENTE** su `/reports/cash-flow`, `/reports/spending`, `/reports/income`.

### Task 18: Import

**Files:**
- Modify: `frontend/src/pages/import.tsx`

- [ ] **Step 1:** sostituisci ogni `text-clay` con `text-destructive` (5 occorrenze: asterischi required, "without category", `row.reason`, "Choose a category").
- [ ] **Step 2:** pager: `<ChevronLeft className="h-4 w-4" /> Previous` → `<ChevronLeft className="h-4 w-4" aria-hidden />`; `Next <ChevronRight className="h-4 w-4" />` → `<ChevronRight className="h-4 w-4" aria-hidden />` con `aria-label="Previous page"` / `aria-label="Next page"` sui Button e `size="icon-sm"`.
- [ ] **Step 3: verifica + CHECKPOINT UTENTE** su `/import` (upload, mapping, conferma categorie, pager).

### Task 19: Settings — setting rows + traduzione

**Files:**
- Modify: `frontend/src/pages/settings.tsx` (file intero)
- Modify: `frontend/src/components/bucket-delete-dialog.tsx` (residuo `clay` sfuggito ai task precedenti)

- [ ] **Step 1b: `bucket-delete-dialog.tsx`** — il cerchio del cestino: `bg-clay/10 text-clay` → `bg-destructive-soft text-destructive` (come `confirm-dialog.tsx`).

- [ ] **Step 1: sostituisci il contenuto con:**

```tsx
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import type { LinkCodeResponse } from "@/types/api"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function Settings() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [linkCode, setLinkCode] = useState<LinkCodeResponse | null>(null)

  const { data: assets } = useQuery({
    queryKey: ["assets"],
    queryFn: api.assets.list,
  })
  const liquidAssets = (assets ?? []).filter(
    (asset) => asset.liquidity_category === "liquid",
  )

  const { data: botInfo } = useQuery({
    queryKey: ["telegram-bot"],
    queryFn: api.telegram.botInfo,
  })

  const updateDefault = useMutation({
    mutationFn: (assetId: number | null) => api.auth.updateMe({ default_asset_id: assetId }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["me"], updated)
      toast.success("Default asset updated")
    },
    onError: () => {
      toast.error("Could not update the default asset")
    },
  })

  const generate = useMutation({
    mutationFn: api.telegram.createLinkCode,
    onSuccess: (data) => {
      setLinkCode(data)
      toast.success("Code generated")
    },
    onError: () => {
      toast.error("Could not generate the code")
    },
  })

  const revoke = useMutation({
    mutationFn: api.telegram.revokeLinkCodes,
    onSuccess: () => {
      setLinkCode(null)
      toast.success("Code revoked")
    },
    onError: () => {
      toast.error("Could not revoke the code")
    },
  })

  const selectedAsset = liquidAssets.find(
    (asset) => asset.id === user?.default_asset_id,
  )

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" subtitle="Account and preferences." />

      <section className="space-y-2">
        <h2 className="text-[13.5px] font-semibold">General</h2>
        <Card>
          <CardContent className="divide-y divide-border p-0">
            <div className="flex flex-wrap items-start justify-between gap-4 p-5">
              <div className="min-w-0 space-y-0.5">
                <p className="text-[13.5px] font-semibold">Default asset</p>
                <p className="max-w-prose text-[13px] text-muted-foreground">
                  Where quick entries land: Telegram bot expenses and recurring
                  templates. One is required.
                </p>
              </div>
              {liquidAssets.length === 0 ? (
                <p className="rounded-[10px] border border-dashed border-input bg-background px-3 py-2 text-[13px] text-muted-foreground">
                  No liquid assets yet. Create one in Assets first.
                </p>
              ) : (
                <Select
                  value={
                    user?.default_asset_id ? String(user.default_asset_id) : ""
                  }
                  onValueChange={(value) => {
                    if (!value) return
                    updateDefault.mutate(Number(value))
                  }}
                  disabled={updateDefault.isPending}
                >
                  <SelectTrigger className="w-[220px]">
                    <SelectValue>
                      {selectedAsset?.name ?? "Select an asset"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {liquidAssets.map((asset) => (
                      <SelectItem key={asset.id} value={String(asset.id)}>
                        {asset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-[13.5px] font-semibold">Telegram</h2>
        <Card>
          <CardContent className="divide-y divide-border p-0">
            <div className="flex flex-wrap items-start justify-between gap-4 p-5">
              <div className="min-w-0 space-y-0.5">
                <p className="text-[13.5px] font-semibold">Bot chat</p>
                <p className="max-w-prose text-[13px] text-muted-foreground">
                  Link your Telegram chat to record expenses from your phone,
                  without opening the app.{" "}
                  {botInfo?.bot_username ? (
                    <>
                      This installation&apos;s bot is{" "}
                      <a
                        href={`https://t.me/${botInfo.bot_username}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-foreground underline underline-offset-2"
                      >
                        @{botInfo.bot_username}
                      </a>
                      .
                    </>
                  ) : (
                    "The bot is the one configured for this installation (name unavailable)."
                  )}
                </p>
              </div>
              {!user?.default_asset_id && (
                <p className="rounded-[10px] border border-dashed border-input bg-background px-3 py-2 text-[13px] text-muted-foreground">
                  Choose a default asset first: without one the bot can&apos;t
                  record expenses.
                </p>
              )}
            </div>

            <div className="space-y-1.5 p-5 text-[13px]">
              <p>
                1. Generate a code below. 2. Open the bot chat and send{" "}
                <code className="rounded-[4px] border border-border bg-muted px-1 py-0.5 font-mono text-xs">
                  /link &lt;code&gt;
                </code>
                .
              </p>
              <p className="text-muted-foreground">
                The code lasts {linkCode?.expires_in_minutes ?? 10} minutes, is
                single-use and must not be shared: whoever sends it first links
                their chat to your account.
              </p>
              <p className="text-muted-foreground">
                Generating a new code cancels the previous one; &quot;Revoke&quot;
                cancels it immediately.
              </p>
              <p className="text-muted-foreground">
                Once linked, the chat stays linked until you send{" "}
                <code className="rounded-[4px] border border-border bg-muted px-1 py-0.5 font-mono text-xs">
                  /unlink
                </code>
                .
              </p>
              <p className="text-muted-foreground">
                Useful commands:{" "}
                <code className="rounded-[4px] border border-border bg-muted px-1 py-0.5 font-mono text-xs">
                  /balance
                </code>{" "}
                for the balance,{" "}
                <code className="rounded-[4px] border border-border bg-muted px-1 py-0.5 font-mono text-xs">
                  /unlink
                </code>{" "}
                to disconnect.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 p-5">
              <Button
                onClick={() => generate.mutate()}
                disabled={generate.isPending || !user?.default_asset_id}
              >
                {generate.isPending ? "Generating…" : "Generate code"}
              </Button>
              <Button
                variant="outline"
                onClick={() => revoke.mutate()}
                disabled={revoke.isPending || !user?.default_asset_id}
              >
                {revoke.isPending ? "Revoking…" : "Revoke code"}
              </Button>
              {linkCode && (
                <code className="rounded-[6px] border border-border bg-muted px-3 py-1.5 font-mono text-[13px] font-medium">
                  {linkCode.code}
                </code>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
```

NB: la card "Generale / Nulla da mostrare qui per ora." viene rimossa (contenuto vuoto).

- [ ] **Step 2: verifica + CHECKPOINT UTENTE** su `/settings` (lingua inglese ovunque, setting rows con hairline, chip `code`).

---

## Fase 3 — Docs e cleanup

### Task 20: Riscrittura guida stile

**Files:**
- Modify: `docs/design/ui-style-guide-pynance.md`

- [ ] **Step 1:** aggiorna l'intestazione: non più "clone visivo di app2" ma linguaggio neutro Console, con la nota dei due paletti (JetBrains Mono, sidebar).
- [ ] **Step 2: §1 Palette** — sostituisci le tabelle con i valori della spec §3 (neutri, azione, semantica, grafici, sidebar) e le regole d'uso: primary = azione, colore solo informativo, verdi/rossi semantici.
- [ ] **Step 3: §2 Tipografia** — sostituisci la tabella ruoli con quella della spec §4 (titolo 20, card 15, corpo 13.5–14, meta 12.5–13, KPI 26, hero 32); resta JetBrains Mono per le cifre.
- [ ] **Step 4: §3 Forme** — radius (card 12, dialog 16, bottoni/input 10, badge 6, chip 4), ombre (card solo hairline; raised `0 10px 30px /8%`), focus outline 2px `#171717`, densità (righe 44px).
- [ ] **Step 5: §4 Componenti** — aggiorna: tabella con footer interno e celle a due righe; empty state tratteggiato; setting rows; icon-button outline 36px; badge radius 6; dot di stato; chip `code`; toast neutrali; grafici con net quasi-nero.
- [ ] **Step 6: §7 Impaginazione** — colonna `max-w-[1440px]` centrata, header di pagina senza banda con tab underline, sidebar bianca con voce attiva `--muted`.
- [ ] **Step 7:** `docs/tasks/frontend-rebrand-console.md` — stato → "implementato".

### Task 21: Cleanup

**Files:**
- Modify: `frontend/src/index.css`
- Delete: `frontend/src/lib/prefetch.ts` e `frontend/src/components/accounts-table.tsx` (solo con autorizzazione esplicita dell'utente)

- [ ] **Step 1:** rimuovi gli alias `--clay`/`--moss` da `:root` e `--color-clay`/`--color-moss` da `@theme inline`; verifica con `rg "clay|moss" frontend/src` → 0 hit reali (i match `translate-y-px`/`translate-x-*` sono falsi positivi).
- [ ] **Step 2:** `rg "dark:" frontend/src` → restano solo falsi positivi noti (`chart.tsx` `THEMES` con la stringa `".dark"`); rimuovi tutti i `dark:` reali residui **e** la riga `@custom-variant dark (&:is(.dark *));` da `index.css` (a questo punto è sicuro: nessun `dark:` resta da attivare).
- [ ] **Step 3:** chiedi l'autorizzazione e, se concessa, elimina `frontend/src/lib/prefetch.ts`, `frontend/src/components/accounts-table.tsx`, `frontend/src/components/month-picker.tsx`, `frontend/src/components/trend-range-selector.tsx` e `frontend/src/components/segmented.tsx` (dead code verificato: superati rispettivamente da `month-filter.tsx`, `period-filter.tsx` e dal filtro condiviso in Task 13d).
- [ ] **Step 3b:** token orfani `--positive-chart` e `--primary-soft`: **rimossi** (nessun consumer a fine rebrand; tolti anche da spec e guida).
- [ ] **Step 3c:** se il pilot ha confermato l'outline globale come unico focus, rimuovi i ring `aria-invalid:ring-3 aria-invalid:ring-destructive/20` da `ui/input.tsx` e `ui/select.tsx` (resta `aria-invalid:border-destructive`).
- [ ] **Step 4: verifica.** Run: `npm run build && npm run lint`.

### Task 22: Accettazione finale

- [ ] **Step 1:** `npm run build && npm run lint` da `frontend/` → build ok, 4 warning preesistenti.
- [ ] **Step 2:** checklist di accettazione contro la spec §3–§8: token, tipografia, shell, componenti, ogni pagina del §8.
- [ ] **Step 3:** giro visivo finale dell'utente su tutte le pagine.
- [ ] **Step 4:** proponi il messaggio di commit (nessun commit autonomo), es. `refactor(frontend): rebrand to neutral Console-style design system`.
