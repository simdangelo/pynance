import { Fragment, useMemo, useState } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Filter, Pencil, Plus, Search, Trash2 } from "lucide-react"

import { api } from "@/lib/api"
import type { Transaction } from "@/types/api"
import { Money } from "@/components/money"
import { MonthPicker } from "@/components/month-picker"
import { PageHeader } from "@/components/page-header"
import { TransactionDialog } from "@/components/transaction-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { RowActions } from "@/components/row-actions"
import { Stat } from "@/components/stat"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
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

function dayLabel(date: string): string {
  const [year, month, day] = date.split("-")
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`
}

export default function Transactions() {
  const queryClient = useQueryClient()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [q, setQ] = useState("")
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
    queryKey: ["transactions", { year, month, q, categoryId }],
    queryFn: () =>
      api.transactions.list({
        year,
        month,
        q: q || undefined,
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

  const grouped = useMemo(() => {
    const groups: { date: string; label: string; items: Transaction[] }[] = []
    for (const transaction of transactions ?? []) {
      const last = groups[groups.length - 1]
      if (last && last.date === transaction.occurred_on) {
        last.items.push(transaction)
      } else {
        groups.push({
          date: transaction.occurred_on,
          label: dayLabel(transaction.occurred_on),
          items: [transaction],
        })
      }
    }
    return groups
  }, [transactions])

  const expenseCategories = useMemo(
    () => (categories ?? []).filter((category) => category.transaction_type === "expense"),
    [categories],
  )
  const incomeCategories = useMemo(
    () => (categories ?? []).filter((category) => category.transaction_type === "income"),
    [categories],
  )

  const hasActiveFilters = q !== "" || categoryId !== "all"

  const clearFilters = () => {
    setQ("")
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
      <PageHeader
        title="Transactions"
        action={
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add transaction
          </Button>
        }
      />

      {/* Month KPIs */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          <Stat
            label="In"
            value={
              summaryLoading ? (
                <span className="text-muted-foreground/40">—</span>
              ) : (
                <Money value={income} signed />
              )
            }
            tone="positive"
            size="lg"
            valueClassName="text-2xl xl:text-3xl"
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
            valueClassName="text-2xl xl:text-3xl"
            className="sm:border-l sm:border-border sm:pl-4"
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
            valueClassName="text-2xl xl:text-3xl"
            className="sm:border-l sm:border-border sm:pl-4 xl:col-span-2"
          />
        </CardContent>
      </Card>

      {/* Transactions, grouped by day */}
      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center gap-3 p-3">
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
            value={String(categoryId)}
            onValueChange={(v) => setCategoryId(v === "all" ? "all" : Number(v))}
          >
            <SelectTrigger className="w-[180px]">
              <Filter className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <SelectValue>
                {categoryId === "all" ? "All categories" : categoryName(categoryId)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {expenseCategories.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel className="font-semibold">Expense</SelectLabel>
                    {expenseCategories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}
              {incomeCategories.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel className="font-semibold">Income</SelectLabel>
                    {incomeCategories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}
            </SelectContent>
          </Select>
        </div>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : isError ? (
            <p className="p-6 text-sm text-destructive">
              Failed to load transactions.
            </p>
          ) : grouped.length === 0 ? (
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
              <TableHeader className="sr-only">
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map((group) => (
                  <Fragment key={group.date}>
                    <TableRow className="border-b-0 bg-row-group hover:bg-row-group">
                      <TableCell
                        colSpan={4}
                        className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground"
                      >
                        {group.label}
                      </TableCell>
                    </TableRow>
                    {group.items.map((t, itemIndex) => (
                      <TableRow
                        key={t.id}
                        className={itemIndex === group.items.length - 1 ? "border-b-0" : undefined}
                      >
                        <TableCell>
                          <span className="block max-w-[320px] truncate">
                            {t.description}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {categoryName(t.category_id)}
                        </TableCell>
                        <TableCell className="w-[1%] text-right">
                          <Money
                            value={
                              t.transaction_type === "income"
                                ? t.amount
                                : (-Number(t.amount)).toFixed(2)
                            }
                            signed
                            className={
                              t.transaction_type === "income"
                                ? "font-medium text-positive"
                                : "font-medium text-destructive"
                            }
                          />
                        </TableCell>
                        <TableCell className="w-[1%] text-right">
                          <div className="flex justify-end">
                            <RowActions label={`Actions for ${t.description}`}>
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditing(t)
                                  setDialogOpen(true)
                                }}
                              >
                                <Pencil /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setDeleteTarget(t)}
                              >
                                <Trash2 /> Delete
                              </DropdownMenuItem>
                            </RowActions>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
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
