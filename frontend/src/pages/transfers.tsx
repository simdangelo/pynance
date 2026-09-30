import { Fragment, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeftRight, ArrowRight, Pencil, Plus, Trash2 } from "lucide-react"

import { api } from "@/lib/api"
import type { Asset, Transfer } from "@/types/api"
import { Money } from "@/components/money"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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

interface TransfersProps {
  onAddTransfer: () => void
  onEditTransfer: (transfer: Transfer) => void
}

export default function Transfers({
  onAddTransfer,
  onEditTransfer,
}: TransfersProps) {
  const queryClient = useQueryClient()
  const [deleteTarget, setDeleteTarget] = useState<Transfer | null>(null)

  const { data: transfers, isLoading, isError } = useQuery({
    queryKey: ["transfers"],
    queryFn: () => api.transfers.list(),
  })

  const { data: assets } = useQuery({
    queryKey: ["assets"],
    queryFn: api.assets.list,
  })

  const assetName = (id: number) =>
    assets?.find((a: Asset) => a.id === id)?.name ?? "Unknown"

  const deleteMutation = useMutation({
    mutationFn: api.transfers.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfers"] })
      queryClient.invalidateQueries({ queryKey: ["assets"] })
    },
    onError: () => toast.error("Failed to delete transfer"),
  })

  const grouped = useMemo(() => {
    const groups: { date: string; label: string; items: Transfer[] }[] = []
    for (const transfer of transfers ?? []) {
      const last = groups[groups.length - 1]
      if (last && last.date === transfer.occurred_on) {
        last.items.push(transfer)
      } else {
        groups.push({
          date: transfer.occurred_on,
          label: dayLabel(transfer.occurred_on),
          items: [transfer],
        })
      }
    }
    return groups
  }, [transfers])

  return (
    <>
      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : isError ? (
            <p className="p-6 text-sm text-destructive">Failed to load transfers.</p>
          ) : grouped.length === 0 ? (
            <EmptyState
              icon={ArrowLeftRight}
              title="No transfers yet"
              subtitle="Move money from one asset to another."
              action={
                <Button size="sm" onClick={onAddTransfer}>
                  <Plus className="mr-1 h-4 w-4" /> Add transfer
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader className="sr-only">
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>From → To</TableHead>
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
                    {group.items.map((transfer, itemIndex) => (
                      <TableRow
                        key={transfer.id}
                        className={
                          itemIndex === group.items.length - 1
                            ? "border-b-0"
                            : undefined
                        }
                      >
                        <TableCell>
                          <span className="block max-w-[280px] truncate">
                            {transfer.description}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            {assetName(transfer.source_asset_id)}
                            <ArrowRight className="size-3.5" />
                            <span className="text-foreground">
                              {assetName(transfer.destination_asset_id)}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="w-[1%] text-right">
                          <Money value={transfer.amount} className="font-medium" />
                        </TableCell>
                        <TableCell className="w-[1%] text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground"
                              aria-label="Edit transfer"
                              onClick={() => onEditTransfer(transfer)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground"
                              aria-label="Delete transfer"
                              onClick={() => setDeleteTarget(transfer)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
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

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete transfer?"
        description={
          deleteTarget ? (
            <>
              Transfer of <Money value={deleteTarget.amount} /> on{" "}
              {deleteTarget.occurred_on} will be permanently removed.
            </>
          ) : undefined
        }
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </>
  )
}
