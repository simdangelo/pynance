import { useMemo } from "react"
import { Navigate, Route, Routes, useSearchParams } from "react-router-dom"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Filter } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { TransactionType } from "@/types/api"
import { useDonutHover } from "@/components/donut-hover"
import { Money } from "@/components/money"
import { PageHeader } from "@/components/page-header"
import { PageTabs } from "@/components/page-tabs"
import { Stat } from "@/components/stat"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

type Period = "ytd" | "all" | number

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

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

function monthLabel(month: string): string {
  const [year, m] = month.split("-")
  return `${MONTHS_SHORT[Number(m) - 1]} ${year}`
}

function formatCompact(value: number): string {
  return Math.abs(value) >= 1000
    ? `${Math.round(value / 1000)}k`
    : String(value)
}

function todayISO(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}

function periodRange(period: Period): { start: string; end: string } {
  const now = new Date()
  if (period === "all") return { start: "2000-01-01", end: todayISO() }
  if (period === "ytd") return { start: `${now.getFullYear()}-01-01`, end: todayISO() }
  return { start: `${period}-01-01`, end: `${period}-12-31` }
}

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
    : periodParam === "all"
      ? "all"
      : "ytd"

  const setPeriod = (next: Period) => {
    const params = new URLSearchParams(searchParams)
    if (next === "ytd") {
      params.delete("period")
    } else {
      params.set("period", String(next))
    }
    setSearchParams(params, { replace: true })
  }

  const { data: allTimeTrend } = useQuery({
    queryKey: ["trend", "all"],
    queryFn: () => api.transactions.trend("2000-01-01", todayISO()),
  })

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const present = new Set((allTimeTrend ?? []).map((point) => point.year))
    return [...present].filter((year) => year < currentYear).sort((a, b) => b - a)
  }, [allTimeTrend])

  const firstMonth = allTimeTrend?.length
    ? `${allTimeTrend[0].year}-${String(allTimeTrend[0].month).padStart(2, "0")}`
    : null
  const months = periodMonths(period, firstMonth)

  const periodLabel =
    period === "ytd" ? "Year to date" : period === "all" ? "All time" : String(period)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        tabs={<PageTabs tabs={TABS} />}
        action={
          <Select
            value={String(period)}
            onValueChange={(value) =>
              setPeriod(value === "ytd" || value === "all" ? value : Number(value))
            }
          >
            <SelectTrigger className="w-[170px]">
              <Filter
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <SelectValue>{periodLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ytd">Year to date</SelectItem>
              {years.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
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
  const showDots = chartData.length <= 24

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
            size="lg"
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
            size="lg"
            className="sm:border-l sm:border-border sm:pl-4"
            valueClassName="text-2xl xl:text-3xl"
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
            size="lg"
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
            <ChartContainer
              config={{
                income: { label: "Income", color: "var(--color-positive)" },
                expense: { label: "Expense", color: "var(--color-destructive)" },
                net: { label: "Net", color: "var(--color-chart-1)" },
              }}
              className="h-[320px] w-full"
            >
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ className: "font-numeric text-xs" }}
                  tickFormatter={monthLabel}
                  minTickGap={32}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tick={{ className: "font-numeric text-xs" }}
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
                  type="linear"
                  dataKey="income"
                  stroke="var(--color-positive)"
                  strokeWidth={2}
                  dot={showDots ? { r: 2.5 } : false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="expense"
                  stroke="var(--color-destructive)"
                  strokeWidth={2}
                  dot={showDots ? { r: 2.5 } : false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="net"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2.5}
                  dot={showDots ? { r: 2.5 } : false}
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
}) {  const { start, end } = useMemo(() => periodRange(period), [period])

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

  const { containerProps, enterSlice, popup } = useDonutHover(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      value: row.amount.toFixed(2),
    })),
  )

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
            size="lg"
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
            size="lg"
            className="sm:border-l sm:border-border sm:pl-4"
            valueClassName="text-2xl xl:text-3xl"
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
              size="lg"
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
              <div className="flex w-112 shrink-0 flex-col items-center gap-4">
                <div className="relative size-112" {...containerProps}>
                  <ChartContainer config={{}} className="size-112">
                    <PieChart>
                      <Pie
                        data={rows}
                        dataKey="amount"
                        nameKey="name"
                        innerRadius={134}
                        outerRadius={208}
                        paddingAngle={2}
                        strokeWidth={0}
                        isAnimationActive={false}
                        onMouseEnter={(_, index) => enterSlice(index)}
                      >
                        {rows.map((row) => (
                          <Cell key={row.id} fill={row.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                    <span className="text-[13px] text-muted-foreground">Total</span>
                    <Money value={total.toFixed(2)} className="text-xl font-semibold" />
                  </div>
                  {popup}
                </div>
                <div className="flex min-h-14 w-full flex-wrap content-start justify-center gap-x-4 gap-y-1.5">
                  {rows.map((row) => (
                    <span
                      key={row.id}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: row.color }}
                      />
                      {row.name}
                    </span>
                  ))}
                </div>
              </div>

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
                data={chartData}
                margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ className: "font-numeric text-xs" }}
                  tickFormatter={monthLabel}
                  minTickGap={32}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tick={{ className: "font-numeric text-xs" }}
                  tickFormatter={formatCompact}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => monthLabel(String(value))}
                      formatter={(value, name, item) => (
                        <span className="flex w-full items-center gap-2">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: item?.color }}
                          />
                          <span className="text-muted-foreground">{name}</span>
                          <span className="ml-auto font-numeric font-medium text-foreground">
                            <Money value={String(value)} />
                          </span>
                        </span>
                      )}
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
