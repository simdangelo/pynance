import { useMemo, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { api } from "@/lib/api"
import { formatCompact, monthLabel } from "@/lib/chart"
import { periodLabel, periodRange, type Period } from "@/lib/period"
import { useAllTimeTrend } from "@/lib/use-all-time-trend"
import { DashboardHero, type LiquidityEntry } from "@/components/dashboard-hero"
import { PageHeader } from "@/components/page-header"
import { PeriodFilter } from "@/components/period-filter"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const NET_WORTH_CONFIG = {
  amount: { label: "Net worth", color: "var(--foreground)" },
} satisfies ChartConfig

function greeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>("all")

  const {
    data: allocation,
    isLoading: allocationLoading,
    isError: allocationError,
  } = useQuery({
    queryKey: ["allocation"],
    queryFn: api.assets.allocation,
  })

  const { data: allTimeTrend } = useAllTimeTrend()

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const present = new Set((allTimeTrend ?? []).map((point) => point.year))
    return [...present].filter((year) => year < currentYear).sort((a, b) => b - a)
  }, [allTimeTrend])

  const { start, end } = useMemo(() => periodRange(period), [period])

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
      range: typeof period === "number" ? "" : periodLabel(period),
    }
  }, [trendData, period, trendIsPlaceholder])

  return (
    <div className="space-y-5">
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
            <PeriodFilter value={period} onChange={setPeriod} years={years} />
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
            <ChartContainer config={NET_WORTH_CONFIG} className="h-[380px] w-full">
              <AreaChart
                accessibilityLayer
                data={trendData}
                margin={{ left: 12, right: 12 }}
              >
                <defs>
                  <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="var(--color-amount)"
                      stopOpacity={0.18}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--color-amount)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="var(--color-chart-grid)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                  interval="preserveStartEnd"
                  tick={{ className: "font-numeric" }}
                  tickFormatter={monthLabel}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tick={{ className: "font-numeric" }}
                  tickFormatter={formatCompact}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => monthLabel(String(value))}
                    />
                  }
                />
                <Area
                  dataKey="amount"
                  type="linear"
                  stroke="var(--color-amount)"
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
