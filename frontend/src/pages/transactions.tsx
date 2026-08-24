import { useState } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Pencil, Plus, Search, Trash2 } from "lucide-react"

import { api } from "@/lib/api"
import type { Transaction, TransactionType } from "@/types/api"
import { Money } from "@/components/money"
import { MonthPicker } from "@/components/month-picker"
import { TransactionDialog } from "@/components/transaction-dialog"
import { TypeBadge } from "@/components/type-badge"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { Stat } from "@/components/stat"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.list,
  })

  const categoryName = (id: number) =>
    categories?.find((c) => c.id === id)?.name ?? "Unknown"

  const hasActiveFilters = q !== "" || type !== "all" || categoryId !== "all"

  const clearFilters = () => {
    setQ("")
    setType("all")
    setCategoryId("all")
  }

  const deleteMutation = useMutation({
    mutationFn: api.transactions.remove,
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
    onError: () => toast.error("Failed to delete transaction"),
  })

  const income = summary?.income ?? "0"
  const expense = summary?.expense ?? "0"
  const net = (Number(income) - Number(expense)).toFixed(2)

  return (
    <div className="space-y-5">
      {/* Top band: month KPIs + Add */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <section className="flex flex-wrap items-baseline gap-x-10 gap-y-3">
          <Stat
            label="In"
            value={
              summaryLoading ? (
                <span className="text-muted-foreground/40">—</span>
              ) : (
                <Money value={income} />
              )
            }
            tone="positive"
            size="lg"
          />
          <Stat
            label="Out"
            value={
              summaryLoading ? (
                <span className="text-muted-foreground/40">—</span>
              ) : (
                <Money value={(-Number(expense)).toFixed(2)} />
              )
            }
            tone="negative"
            size="lg"
          />
          <Stat
            label="Net"
            value={
              summaryLoading ? (
                <span className="text-muted-foreground/40">—</span>
              ) : (
                <Money value={net} signed />
              )
            }
            size="lg"
          />
        </section>
        <Button
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Add transaction
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        <MonthPicker
          year={year}
          month={month}
          onChange={(y, m) => {
            setYear(y)
            setMonth(m)
          }}
        />
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

      {/* Table */}
      <Card className="p-0">
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : isError ? (
            <p className="p-6 text-sm text-destructive">
              Failed to load transactions.
            </p>
          ) : !transactions || transactions.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No transactions"
              subtitle={
                hasActiveFilters
                  ? "No transactions match these filters."
                  : "No transactions recorded for this month."
              }
              action={
                hasActiveFilters ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
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
                    <TableCell className="font-numeric text-sm">
                      {t.occurred_on}
                    </TableCell>
                    <TableCell>
                      <span className="block max-w-[320px] truncate">
                        {t.description}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {categoryName(t.category_id)}
                        <TypeBadge type={t.transaction_type} />
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Money
                        value={
                          t.transaction_type === "income"
                            ? t.amount
                            : (-Number(t.amount)).toFixed(2)
                        }
                        className={
                          t.transaction_type === "income"
                            ? "font-medium text-moss"
                            : "font-medium text-clay"
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
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
                          size="icon-sm"
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
          deleteTarget ? (
            <>
              "{deleteTarget.description}" (<Money value={deleteTarget.amount} /> on{" "}
              {deleteTarget.occurred_on}) will be permanently removed.
            </>
          ) : undefined
        }
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  )
}