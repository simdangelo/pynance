import { useMemo } from "react"
import { Navigate, Route, Routes, useSearchParams } from "react-router-dom"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import { api } from "@/lib/api"
import { formatCompact, monthLabel } from "@/lib/chart"
import { periodRange, type Period } from "@/lib/period"
import { useAllTimeTrend } from "@/lib/use-all-time-trend"
import { cn } from "@/lib/utils"
import type { TransactionType } from "@/types/api"
import { DonutChart } from "@/components/donut-chart"
import { Money } from "@/components/money"
import { PageHeader } from "@/components/page-header"
import { PageTabs } from "@/components/page-tabs"
import { PeriodFilter } from "@/components/period-filter"
import { Stat } from "@/components/stat"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const TABS = [
  { to: "/reports/cash-flow", label: "Cash Flow" },
  { to: "/reports/spending", label: "Spending" },
  { to: "/reports/income", label: "Income" },
]

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
  "var(--color-chart-7)",
  "var(--color-chart-8)",
]

const OTHER_COLOR = "var(--color-muted-foreground)"

const CASH_FLOW_CONFIG = {
  income: { label: "Income", color: "var(--positive)" },
  expense: { label: "Expense", color: "var(--destructive)" },
  net: { label: "Net", color: "var(--foreground)" },
} satisfies ChartConfig

function periodMonths(period: Period, firstMonth: string | null): number {
  const now = new Date()
  if (period === "ytd") return now.getMonth() + 1
  if (period === "all") {
    if (!firstMonth) return 1
    const [year, month] = firstMonth.split("-").map(Number)
    return (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month) + 1
  }
  return 12
}

export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams()
  const periodParam = searchParams.get("period")
  const period: Period = /^\d{4}$/.test(periodParam ?? "")
    ? Number(periodParam)
    : periodParam === "ytd"
      ? "ytd"
      : "all"

  const setPeriod = (next: Period) => {
    const params = new URLSearchParams(searchParams)
    if (next === "all") {
      params.delete("period")
    } else {
      params.set("period", String(next))
    }
    setSearchParams(params, { replace: true })
  }

  const { data: allTimeTrend } = useAllTimeTrend()

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const present = new Set((allTimeTrend ?? []).map((point) => point.year))
    if (typeof period === "number") present.add(period)
    return [...present].filter((year) => year < currentYear || year === period).sort((a, b) => b - a)
  }, [allTimeTrend, period])

  const firstMonth = allTimeTrend?.length
    ? `${allTimeTrend[0].year}-${String(allTimeTrend[0].month).padStart(2, "0")}`
    : null
  const months = periodMonths(period, firstMonth)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        tabs={<PageTabs tabs={TABS} />}
        action={
          <PeriodFilter value={period} onChange={setPeriod} years={years} />
        }
      />

      <Routes>
        <Route index element={<Navigate to="cash-flow" replace />} />
        <Route
          path="cash-flow"
          element={<CashFlowPanel period={period} months={months} />}
        />
        <Route
          path="spending"
          element={
            <BreakdownPanel type="expense" period={period} months={months} />
          }
        />
        <Route
          path="income"
          element={
            <BreakdownPanel type="income" period={period} months={months} />
          }
        />
        <Route path="*" element={<Navigate to="cash-flow" replace />} />
      </Routes>
    </div>
  )
}

