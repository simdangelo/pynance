import { useMemo, useState } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react"

import { api } from "@/lib/api"
import { dateLabel } from "@/lib/period"
import { useAllTimeTrend } from "@/lib/use-all-time-trend"
import { cn } from "@/lib/utils"
import type { Transaction } from "@/types/api"
import { CategoryFilter } from "@/components/category-filter"
import { Money } from "@/components/money"
import { MonthFilter } from "@/components/month-filter"
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
  const [categoryId, setCategoryId] = useState<number | "all">("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null)

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["summary", year, month],
    queryFn: () => api.transactions.summary(year, month),
    placeholderData: keepPreviousData,
  })

  const { data: transactions, isLoading, isError, isFetching } = useQuery({
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

  const { data: allTimeTrend } = useAllTimeTrend()

  const yearOptions = useMemo(() => {
    const present = new Set((allTimeTrend ?? []).map((point) => point.year))
    if (!present.has(year)) present.add(year)
    return [...present].sort((a, b) => b - a)
  }, [allTimeTrend, year])

  const categoryName = (id: number) =>
    categories?.find((c) => c.id === id)?.name ?? "Unknown"

  const hasActiveFilters = q !== "" || categoryId !== "all"

  const clearFilters = () => {
    setQ("")
    setCategoryId("all")
  }

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["transactions"] })
    void queryClient.invalidateQueries({ queryKey: ["summary"] })
    void queryClient.invalidateQueries({ queryKey: ["trend", "all"] })
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
            size="md"
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
            size="md"
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
            size="md"
            className="sm:border-l sm:border-border sm:pl-4 xl:col-span-2"
          />
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search descriptions..."
              className="pl-9"
            />
          </div>
          <MonthFilter
            year={year}
            month={month}
            years={yearOptions}
            onChange={(nextYear, nextMonth) => {
              setYear(nextYear)
              setMonth(nextMonth)
            }}
          />
          <CategoryFilter
            categories={categories ?? []}
            value={categoryId}
            onChange={setCategoryId}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="Refresh"
            onClick={refresh}
            disabled={isFetching}
          >
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
          </Button>
        </div>

        {/* Transactions list */}
        <Card className="gap-0 overflow-hidden py-0">
          <CardContent className="p-0">
            {isLoading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            ) : isError ? (
              <p className="p-6 text-sm text-destructive">
                Failed to load transactions.
              </p>
            ) : (transactions ?? []).length === 0 ? (
              <EmptyState
                icon={Search}
                title="No transactions"
                subtitle={
                  hasActiveFilters
                    ? "No transactions match these filters."
                    : "No transactions recorded for this month."
                }
                className="m-4"
                action={
                  hasActiveFilters ? (
                    <Button
                      variant="link"
                      onClick={clearFilters}
                      className="underline underline-offset-4"
                    >
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-[200px]">Category</TableHead>
                      <TableHead className="w-[1%] text-right">Amount</TableHead>
                      <TableHead className="w-[1%] text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(transactions ?? []).map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-numeric text-[13px] text-muted-foreground">
                          {dateLabel(t.occurred_on)}
                        </TableCell>
                        <TableCell>
                          <span className="block max-w-[320px] truncate">
                            {t.description}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <span className="block max-w-[200px] truncate">{categoryName(t.category_id)}</span>
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
                  </TableBody>
                </Table>
                <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[12.5px] text-faint-foreground">
                  <span>
                    {(transactions ?? []).length} transaction
                    {(transactions ?? []).length === 1 ? "" : "s"}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

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
