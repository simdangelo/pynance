import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { api } from "@/lib/api"
import { Money } from "@/components/money"
import { MonthPicker } from "@/components/month-picker"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function Dashboard() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["summary", year, month],
    queryFn: () => api.transactions.summary(year, month),
  })

  const { data: spending, isError: spendingError } = useQuery({
    queryKey: ["spending", year, month],
    queryFn: () => api.transactions.spendingByCategory("expense", year, month),
  })

  const { data: transactions, isLoading, isError } = useQuery({
    queryKey: ["transactions"],
    queryFn: api.transactions.list,
  })

  const recent = useMemo(() => {
    const prefix = `${year}-${String(month).padStart(2, "0")}`
    return (transactions ?? [])
      .filter((t) => t.occurred_on.startsWith(prefix))
      .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
      .slice(0, 10)
  }, [transactions, year, month])

  const chartData = useMemo(
    () =>
      (spending ?? []).map((row) => ({
        category: row.category_name,
        amount: Number(row.amount),
      })),
    [spending],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">Your monthly overview.</p>
        </div>
        <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m) }} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
          </CardContent>
        </Card>
      </div>

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
            <ChartContainer
              config={{}}
              className="h-[280px] w-full"
            >
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : isError ? (
            <p className="text-sm text-destructive">Failed to load transactions.</p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions this month.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-numeric text-sm">{t.occurred_on}</TableCell>
                    <TableCell>{t.description}</TableCell>
                    <TableCell className="text-right">
                      <Money
                        value={t.amount}
                        className={
                          t.transaction_type === "income" ? "text-emerald-600" : "text-rose-600"
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
