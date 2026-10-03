import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeftRight, ArrowRight, Pencil, Trash2 } from "lucide-react"

import { api } from "@/lib/api"
import { dateLabel } from "@/lib/period"
import type { Asset, Transfer } from "@/types/api"
import { Money } from "@/components/money"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { RowActions } from "@/components/row-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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

  return (
    <>
      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : isError ? (
            <p className="p-6 text-sm text-destructive">Failed to load transfers.</p>
          ) : (transfers ?? []).length === 0 ? (
            <EmptyState
              className="m-4"
              icon={ArrowLeftRight}
              title="No transfers yet"
              subtitle="Move money from one asset to another."
              action={
                <Button
                  variant="link"
                  onClick={onAddTransfer}
                  className="underline underline-offset-4"
                >
                  Add transfer
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[240px]">From → To</TableHead>
                    <TableHead className="w-[1%] text-right">Amount</TableHead>
                    <TableHead className="w-[1%] text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(transfers ?? []).map((transfer) => (
                    <TableRow key={transfer.id}>
                      <TableCell className="font-numeric text-[13px] text-muted-foreground">
                        {dateLabel(transfer.occurred_on)}
                      </TableCell>
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
                        <div className="flex justify-end">
                          <RowActions
                            label={`Actions for ${transfer.description}`}
                          >
                            <DropdownMenuItem
                              onClick={() => onEditTransfer(transfer)}
                            >
                              <Pencil /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeleteTarget(transfer)}
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
                  {(transfers ?? []).length} transfer
                  {(transfers ?? []).length === 1 ? "" : "s"}
                </span>
              </div>
            </>
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
