import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeftRight, ArrowRight, Pencil, Plus, Trash2 } from "lucide-react"

import { api } from "@/lib/api"
import type { Asset, Transfer } from "@/types/api"
import { Money } from "@/components/money"
import { TransferDialog } from "@/components/transfer-dialog"
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

export default function Transfers() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Transfer | null>(null)
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

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-5">
      {/* Add action */}
      <div className="flex flex-wrap items-center justify-end gap-4">
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> Add transfer
        </Button>
      </div>

      {/* Transfers list */}
      <Card className="p-0">
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : isError ? (
            <p className="p-6 text-sm text-destructive">Failed to load transfers.</p>
          ) : !transfers || transfers.length === 0 ? (
            <EmptyState
              icon={ArrowLeftRight}
              title="No transfers yet"
              subtitle="Move money from one asset to another."
              action={
                <Button size="sm" onClick={openCreate}>
                  <Plus className="mr-1 h-4 w-4" /> Add transfer
                </Button>
              }
            />
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
                    <TableCell className="font-numeric text-sm">
                      {transfer.occurred_on}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        {assetName(transfer.source_asset_id)}
                        <ArrowRight className="size-3.5 text-muted-foreground" />
                        {assetName(transfer.destination_asset_id)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="block max-w-[280px] truncate">
                        {transfer.description}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={transfer.amount} className="font-medium" />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
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
                          size="icon-sm"
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
          deleteTarget ? (
            <>
              Transfer of <Money value={deleteTarget.amount} /> on{" "}
              {deleteTarget.occurred_on} will be permanently removed.
            </>
          ) : undefined
        }
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  )
}