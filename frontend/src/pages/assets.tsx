import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowRight, Pencil, Plus, Trash2 } from "lucide-react"

import { api } from "@/lib/api"
import type { Asset, AssetType, Transfer } from "@/types/api"
import { Money } from "@/components/money"
import { AssetDialog } from "@/components/asset-dialog"
import { TransferDialog } from "@/components/transfer-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  liquid: "Liquid",
  savings: "Savings",
  etf: "ETF",
}

const ASSET_TYPE_COLOR: Record<AssetType, string> = {
  liquid: "text-sky-600",
  savings: "text-emerald-600",
  etf: "text-amber-600",
}

function AssetTypeBadge({ type }: { type: AssetType }) {
  return (
    <Badge variant="secondary" className="bg-sky-50 text-sky-700">
      {ASSET_TYPE_LABEL[type]}
    </Badge>
  )
}

function TransfersSection({ assets }: { assets?: Asset[] }) {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Transfer | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Transfer | null>(null)

  const { data: transfers, isLoading, isError } = useQuery({
    queryKey: ["transfers"],
    queryFn: () => api.transfers.list({}),
  })

  const assetName = (id: number) => assets?.find((a) => a.id === id)?.name ?? "Unknown"

  const deleteMutation = useMutation({
    mutationFn: api.transfers.remove,
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
    onError: () => toast.error("Failed to delete transfer"),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Transfers between assets</CardTitle>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add transfer
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : isError ? (
          <p className="text-sm text-destructive">Failed to load transfers.</p>
        ) : !transfers || transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transfers yet.</p>
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
    </Card>
  )
}

export default function Assets() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Asset | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null)

  const { data: assets, isLoading, isError } = useQuery({
    queryKey: ["assets"],
    queryFn: api.assets.list,
  })

  const deleteMutation = useMutation({
    mutationFn: api.assets.remove,
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
    onError: (error: Error) => {
      const message =
        error.message.includes("associated") || error.message.includes("transactions")
          ? "Cannot delete: this asset has transactions or transfers"
          : "Failed to delete asset"
      toast.error(message)
    },
  })

  const totalsByType = useMemo(() => {
    const totals: Record<AssetType, number> = { liquid: 0, savings: 0, etf: 0 }
    for (const asset of assets ?? []) {
      totals[asset.asset_type] += Number(asset.balance)
    }
    return totals
  }, [assets])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assets"
        subtitle="The money pools where your funds live."
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
        {(Object.keys(ASSET_TYPE_LABEL) as AssetType[]).map((type) => (
          <Card key={type}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {ASSET_TYPE_LABEL[type]}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Money
                value={totalsByType[type].toFixed(2)}
                className={`text-2xl font-semibold ${ASSET_TYPE_COLOR[type]}`}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All assets</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : isError ? (
            <p className="text-sm text-destructive">Failed to load assets.</p>
          ) : !assets || assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assets yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-[160px] text-right">Balance</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell className="font-medium">{asset.name}</TableCell>
                    <TableCell>
                      <AssetTypeBadge type={asset.asset_type} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={asset.balance} className="text-base font-semibold" />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit asset"
                          onClick={() => {
                            setEditing(asset)
                            setDialogOpen(true)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete asset"
                          onClick={() => setDeleteTarget(asset)}
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

      <TransfersSection assets={assets} />

      <AssetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        asset={editing}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete asset?"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" will be permanently removed. Assets with transactions or transfers cannot be deleted.`
            : undefined
        }
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  )
}