function CashFlowPanel({
  period,
  months,
}: {
  period: Period
  months: number
}) {
  const { start, end } = useMemo(() => periodRange(period), [period])

  const { data: trend, isLoading, isError } = useQuery({
    queryKey: ["trend", start, end],
    queryFn: () => api.transactions.trend(start, end),
    placeholderData: keepPreviousData,
  })

  const chartData = useMemo(
    () =>
      (trend ?? []).map((point) => ({
        month: `${point.year}-${String(point.month).padStart(2, "0")}`,
        income: Number(point.income),
        expense: Number(point.expense),
        net: Number(point.income) - Number(point.expense),
      })),
    [trend],
  )

  const totalIncome = chartData.reduce((sum, row) => sum + row.income, 0)
  const totalExpense = chartData.reduce((sum, row) => sum + row.expense, 0)
  const netIncome = totalIncome - totalExpense
  const netAverage = months > 0 ? netIncome / months : 0
  const savingRate = totalIncome > 0 ? (netIncome / totalIncome) * 100 : null

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat
            label="Net income"
            value={
              isLoading ? (
                <span className="text-muted-foreground/40">—</span>
              ) : (
                <Money value={netIncome.toFixed(2)} signed />
              )
            }
            size="md"
          />
          <Stat
            label="Net income average per month"
            value={
              isLoading ? (
                <span className="text-muted-foreground/40">—</span>
              ) : (
                <Money value={netAverage.toFixed(2)} signed />
              )
            }
            size="md"
            className="sm:border-l sm:border-border sm:pl-4"
          />
          <Stat
            label="% saving"
            value={
              isLoading ? (
                <span className="text-muted-foreground/40">—</span>
              ) : savingRate === null ? (
                "—"
              ) : (
                `${savingRate.toFixed(1)}%`
              )
            }
            size="md"
            className="sm:border-l sm:border-border sm:pl-4"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cash flow</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              Failed to load the cash flow.
            </p>
          ) : chartData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No activity in this period.
            </p>
          ) : (
            <ChartContainer config={CASH_FLOW_CONFIG} className="h-[320px] w-full">
              <LineChart
                accessibilityLayer
                data={chartData}
                margin={{ left: 12, right: 12 }}
              >
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
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  dataKey="income"
                  type="linear"
                  stroke="var(--color-income)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="expense"
                  type="linear"
                  stroke="var(--color-expense)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="net"
                  type="linear"
                  stroke="var(--color-net)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function BreakdownPanel({
  type,
  period,
  months,
}: {
  type: TransactionType
  period: Period
  months: number
}) {
  const { start, end } = useMemo(() => periodRange(period), [period])

  const { data: trend } = useQuery({
    queryKey: ["trend", start, end],
    queryFn: () => api.transactions.trend(start, end),
    placeholderData: keepPreviousData,
  })

  const { data: byCategory, isLoading, isError } = useQuery({
    queryKey: ["trend-by-category", start, end],
    queryFn: () => api.transactions.trendByCategory(start, end),
    placeholderData: keepPreviousData,
  })

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.list,
  })

  const categoryIds = useMemo(
    () =>
      new Set(
        (categories ?? [])
          .filter((category) => category.transaction_type === type)
          .map((category) => category.id),
      ),
    [categories, type],
  )

  const rows = useMemo(() => {
    const ranked = (byCategory ?? [])
      .filter((category) => categoryIds.has(category.category_id))
      .map((category) => ({
        id: category.category_id,
        name: category.category_name,
        amount: category.points.reduce(
          (sum, point) => sum + Number(point.amount),
          0,
        ),
        points: category.points,
        members: undefined as string[] | undefined,
      }))
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount)

    const head = ranked
      .slice(0, CHART_COLORS.length)
      .map((row, index) => ({ ...row, color: CHART_COLORS[index] }))
    const tail = ranked.slice(CHART_COLORS.length)
    if (tail.length === 0) return head

    const tailPoints = new Map<
      string,
      { year: number; month: number; amount: string }
    >()
    for (const entry of tail) {
      for (const point of entry.points) {
        const key = `${point.year}-${String(point.month).padStart(2, "0")}`
        const existing = tailPoints.get(key)
        tailPoints.set(key, {
          year: point.year,
          month: point.month,
          amount: String(Number(existing?.amount ?? 0) + Number(point.amount)),
        })
      }
    }

    return [
      ...head,
      {
        id: -1,
        name: "Other",
        amount: tail.reduce((sum, row) => sum + row.amount, 0),
        points: [...tailPoints.values()],
        members: tail.map((row) => row.name),
        color: OTHER_COLOR,
      },
    ]
  }, [byCategory, categoryIds])

  const chartData = useMemo(() => {
    const months = (trend ?? []).map(
      (point) => `${point.year}-${String(point.month).padStart(2, "0")}`,
    )
    return months.map((month) => {
      const data: Record<string, string | number> = { month }
      for (const row of rows) {
        const point = row.points.find(
          (candidate) =>
            `${candidate.year}-${String(candidate.month).padStart(2, "0")}` ===
            month,
        )
        data[String(row.id)] = point ? Number(point.amount) : 0
      }
      return data
    })
  }, [trend, rows])

  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  const max = rows[0]?.amount ?? 0
  const average = months > 0 ? total / months : 0
  const count = (trend ?? []).reduce((sum, point) => sum + point.count, 0)

  const isIncome = type === "income"
  const title = isIncome ? "Income breakdown" : "Spending breakdown"

  return (
    <div className="space-y-5">
      <Card>
        <CardContent
          className={cn(
            "grid grid-cols-1 gap-4",
            isIncome ? "sm:grid-cols-2" : "sm:grid-cols-3",
          )}
        >
          <Stat
            label={isIncome ? "Total income" : "Total spending"}
            value={
              isLoading ? (
                <span className="text-muted-foreground/40">—</span>
              ) : (
                <Money value={total.toFixed(2)} />
              )
            }
            size="md"
          />
          <Stat
            label="Average per month"
            value={
              isLoading ? (
                <span className="text-muted-foreground/40">—</span>
              ) : (
                <Money value={average.toFixed(2)} />
              )
            }
            size="md"
            className="sm:border-l sm:border-border sm:pl-4"
          />
          {!isIncome && (
            <Stat
              label="Transactions"
              value={
                isLoading ? (
                  <span className="text-muted-foreground/40">—</span>
                ) : (
                  count
                )
              }
              size="md"
              className="sm:border-l sm:border-border sm:pl-4"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              Failed to load the breakdown.
            </p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No {isIncome ? "income" : "spending"} in this period.
            </p>
          ) : (
            <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
              <DonutChart
                data={rows.map((row) => ({
                  label: row.name,
                  value: row.amount,
                  color: row.color,
                }))}
                className="size-112 shrink-0 self-center lg:self-start"
                innerRadius={134}
                outerRadius={208}
              />

              <div className="flex-1 space-y-3">
                {rows.map((row) => (
                  <div key={row.id} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="flex min-w-0 items-baseline gap-2 text-sm">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: row.color }}
                        />
                        <span className="truncate font-medium">{row.name}</span>
                      </span>
                      <span className="flex shrink-0 items-baseline gap-2">
                        <Money value={row.amount.toFixed(2)} className="text-sm" />
                        <span className="w-8 text-right font-numeric text-xs text-muted-foreground">
                          {total > 0 ? Math.round((row.amount / total) * 100) : 0}%
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${max > 0 ? (row.amount / max) * 100 : 0}%`,
                          backgroundColor: row.color,
                        }}
                      />
                    </div>
                    {row.members && (
                      <p className="text-xs text-muted-foreground">
                        {row.members.join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isIncome ? "Income trend" : "Spending trend"}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              Failed to load the trend.
            </p>
          ) : chartData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No {isIncome ? "income" : "spending"} in this period.
            </p>
          ) : (
            <ChartContainer config={{}} className="h-[320px] w-full">
              <BarChart
                accessibilityLayer
                data={chartData}
                margin={{ left: 12, right: 12 }}
              >
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
                <ReferenceLine
                  y={average}
                  stroke="var(--color-faint-foreground)"
                  strokeDasharray="4 4"
                />
                {rows.map((row) => (
                  <Bar
                    key={row.id}
                    dataKey={String(row.id)}
                    name={row.name}
                    stackId="total"
                    fill={row.color}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
