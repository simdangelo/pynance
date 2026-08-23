import { useMemo, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Cell, Pie, PieChart, Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { api } from "@/lib/api"
import type { AssetType } from "@/types/api"
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
  liquid: "#0284c7",
  savings: "#059669",
  etf: "#d97706",
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
      {/* Hero */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Net worth
          </CardTitle>
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

      {/* Trend */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Net worth trend</CardTitle>
            <TrendRangeSelector value={range} onChange={setRange} />
          </div>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : trendError ? (
            <p className="text-sm text-destructive">Failed to load net worth.</p>
          ) : trendData.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No net worth history in this range.
            </p>
          ) : (
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
          )}
        </CardContent>
      </Card>

      {/* Allocation */}
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
                  <li
                    key={entry.name}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-[2px]"
                        style={{ backgroundColor: entry.color }}
                      />
                      {entry.name}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {entry.pct}%
                      </span>
                      <Money value={entry.value.toFixed(2)} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}