import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowRight, Pencil, Plus, Search, Trash2 } from "lucide-react"

import { api } from "@/lib/api"
import type { Asset, Transfer } from "@/types/api"
import { Money } from "@/components/money"
import { MonthPicker } from "@/components/month-picker"
import { PageHeader } from "@/components/page-header"
import { TransferDialog } from "@/components/transfer-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const MONTH_ABBREV = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

export default function Transfers() {
  const queryClient = useQueryClient()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [q, setQ] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Transfer | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Transfer | null>(null)

  const { data: transfers, isLoading, isError } = useQuery({
    queryKey: ["transfers", { year, month, q }],
    queryFn: () => api.transfers.list({ year, month, q: q || undefined }),
  })

  const { data: yearTransfers } = useQuery({
    queryKey: ["transfers", { year }],
    queryFn: () => api.transfers.list({ year }),
  })

  const { data: assets } = useQuery({
    queryKey: ["assets"],
    queryFn: api.assets.list,
  })

  const assetName = (id: number) => assets?.find((a: Asset) => a.id === id)?.name ?? "Unknown"

  const monthTotal = useMemo(
    () =>
      (transfers ?? [])
        .reduce((sum, t) => sum + Number(t.amount), 0)
        .toFixed(2),
    [transfers],
  )

  const monthCount = transfers?.length ?? 0

  const yearTotal = useMemo(
    () =>
      (yearTransfers ?? [])
        .reduce((sum, t) => sum + Number(t.amount), 0)
        .toFixed(2),
    [yearTransfers],
  )

  const deleteMutation = useMutation({
    mutationFn: api.transfers.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfers"] })
      queryClient.invalidateQueries({ queryKey: ["assets"] })
    },
    onError: () => toast.error("Failed to delete transfer"),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transfers"
        subtitle="Move money between assets."
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

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">This month</p>
            <Money value={monthTotal} className="text-2xl font-semibold" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">
              Count · {MONTH_ABBREV[month - 1]}
            </p>
            <p className="text-2xl font-semibold">{monthCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">This year</p>
            <Money value={yearTotal} className="text-2xl font-semibold" />
          </CardContent>
        </Card>
      </div>

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
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transfers · {year}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : isError ? (
            <p className="text-sm text-destructive">Failed to load transfers.</p>
          ) : !transfers || transfers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transfers this month.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Date</TableHead>
                  <TableHead>From → To</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[120px] text-right">Amount</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((transfer) => (
                  <TableRow key={transfer.id}>
                    <TableCell className="font-numeric text-sm">{transfer.occurred_on}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        {assetName(transfer.source_asset_id)}
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        {assetName(transfer.destination_asset_id)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="block max-w-[280px] truncate">{transfer.description}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={transfer.amount} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit transfer"
                          onClick={() => {
                            setEditing(transfer)
                            setDialogOpen(true)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete transfer"
                          onClick={() => setDeleteTarget(transfer)}
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

      <TransferDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        transfer={editing}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete transfer?"
        description={
          deleteTarget
            ? `Transfer of ${deleteTarget.amount} on ${deleteTarget.occurred_on} will be permanently removed.`
            : undefined
        }
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  )
}