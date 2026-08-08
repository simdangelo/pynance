import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Pencil, Plus, Trash2 } from "lucide-react"

import { api } from "@/lib/api"
import type { Transaction, TransactionType } from "@/types/api"
import { Money } from "@/components/money"
import { MonthPicker } from "@/components/month-picker"
import { TransactionDialog } from "@/components/transaction-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function TypeBadge({ type }: { type: TransactionType }) {
  return type === "income" ? (
    <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
      income
    </Badge>
  ) : (
    <Badge variant="secondary" className="bg-rose-50 text-rose-700">
      expense
    </Badge>
  )
}

export default function Transactions() {
  const queryClient = useQueryClient()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: api.transactions.list,
  })

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.list,
  })

  const monthTransactions = useMemo(() => {
    const prefix = `${year}-${String(month).padStart(2, "0")}`
    return (transactions ?? [])
      .filter((t) => t.occurred_on.startsWith(prefix))
      .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
  }, [transactions, year, month])

  const categoryName = (id: number) =>
    categories?.find((c) => c.id === id)?.name ?? "Unknown"

  const deleteMutation = useMutation({
    mutationFn: api.transactions.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] })
    },
    onError: () => toast.error("Failed to delete transaction"),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="mt-1 text-muted-foreground">
            Record and manage your income and expenses.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m) }} />
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transactions · {year}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : monthTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions this month.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthTransactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-numeric text-sm">{t.occurred_on}</TableCell>
                    <TableCell>{t.description}</TableCell>
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
                          onClick={() => deleteMutation.mutate(t.id)}
                          disabled={deleteMutation.isPending}
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
    </div>
  )
}
