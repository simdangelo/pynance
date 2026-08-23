import { useMemo, useState } from "react"
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
import { TrendRangeSelector, rangeToDates, type TrendRange } from "@/components/trend-range-selector"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const RANGE_LABEL: Record<TrendRange, string> = {
  ALL: "All time",
  "5Y": "Past 5 years",
  "1Y": "Past year",
  YTD: "Year to date",
}

function monthLabel(month: string): string {
  const [year, mo] = month.split("-")
  return `${MONTHS[Number(mo) - 1]} ${year}`
}

function CategoryTick({
  x,
  y,
  payload,
}: {
  x?: string | number
  y?: string | number
  payload?: { value?: string | number }
}) {
  const name = payload?.value !== undefined ? String(payload.value) : ""
  const display = name.length > 18 ? `${name.slice(0, 17)}…` : name
  return (
    <text
      x={x}
      y={y}
      dy={4}
      textAnchor="end"
      className="fill-muted-foreground text-xs"
    >
      <title>{name}</title>
      {display}
    </text>
  )
}

export default function OverviewCashFlow() {
  const [range, setRange] = useState<TrendRange>("ALL")
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)

  const { start, end } = useMemo(() => rangeToDates(range), [range])

  const { data: trend, isLoading: trendLoading, isError: trendError } = useQuery({
    queryKey: ["trend", start, end],
    queryFn: () => api.transactions.trend(start, end),
    placeholderData: keepPreviousData,
  })

  const { data: trendByCategory, isLoading: catLoading, isError: catError } = useQuery({
    queryKey: ["trend-by-category", start, end],
    queryFn: () => api.transactions.trendByCategory(start, end),
    placeholderData: keepPreviousData,
  })

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.list,
  })

  const trendData = useMemo(
    () =>
      (trend ?? []).map((point) => ({
        month: `${point.year}-${String(point.month).padStart(2, "0")}`,
        income: Number(point.income),
        expense: -Number(point.expense),
        net: Number(point.income) - Number(point.expense),
      })),
    [trend],
  )

  const months = useMemo(() => trendData.map((row) => row.month), [trendData])

  // A clicked month only applies while it's within the current range.
  const activeMonth =
    selectedMonth && months.includes(selectedMonth) ? selectedMonth : null

  const expenseCategoryIds = useMemo(
    () =>
      new Set(
        (categories ?? [])
          .filter((c) => c.transaction_type === "expense")
          .map((c) => c.id),
      ),
    [categories],
  )

  const rangeSpendingData = useMemo(() => {
    const rows = (trendByCategory ?? [])
      .filter((cat) => expenseCategoryIds.has(cat.category_id))
      .map((cat) => ({
        category: cat.category_name,
        amount: cat.points.reduce((sum, p) => sum + Number(p.amount), 0),
      }))
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount)
    return rows
  }, [trendByCategory, expenseCategoryIds])

  const { data: monthSpending, isLoading: monthLoading, isError: monthError } = useQuery({
    queryKey: ["spending-by-category", activeMonth],
    queryFn: () => {
      const [y, m] = activeMonth!.split("-").map(Number)
      return api.transactions.summaryByCategory("expense", y, m)
    },
    enabled: activeMonth !== null,
    placeholderData: keepPreviousData,
  })

  const monthSpendingData = useMemo(
    () =>
      (monthSpending ?? [])
        .map((row) => ({ category: row.category_name, amount: Number(row.amount) }))
        .filter((row) => row.amount > 0)
        .sort((a, b) => b.amount - a.amount),
    [monthSpending],
  )

  const spendingData = activeMonth === null ? rangeSpendingData : monthSpendingData
  const spendingLoading = activeMonth === null ? catLoading : monthLoading
  const spendingError = activeMonth === null ? catError : monthError

  const spendingLabel =
    activeMonth === null ? RANGE_LABEL[range] : monthLabel(activeMonth)

  return (
    <div className="space-y-6">
      {/* Cash flow chart — income / expense / net over the range */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Cash flow</CardTitle>
            <TrendRangeSelector value={range} onChange={setRange} />
          </div>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : trendError ? (
            <p className="text-sm text-destructive">Failed to load cash flow.</p>
          ) : trendData.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No activity in this range.
            </p>
          ) : (
            <>
              <ChartContainer
                config={{
                  income: { label: "Income", color: "#059669" },
                  expense: { label: "Expense", color: "#e11d48" },
                  net: { label: "Net", color: "#0284c7" },
                }}
                className="h-[320px] w-full"
              >
                <LineChart
                  data={trendData}
                  margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
                  onClick={(nextState) => {
                    const label = nextState?.activeLabel
                    if (typeof label === "string" && label) {
                      setSelectedMonth(label)
                    }
                  }}
                >
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
                  {activeMonth && (
                    <ReferenceLine
                      x={activeMonth}
                      stroke="#0284c7"
                      strokeDasharray="3 3"
                    />
                  )}
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
                  <Line
                    type="monotone"
                    dataKey="net"
                    stroke="var(--color-net, #0284c7)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ChartContainer>
            </>
          )}
        </CardContent>
      </Card>

      {/* Spending by category — range total or a drilled-down month */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Spending by category · {spendingLabel}
            </CardTitle>
            {activeMonth !== null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedMonth(null)}
              >
                All months
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {spendingLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : spendingError ? (
            <p className="text-sm text-destructive">Failed to load spending.</p>
          ) : spendingData.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {activeMonth === null
                ? "No spending in this range."
                : "No spending this month."}
            </p>
          ) : (
            <ChartContainer
              config={{}}
              className="w-full"
              style={{ height: Math.max(280, spendingData.length * 32) }}
            >
              <BarChart
                data={spendingData}
                layout="vertical"
                margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{ className: "font-numeric text-xs" }}
                />
                <YAxis
                  type="category"
                  dataKey="category"
                  tickLine={false}
                  axisLine={false}
                  width={120}
                  interval={0}
                  tick={(props) => (
                    <CategoryTick
                      x={props.x}
                      y={props.y}
                      payload={{ value: props.payload?.value }}
                    />
                  )}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="amount"
                  fill="var(--color-rose-600, #e11d48)"
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}