import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Landmark, Pencil, Plus, Trash2 } from "lucide-react"

import { api } from "@/lib/api"
import type { Asset, AssetType } from "@/types/api"
import { Money } from "@/components/money"
import { AssetDialog } from "@/components/asset-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"

const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  liquid: "Liquid",
  savings: "Savings",
  etf: "ETF",
}

const ASSET_TYPE_COLOR: Record<AssetType, string> = {
  liquid: "var(--color-petrol)",
  savings: "var(--color-moss)",
  etf: "var(--color-ochre)",
}

const ASSET_TYPES = Object.keys(ASSET_TYPE_LABEL) as AssetType[]

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

  const total = useMemo(
    () =>
      (assets ?? []).reduce((sum, asset) => sum + Number(asset.balance), 0),
    [assets],
  )

  const totalsByType = useMemo(() => {
    const totals: Record<AssetType, number> = { liquid: 0, savings: 0, etf: 0 }
    for (const asset of assets ?? []) {
      totals[asset.asset_type] += Number(asset.balance)
    }
    return totals
  }, [assets])

  const allocation = useMemo(
    () =>
      ASSET_TYPES.map((type) => ({
        type,
        name: ASSET_TYPE_LABEL[type],
        value: totalsByType[type],
        pct: total ? (totalsByType[type] / total) * 100 : 0,
        color: ASSET_TYPE_COLOR[type],
      })).filter((entry) => entry.value > 0),
    [totalsByType, total],
  )

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-5">
      {/* Add action */}
      <div className="flex flex-wrap items-center justify-end gap-4">
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> Add asset
        </Button>
      </div>

      {/* Composition */}
      {!isLoading && allocation.length > 0 && (
        <section>
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            {allocation.map((entry) => (
              <div
                key={entry.type}
                className="h-full"
                style={{ width: `${Math.max(entry.pct, 1)}%`, backgroundColor: entry.color }}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5">
            {allocation.map((entry) => (
              <span key={entry.type} className="flex items-center gap-2 text-sm">
                <span className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="font-medium">{entry.name}</span>
                <span className="text-muted-foreground">·</span>
                <Money value={entry.value.toFixed(2)} />
                <span className="text-muted-foreground">·</span>
                <span className="font-numeric text-muted-foreground">
                  {entry.pct.toFixed(0)}%
                </span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Grouped list */}
      {isLoading ? (
        <p className="py-6 text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="py-6 text-sm text-destructive">Failed to load assets.</p>
      ) : !assets || assets.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No assets yet"
          subtitle="Add a money pool (checking, savings, ...) and its starting balance to start tracking."
          action={
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> Add asset
            </Button>
          }
        />
      ) : (
        <div>
          {ASSET_TYPES.map((type) => {
            const items = assets.filter((a) => a.asset_type === type)
            if (items.length === 0) return null
            return (
              <div
                key={type}
                className="border-border py-1.5 [&:not(:first-child)]:mt-2 [&:not(:first-child)]:border-t"
              >
                <div className="flex items-baseline justify-between">
                  <span className="flex items-center gap-2 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: ASSET_TYPE_COLOR[type] }}
                    />
                    {ASSET_TYPE_LABEL[type]}
                  </span>
                  <Money
                    value={totalsByType[type].toFixed(2)}
                    className="text-sm font-medium"
                  />
                </div>
                <div className="mt-0.5">
                  {items.map((asset) => (
                    <div
                      key={asset.id}
                      className="flex items-center justify-between py-1.5"
                    >
                      <span className="text-sm font-medium">{asset.name}</span>
                      <div className="flex items-center gap-3">
                        <Money value={asset.balance} className="text-sm font-medium" />
                        <Button
                          variant="ghost"
                          size="icon-sm"
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
                          size="icon-sm"
                          aria-label="Delete asset"
                          onClick={() => setDeleteTarget(asset)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Net worth total */}
      {!isLoading && (assets?.length ?? 0) > 0 && (
        <div className="flex items-baseline justify-between border-t border-border pt-3">
          <span className="text-sm font-medium text-muted-foreground">Net worth</span>
          <Money value={total.toFixed(2)} className="text-lg font-medium" />
        </div>
      )}

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