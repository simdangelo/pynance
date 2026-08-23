import { useMemo, useState } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Pencil, Plus, Search, Trash2 } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { api } from "@/lib/api"
import type { Transaction, TransactionType } from "@/types/api"
import { Money } from "@/components/money"
import { MonthPicker } from "@/components/month-picker"
import { PageHeader } from "@/components/page-header"
import { TransactionDialog } from "@/components/transaction-dialog"
import { TypeBadge } from "@/components/type-badge"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

export default function Transactions() {
  const queryClient = useQueryClient()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [q, setQ] = useState("")
  const [type, setType] = useState<TransactionType | "all">("all")
  const [categoryId, setCategoryId] = useState<number | "all">("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null)

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["summary", year, month],
    queryFn: () => api.transactions.summary(year, month),
    placeholderData: keepPreviousData,
  })

  const { data: comparison } = useQuery({
    queryKey: ["comparison", year, month],
    queryFn: () => api.transactions.comparison(year, month),
    placeholderData: keepPreviousData,
  })

  const { data: spending, isError: spendingError } = useQuery({
    queryKey: ["spending", year, month],
    queryFn: () => api.transactions.summaryByCategory("expense", year, month),
    placeholderData: keepPreviousData,
  })

  const { data: transactions, isLoading, isError } = useQuery({
    queryKey: ["transactions", { year, month, q, type, categoryId }],
    queryFn: () =>
      api.transactions.list({
        year,
        month,
        q: q || undefined,
        transaction_type: type === "all" ? undefined : type,
        category_id: categoryId === "all" ? undefined : categoryId,
      }),
    placeholderData: keepPreviousData,
  })

  const { data: categories, isError: categoriesError } = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.list,
  })

  const categoryName = (id: number) =>
    categories?.find((c) => c.id === id)?.name ?? "Unknown"

  const netAmount = useMemo(() => {
    if (!summary) return null
    return (Number(summary.income) - Number(summary.expense)).toFixed(2)
  }, [summary])

  const comparisonText = useMemo(() => {
    if (!comparison) return null
    const prev = Number(comparison.previous.expense)
    const cur = Number(comparison.current.expense)
    if (prev === 0) return null
    const delta = cur - prev
    const sign = delta > 0 ? "+" : ""
    return `${sign}${delta.toFixed(2)} vs last month`
  }, [comparison])

  const chartData = useMemo(
    () =>
      (spending ?? []).map((row) => ({
        category: row.category_name,
        amount: Number(row.amount),
      })),
    [spending],
  )

  const deleteMutation = useMutation({
    mutationFn: api.transactions.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] })
    },
    onError: () => toast.error("Failed to delete transaction"),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        subtitle="Record and manage your income and expenses."
        action={
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m) }} />
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search description..."
            className="pl-9"
          />
        </div>
        <Select
          value={type}
          onValueChange={(v) => setType(v as TransactionType | "all")}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue>
              {type === "all" ? "All" : type === "income" ? "Income" : "Expense"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={String(categoryId)}
          onValueChange={(v) => setCategoryId(v === "all" ? "all" : Number(v))}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue>
              {categoryId === "all"
                ? "All categories"
                : (categoryName(categoryId) ?? "All categories")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="min-w-[240px]">
            <SelectItem value="all">All categories</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
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
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Net</CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : netAmount && Number(netAmount) >= 0 ? (
              <Money value={netAmount} className="text-2xl font-semibold text-sky-600" />
            ) : (
              <Money value={netAmount ?? "0"} className="text-2xl font-semibold text-rose-600" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
          <CardHeader>
            <CardTitle className="text-base">Spending by category · {MONTHS[month - 1]} {year}</CardTitle>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transactions · {year}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : isError || categoriesError ? (
            <p className="text-sm text-destructive">Failed to load transactions.</p>
          ) : !transactions || transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions match the filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="w-[120px] text-right">Amount</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-numeric text-sm">{t.occurred_on}</TableCell>
                    <TableCell>
                      <span className="block max-w-[280px] truncate">{t.description}</span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {categoryName(t.category_id)}
                        <TypeBadge type={t.transaction_type} />
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Money
                        value={t.amount}
                        className={
                          t.transaction_type === "income" ? "text-emerald-600" : "text-rose-600"
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit transaction"
                          onClick={() => {
                            setEditing(t)
                            setDialogOpen(true)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete transaction"
                          onClick={() => setDeleteTarget(t)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <TransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        transaction={editing}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete transaction?"
        description={
          deleteTarget
            ? `"${deleteTarget.description}" (${deleteTarget.amount} on ${deleteTarget.occurred_on}) will be permanently removed.`
            : undefined
        }
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  )
}