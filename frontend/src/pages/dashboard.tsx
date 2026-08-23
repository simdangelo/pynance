import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { api } from "@/lib/api"
import { Money } from "@/components/money"
import { MonthPicker } from "@/components/month-picker"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

export default function Dashboard() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["summary", year, month],
    queryFn: () => api.transactions.summary(year, month),
  })

  const { data: comparison } = useQuery({
    queryKey: ["comparison", year, month],
    queryFn: () => api.transactions.comparison(year, month),
  })

  const { data: spending, isError: spendingError } = useQuery({
    queryKey: ["spending", year, month],
    queryFn: () => api.transactions.summaryByCategory("expense", year, month),
  })

  const { data: assets, isLoading: assetsLoading } = useQuery({
    queryKey: ["assets"],
    queryFn: api.assets.list,
  })

  const totalBalance = useMemo(
    () =>
      (assets ?? [])
        .reduce((sum, asset) => sum + Number(asset.balance), 0)
        .toFixed(2),
    [assets],
  )

  const chartData = useMemo(
    () =>
      (spending ?? []).map((row) => ({
        category: row.category_name,
        amount: Number(row.amount),
      })),
    [spending],
  )

  const comparisonText = useMemo(() => {
    if (!comparison) return null
    const prevExpense = Number(comparison.previous.expense)
    const curExpense = Number(comparison.current.expense)
    if (prevExpense === 0) return null
    const delta = curExpense - prevExpense
    const sign = delta > 0 ? "+" : ""
    return `${sign}${delta.toFixed(2)} vs last month`
  }, [comparison])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Your financial overview."
        action={
          <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m) }} />
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Total balance</CardTitle>
          </CardHeader>
          <CardContent>
            {assetsLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <Money value={totalBalance} className="text-3xl font-semibold text-sky-600" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Income</CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <Money
                value={summary?.income ?? "0"}
                className="text-2xl font-semibold text-emerald-600"
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Expense</CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <Money
                value={summary?.expense ?? "0"}
                className="text-2xl font-semibold text-rose-600"
              />
            )}
            {comparisonText && (
              <p className="mt-1 text-xs text-muted-foreground">{comparisonText}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <NetWorthChart year={year} />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spending by category</CardTitle>
          </CardHeader>
          <CardContent>
            {spendingError ? (
              <p className="text-sm text-destructive">Failed to load spending.</p>
            ) : chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No spending this month.</p>
            ) : (
              <ChartContainer config={{}} className="h-[280px] w-full">
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="category"
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
                  <Bar
                    dataKey="amount"
                    fill="var(--color-rose-600, #e11d48)"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <CashFlowChart year={year} />
    </div>
  )
}

function CashFlowChart({ year }: { year: number }) {
  const { data: trend, isLoading, isError } = useQuery({
    queryKey: ["trend", year],
    queryFn: () => api.transactions.trend(`${year}-01-01`, `${year}-12-31`),
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

function NetWorthChart({ year }: { year: number }) {
  const { data: trend, isLoading, isError } = useQuery({
    queryKey: ["net-worth-trend", year],
    queryFn: () =>
      api.assets.netWorthTrend(
        `${year}-01-01`,
        `${year}-12-31`,
      ),
  })

  const data = useMemo(
    () =>
      (trend ?? []).map((point) => ({
        month: `${point.year}-${String(point.month).padStart(2, "0")}`,
        amount: Number(point.amount),
      })),
    [trend],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Net worth · {year}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : isError ? (
          <p className="text-sm text-destructive">Failed to load net worth.</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No net worth history yet.</p>
        ) : (
          <ChartContainer
            config={{ amount: { label: "Net worth", color: "#0284c7" } }}
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
  )
}