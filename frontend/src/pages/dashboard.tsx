import { useMemo, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { api } from "@/lib/api"
import { DashboardHero, type LiquidityEntry } from "@/components/dashboard-hero"
import { PageHeader } from "@/components/page-header"
import {
  TrendRangeSelector,
  rangeToDates,
  type TrendRange,
} from "@/components/trend-range-selector"
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
  const [year, m] = month.split("-")
  return `${MONTHS[Number(m) - 1]} ${year}`
}

function formatCompact(value: number): string {
  return Math.abs(value) >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
}

function greeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

export default function Dashboard() {
  const [range, setRange] = useState<TrendRange>("ALL")

  const {
    data: allocation,
    isLoading: allocationLoading,
    isError: allocationError,
  } = useQuery({
    queryKey: ["allocation"],
    queryFn: api.assets.allocation,
  })

  const { start, end } = useMemo(() => rangeToDates(range), [range])

  const {
    data: trend,
    isLoading: trendLoading,
    isError: trendError,
    isPlaceholderData: trendIsPlaceholder,
  } = useQuery({
    queryKey: ["net-worth-trend", start, end],
    queryFn: () => api.assets.netWorthTrend(start, end),
    placeholderData: keepPreviousData,
  })

  const liquidity = useMemo<LiquidityEntry[]>(
    () =>
      (allocation?.by_liquidity ?? []).map((row) => ({
        category: row.liquidity_category,
        total: Number(row.total).toFixed(2),
      })),
    [allocation],
  )

  const trendData = useMemo(
    () =>
      (trend ?? []).map((point) => ({
        month: `${point.year}-${String(point.month).padStart(2, "0")}`,
        amount: Number(point.amount),
      })),
    [trend],
  )

  const delta = useMemo(() => {
    if (trendIsPlaceholder) return null
    if (trendData.length < 2) return null
    const first = trendData[0].amount
    if (!first) return null
    return {
      pct:
        ((trendData[trendData.length - 1].amount - first) / Math.abs(first)) * 100,
      sinceLabel: monthLabel(trendData[0].month),
      range,
    }
  }, [trendData, range, trendIsPlaceholder])

  return (
    <div className="space-y-6">
      <PageHeader title={greeting()} />

      <DashboardHero
        delta={delta}
        liquidity={liquidity}
        loading={allocationLoading}
        error={allocationError}
      />

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
            <p className="py-8 text-center text-sm text-destructive">
              Failed to load net worth.
            </p>
          ) : trendData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No net worth history in this range.
            </p>
          ) : (
            <ChartContainer
              config={{ amount: { label: "Net worth", color: "var(--color-primary)" } }}
              className="h-[380px] w-full"
            >
              <AreaChart
                data={trendData}
                margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
              >
                <defs>
                  <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="var(--color-primary)"
                      stopOpacity={0.18}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--color-primary)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={monthLabel}
                  minTickGap={32}
                  interval="preserveStartEnd"
                  tick={{ className: "font-numeric text-xs" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={formatCompact}
                  tick={{ className: "font-numeric text-xs" }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="linear"
                  dataKey="amount"
                  stroke="var(--color-primary)"
                  strokeWidth={2.5}
                  fill="url(#netWorthFill)"
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
