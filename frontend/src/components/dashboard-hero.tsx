import { Fragment } from "react"
import { Link } from "react-router-dom"

import type { LiquidityCategory } from "@/types/api"
import {
  LIQUIDITY_CATEGORIES,
  LIQUIDITY_COLOR,
  LIQUIDITY_LABEL,
} from "@/lib/asset-meta"
import { cn } from "@/lib/utils"
import { DonutChart } from "@/components/donut-chart"
import { Money } from "@/components/money"
import { StatLabel } from "@/components/stat-label"
import { Card, CardContent } from "@/components/ui/card"
import type { TrendRange } from "@/components/trend-range-selector"

export interface LiquidityEntry {
  category: LiquidityCategory
  total: string
}

export interface NetWorthDelta {
  pct: number
  sinceLabel: string
  range: TrendRange
}

interface DashboardHeroProps {
  delta: NetWorthDelta | null
  liquidity: LiquidityEntry[]
  loading: boolean
  error: boolean
}

interface LiquiditySlice {
  category: LiquidityCategory
  label: string
  color: string
  amount: number
  value: string
  pct: number | null
}

function buildSlices(entries: LiquidityEntry[]): {
  slices: LiquiditySlice[]
  total: number
} {
  const rows = entries.map((entry) => ({ ...entry, amount: Number(entry.total) }))
  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  const positiveTotal = rows.reduce(
    (sum, row) => (row.amount > 0 ? sum + row.amount : sum),
    0,
  )
  const slices = rows.map((row) => ({
    category: row.category,
    label: LIQUIDITY_LABEL[row.category],
    color: LIQUIDITY_COLOR[row.category],
    amount: row.amount,
    value: row.amount.toFixed(2),
    pct:
      row.amount > 0 && positiveTotal > 0
        ? Math.round((row.amount / positiveTotal) * 100)
        : null,
  }))
  return { slices, total }
}

function DeltaPill({ delta }: { delta: NetWorthDelta }) {
  const isPositive = delta.pct >= 0
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-numeric text-xs font-medium",
          isPositive
            ? "bg-positive-soft text-positive"
            : "bg-destructive-soft text-destructive",
        )}
      >
        <span className="text-[9px]" aria-hidden>
          {isPositive ? "▲" : "▼"}
        </span>
        <span className="sr-only">{isPositive ? "up" : "down"}</span>
        {Math.abs(delta.pct).toFixed(1)}%
      </span>
      <span className="text-muted-foreground">
        since {delta.sinceLabel} ({delta.range})
      </span>
    </div>
  )
}

function NetWorthValue({
  total,
  loading,
  error,
}: {
  total: number
  loading: boolean
  error: boolean
}) {
  return (
    <span className="block font-numeric text-4xl leading-none font-medium tracking-tight">
      {loading || error ? (
        <span className="text-faint-foreground">—</span>
      ) : (
        <Money value={total.toFixed(2)} />
      )}
    </span>
  )
}

function LiquidityLoading() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="size-28 shrink-0 rounded-full bg-muted" />
      <div className="flex flex-1 flex-col gap-2">
        {LIQUIDITY_CATEGORIES.map((category) => (
          <div
            key={category}
            className="grid grid-cols-[auto_1fr_auto_3rem] items-center gap-x-3"
          >
            <span className="size-2 rounded-full bg-muted" />
            <span className="text-sm text-muted-foreground">
              {LIQUIDITY_LABEL[category]}
            </span>
            <span className="text-right text-sm text-faint-foreground">—</span>
            <span className="text-right font-numeric text-xs text-faint-foreground">
              —
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LiquidityError() {
  return (
    <p className="text-sm text-muted-foreground">Couldn&apos;t load your allocation</p>
  )
}

function EmptyLiquidity() {
  return (
    <p className="text-sm text-muted-foreground">
      No accounts yet.{" "}
      <Link
        to="/assets"
        className="font-medium text-foreground underline-offset-4 hover:underline"
      >
        Add an account in Assets
      </Link>
    </p>
  )
}

function AllocationDonut({ slices }: { slices: LiquiditySlice[] }) {
  if (slices.length === 0) return null
  return (
    <DonutChart
      data={slices.map((slice) => ({
        label: slice.label,
        value: slice.amount,
        color: slice.color,
      }))}
      className="size-28 shrink-0"
      innerRadius={34}
      outerRadius={52}
    />
  )
}

function AllocationLegend({ slices }: { slices: LiquiditySlice[] }) {
  return (
    <div className="grid flex-1 grid-cols-[auto_1fr_auto_3rem] items-center gap-x-3 gap-y-2">
      {slices.map((slice) => (
        <Fragment key={slice.category}>
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: slice.color }}
          />
          <span className="text-sm text-muted-foreground">{slice.label}</span>
          <span className="text-right text-sm">
            <Money value={slice.value} />
          </span>
          <span className="text-right font-numeric text-xs text-muted-foreground/80">
            {slice.pct === null ? "—" : `${slice.pct}%`}
          </span>
        </Fragment>
      ))}
    </div>
  )
}

export function DashboardHero({ delta, liquidity, loading, error }: DashboardHeroProps) {
  const { slices, total } = buildSlices(liquidity)
  const hasAssets = total !== 0
  const positiveSlices = slices.filter((slice) => slice.amount > 0)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-3">
          <StatLabel>Net worth</StatLabel>
          <NetWorthValue total={total} loading={loading} error={error} />
          {delta && !loading && !error && <DeltaPill delta={delta} />}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <StatLabel>Allocation</StatLabel>
          {error ? (
            <LiquidityError />
          ) : loading ? (
            <LiquidityLoading />
          ) : !hasAssets ? (
            <EmptyLiquidity />
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <AllocationDonut slices={positiveSlices} />
              <AllocationLegend slices={slices} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
