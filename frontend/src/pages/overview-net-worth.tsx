import { useMemo, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { api } from "@/lib/api"
import {
  ASSET_CLASSES,
  ASSET_CLASS_COLOR,
  ASSET_CLASS_LABEL,
  LIQUIDITY_COLOR,
  LIQUIDITY_LABEL,
} from "@/lib/asset-meta"
import { cn } from "@/lib/utils"
import { Money } from "@/components/money"
import { TrendRangeSelector, rangeToDates, type TrendRange } from "@/components/trend-range-selector"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

function monthLabel(month: string): string {
  const [y, m] = month.split("-")
  return `${MONTHS[Number(m) - 1]} ${y}`
}

export default function OverviewNetWorth() {
  const [range, setRange] = useState<TrendRange>("ALL")

  const { data: assets, isLoading: assetsLoading } = useQuery({
    queryKey: ["assets"],
    queryFn: api.assets.list,
  })

  const { data: allocation, isLoading: allocationLoading } = useQuery({
    queryKey: ["allocation"],
    queryFn: api.assets.allocation,
  })

  const { start, end } = useMemo(() => rangeToDates(range), [range])

  const { data: trend, isLoading: trendLoading, isError: trendError } = useQuery({
    queryKey: ["net-worth-trend", start, end],
    queryFn: () => api.assets.netWorthTrend(start, end),
    placeholderData: keepPreviousData,
  })

  const totalBalance = useMemo(
    () =>
      (assets ?? [])
        .reduce((sum, asset) => sum + Number(asset.balance), 0)
        .toFixed(2),
    [assets],
  )

  const trendData = useMemo(
    () =>
      (trend ?? []).map((point) => ({
        month: `${point.year}-${String(point.month).padStart(2, "0")}`,
        amount: Number(point.amount),
      })),
    [trend],
  )

  const deltaPct = useMemo(() => {
    if (trendData.length < 2) return null
    const first = trendData[0].amount
    if (!first) return null
    return ((trendData[trendData.length - 1].amount - first) / Math.abs(first)) * 100
  }, [trendData])

  const sinceLabel = trendData.length ? monthLabel(trendData[0].month) : null
  const isPositive = (deltaPct ?? 0) >= 0
  const moodColor = isPositive ? "var(--color-petrol)" : "var(--color-clay)"
  const moodGradientId = isPositive ? "moodPetrol" : "moodClay"

  const classAllocation = useMemo(() => {
    const totals: Partial<Record<string, number>> = {}
    for (const asset of assets ?? []) {
      totals[asset.asset_class] = (totals[asset.asset_class] ?? 0) + Number(asset.balance)
    }
    const sum = Object.values(totals).reduce<number>((acc, value) => acc + (value ?? 0), 0)
    return ASSET_CLASSES.map((assetClass) => ({
      assetClass,
      name: ASSET_CLASS_LABEL[assetClass],
      value: totals[assetClass] ?? 0,
      pct: sum > 0 ? ((totals[assetClass] ?? 0) / sum) * 100 : 0,
      color: ASSET_CLASS_COLOR[assetClass],
    }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [assets])

  const liquidityRows = allocation?.by_liquidity ?? []
  const liquidityTotal = liquidityRows.reduce((sum, row) => sum + Number(row.total), 0)

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section className="space-y-1.5 pt-1">
        <span className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground/60 uppercase">
          Net worth
        </span>
        <div className="space-y-1">
          <span className="block font-numeric text-4xl leading-none font-medium tracking-tight">
            {assetsLoading ? (
              <span className="text-muted-foreground/40">—</span>
            ) : (
              <Money value={totalBalance} />
            )}
          </span>
          {deltaPct !== null && sinceLabel && (
            <div className="flex items-center gap-2 text-sm">
              <span
                className={cn(
                  "text-[10px]",
                  isPositive ? "text-moss" : "text-clay",
                )}
              >
                {isPositive ? "▲" : "▼"}
              </span>
              <span
                className={cn(
                  "font-numeric font-medium",
                  isPositive ? "text-moss" : "text-clay",
                )}
              >
                {isPositive ? "+" : "−"}
                {Math.abs(deltaPct).toFixed(1)}%
              </span>
              <span className="text-muted-foreground">
                · since {sinceLabel} ({range})
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Liquidity — spendable / reserve / invested, from the buckets */}
      {!allocationLoading && (assets?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground/60 uppercase">
                Liquidity
              </span>
              <div className="text-sm text-muted-foreground">
                What you can spend, what you keep as a reserve, what is invested
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {liquidityRows.map((row) => (
                <div key={row.liquidity_category}>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: LIQUIDITY_COLOR[row.liquidity_category] }}
                    />
                    {LIQUIDITY_LABEL[row.liquidity_category]}
                  </span>
                  <span className="mt-1 block font-numeric text-lg font-medium">
                    <Money value={row.total} />
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
              {liquidityRows.map((row) => {
                const pct =
                  liquidityTotal > 0 ? (Number(row.total) / liquidityTotal) * 100 : 0
                return (
                  <div
                    key={row.liquidity_category}
                    className="h-full"
                    style={{
                      width: `${Math.max(pct, 1)}%`,
                      backgroundColor: LIQUIDITY_COLOR[row.liquidity_category],
                    }}
                  />
                )
              })}
            </div>
            {allocation && allocation.by_bucket.length > 0 && (
              <div className="mt-4 space-y-1.5 border-t border-border pt-3">
                {allocation.by_bucket.map((row) => (
                  <div
                    key={row.bucket_id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: LIQUIDITY_COLOR[row.liquidity_category] }}
                      />
                      <span className="font-medium">{row.bucket_name}</span>
                    </span>
                    <Money value={row.total} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Trend — full width */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Net worth trend</CardTitle>
            <TrendRangeSelector value={range} onChange={setRange} />
          </div>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : trendError ? (
            <p className="py-8 text-center text-sm text-destructive">Failed to load net worth.</p>
          ) : trendData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No net worth history in this range.
            </p>
          ) : (
            <ChartContainer
              config={{ amount: { label: "Net worth", color: moodColor } }}
              className="h-[380px] w-full"
            >
              <AreaChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id={moodGradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={moodColor} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={moodColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ className: "font-numeric text-xs" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={70}
                  tick={{ className: "font-numeric text-xs" }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="linear"
                  dataKey="amount"
                  stroke={moodColor}
                  strokeWidth={2.5}
                  fill={`url(#${moodGradientId})`}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Allocation — snapshot, asset class level, below the chart */}
      {!assetsLoading && classAllocation.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground/60 uppercase">
                Current allocation
              </span>
              <div className="text-sm text-muted-foreground">
                By asset class, today
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
              {classAllocation.map((entry) => (
                <div
                  key={entry.assetClass}
                  className="h-full"
                  style={{
                    width: `${Math.max(entry.pct, 1)}%`,
                    backgroundColor: entry.color,
                  }}
                />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {classAllocation.map((entry) => (
                <span key={entry.assetClass} className="flex items-center gap-2 text-sm">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="font-medium">{entry.name}</span>
                  <span className="text-muted-foreground">·</span>
                  <Money value={entry.value.toFixed(2)} />
                  <span className="text-muted-foreground">·</span>
                  <span className="font-numeric text-muted-foreground">
                    {entry.pct.toFixed(0)}%
                  </span>
                </span>
              ))}
            </div>
            <div className="mt-5 border-t border-border pt-4">
              <Link
                to="/assets"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground transition-colors hover:text-muted-foreground"
              >
                View accounts in Assets
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}