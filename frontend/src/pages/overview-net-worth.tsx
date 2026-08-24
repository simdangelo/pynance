import { useMemo, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { api } from "@/lib/api"
import type { AssetType } from "@/types/api"
import { cn } from "@/lib/utils"
import { Money } from "@/components/money"
import { TrendRangeSelector, rangeToDates, type TrendRange } from "@/components/trend-range-selector"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  liquid: "Liquid",
  savings: "Savings",
  etf: "ETF",
}

const ASSET_TYPE_COLOR: Record<AssetType, string> = {
  liquid: "var(--color-petrol)",
  savings: "var(--color-moss)",
  etf: "var(--color-ochre)",
}

const ASSET_TYPES = Object.keys(ASSET_TYPE_LABEL) as AssetType[]

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

  const allocationData = useMemo(() => {
    const totals: Record<AssetType, number> = { liquid: 0, savings: 0, etf: 0 }
    for (const asset of assets ?? []) {
      totals[asset.asset_type] += Number(asset.balance)
    }
    const total = Object.values(totals).reduce((sum, v) => sum + v, 0) || 1
    return ASSET_TYPES.map((type) => ({
      type,
      name: ASSET_TYPE_LABEL[type],
      value: totals[type],
      pct: (totals[type] / total) * 100,
      color: ASSET_TYPE_COLOR[type],
    }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [assets])

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
                  type="monotone"
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

      {/* Allocation — snapshot, type-level, below the chart */}
      {!assetsLoading && allocationData.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground/60 uppercase">
                Current allocation
              </span>
              <div className="text-sm text-muted-foreground">
                By asset type, today
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
              {allocationData.map((entry) => (
                <div
                  key={entry.type}
                  className="h-full"
                  style={{
                    width: `${Math.max(entry.pct, 1)}%`,
                    backgroundColor: entry.color,
                  }}
                />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {allocationData.map((entry) => (
                <span key={entry.type} className="flex items-center gap-2 text-sm">
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