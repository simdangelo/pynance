import { useMemo, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"

import { api } from "@/lib/api"
import type { AssetType } from "@/types/api"
import { Money } from "@/components/money"
import { PageHeader } from "@/components/page-header"
import { TrendRangeSelector, type TrendRange } from "@/components/trend-range-selector"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  liquid: "Liquid",
  savings: "Savings",
  etf: "ETF",
}

const ASSET_TYPE_COLOR: Record<AssetType, string> = {
  liquid: "#0284c7",
  savings: "#059669",
  etf: "#d97706",
}

function rangeToDates(range: TrendRange): { start: string; end: string } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const fmt = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }

  const start = new Date(today)
  switch (range) {
    case "YTD":
      start.setMonth(0)
      start.setDate(1)
      break
    case "1Y":
      start.setFullYear(start.getFullYear() - 1)
      break
    case "5Y":
      start.setFullYear(start.getFullYear() - 5)
      break
    case "ALL":
      start.setFullYear(2000)
      start.setMonth(0)
      start.setDate(1)
      break
  }
  return { start: fmt(start), end: fmt(today) }
}

export default function Dashboard() {
  const [range, setRange] = useState<TrendRange>("ALL")

  const { data: assets, isLoading: assetsLoading } = useQuery({
    queryKey: ["assets"],
    queryFn: api.assets.list,
  })

  const { start, end } = useMemo(() => rangeToDates(range), [range])

  const { data: trend, isLoading, isError } = useQuery({
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

  const allocationData = useMemo(() => {
    const totals: Record<AssetType, number> = { liquid: 0, savings: 0, etf: 0 }
    for (const asset of assets ?? []) {
      totals[asset.asset_type] += Number(asset.balance)
    }
    const total = Object.values(totals).reduce((sum, v) => sum + v, 0) || 1
    return (Object.keys(ASSET_TYPE_LABEL) as AssetType[])
      .filter((type) => totals[type] > 0)
      .map((type) => ({
        name: ASSET_TYPE_LABEL[type],
        value: totals[type],
        color: ASSET_TYPE_COLOR[type],
        pct: ((totals[type] / total) * 100).toFixed(1),
      }))
  }, [assets])

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Your net worth at a glance." />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Net worth</CardTitle>
        </CardHeader>
        <CardContent>
          {assetsLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <Money
              value={totalBalance}
              className="text-4xl font-semibold tracking-tight text-sky-600"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Net worth</CardTitle>
          <TrendRangeSelector value={range} onChange={setRange} />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : isError ? (
            <p className="text-sm text-destructive">Failed to load net worth.</p>
          ) : trendData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No net worth history in this range.</p>
          ) : (
            <div className="min-h-[280px]">
              <ChartContainer
                config={{ amount: { label: "Net worth", color: "#0284c7" } }}
                className="h-[320px] w-full"
              >
                <LineChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
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
                    tick={{ className: "font-numeric text-xs" }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    stroke="var(--color-amount, #0284c7)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ChartContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Allocation</CardTitle>
        </CardHeader>
        <CardContent>
          {assetsLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : allocationData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assets yet.</p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
              <div className="min-h-[200px]">
                <ChartContainer config={{}} className="h-[200px] w-full">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie
                      data={allocationData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      strokeWidth={0}
                      isAnimationActive={false}
                    >
                      {allocationData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </div>
              <ul className="space-y-1">
                {allocationData.map((entry) => (
                  <li key={entry.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-[2px]"
                        style={{ backgroundColor: entry.color }}
                      />
                      {entry.name}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{entry.pct}%</span>
                      <Money value={entry.value.toFixed(2)} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <CashFlowChart />
    </div>
  )
}

function CashFlowChart() {
  const year = new Date().getFullYear()
  const { data: trend, isLoading, isError } = useQuery({
    queryKey: ["trend", year],
    queryFn: () => api.transactions.trend(`${year}-01-01`, `${year}-12-31`),
    placeholderData: keepPreviousData,
  })

  const data = useMemo(
    () =>
      (trend ?? []).map((point) => ({
        month: `${point.year}-${String(point.month).padStart(2, "0")}`,
        income: Number(point.income),
        expense: Number(point.expense),
      })),
    [trend],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cash flow · {year}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : isError ? (
          <p className="text-sm text-destructive">Failed to load cash flow.</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity this year.</p>
        ) : (
          <ChartContainer
            config={{
              income: { label: "Income", color: "#059669" },
              expense: { label: "Expense", color: "#e11d48" },
            }}
            className="h-[280px] w-full"
          >
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
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
                tick={{ className: "font-numeric text-xs" }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                type="monotone"
                dataKey="income"
                stroke="var(--color-income, #059669)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="expense"
                stroke="var(--color-expense, #e11d48)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}