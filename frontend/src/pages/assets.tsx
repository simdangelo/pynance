import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ChevronDown, ChevronUp, Landmark, Layers, Pencil, Plus, Trash2 } from "lucide-react"

import { api } from "@/lib/api"
import type { Asset, AssetClass, Bucket } from "@/types/api"
import {
  ASSET_CLASSES,
  ASSET_CLASS_COLOR,
  ASSET_CLASS_LABEL,
  LIQUIDITY_COLOR,
  LIQUIDITY_LABEL,
} from "@/lib/asset-meta"
import { Money } from "@/components/money"
import { AssetDialog } from "@/components/asset-dialog"
import { BucketDialog } from "@/components/bucket-dialog"
import { BucketDeleteDialog } from "@/components/bucket-delete-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { Segmented } from "@/components/segmented"
import { Button } from "@/components/ui/button"
import Transfers from "@/pages/transfers"

type AssetsTab = "accounts" | "transfers"

export default function Assets() {
  const [tab, setTab] = useState<AssetsTab>("accounts")

  return (
    <div className="space-y-5">
      <Segmented
        size="md"
        value={tab}
        onChange={(value) => setTab(value as AssetsTab)}
        options={[
          { value: "accounts", label: "Accounts" },
          { value: "transfers", label: "Transfers" },
        ]}
      />
      {tab === "transfers" ? <Transfers /> : <AccountsPanel />}
    </div>
  )
}

function AccountsPanel() {
  const queryClient = useQueryClient()
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
  const [bucketDialogOpen, setBucketDialogOpen] = useState(false)
  const [editingBucket, setEditingBucket] = useState<Bucket | null>(null)
  const [deleteAssetTarget, setDeleteAssetTarget] = useState<Asset | null>(null)
  const [deleteBucketTarget, setDeleteBucketTarget] = useState<Bucket | null>(null)

  const { data: assets, isLoading, isError } = useQuery({
    queryKey: ["assets"],
    queryFn: api.assets.list,
  })

  const { data: buckets } = useQuery({
    queryKey: ["buckets"],
    queryFn: api.buckets.list,
  })

  const { data: allocation } = useQuery({
    queryKey: ["allocation"],
    queryFn: api.assets.allocation,
  })

  const deleteAssetMutation = useMutation({
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

  const reorderMutation = useMutation({
    mutationFn: async ({ bucket, direction }: { bucket: Bucket; direction: -1 | 1 }) => {
      const ordered = [...(buckets ?? [])]
      const index = ordered.findIndex((candidate) => candidate.id === bucket.id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= ordered.length) return
      const reordered = [...ordered]
      const moved = reordered[index]
      reordered[index] = reordered[target]
      reordered[target] = moved
      await Promise.all(
        reordered.map((candidate, position) =>
          candidate.sort_order === position
            ? Promise.resolve()
            : api.buckets.update(candidate.id, { sort_order: position }),
        ),
      )
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["buckets"] }),
    onError: (error: Error) => toast.error(error.message || "Failed to reorder buckets"),
  })

  const total = useMemo(
    () => (assets ?? []).reduce((sum, asset) => sum + Number(asset.balance), 0),
    [assets],
  )

  const allocationByBucket = useMemo(() => {
    const map: Record<number, number> = {}
    for (const row of allocation?.by_bucket ?? []) {
      map[row.bucket_id] = Number(row.total)
    }
    return map
  }, [allocation])

  const assetCountByBucket = useMemo(() => {
    const map: Record<number, number> = {}
    for (const asset of assets ?? []) {
      map[asset.bucket_id] = (map[asset.bucket_id] ?? 0) + 1
    }
    return map
  }, [assets])

  const classAllocation = useMemo(() => {
    const totals: Partial<Record<AssetClass, number>> = {}
    for (const asset of assets ?? []) {
      totals[asset.asset_class] = (totals[asset.asset_class] ?? 0) + Number(asset.balance)
    }
    const sum = Object.values(totals).reduce<number>((acc, value) => acc + (value ?? 0), 0)
    return ASSET_CLASSES.map((assetClass) => ({
      assetClass,
      name: ASSET_CLASS_LABEL[assetClass],
      value: totals[assetClass] ?? 0,
      pct: sum > 0 ? ((totals[assetClass] ?? 0) / sum) * 100 : 0,
      color: ASSET_CLASS_COLOR[assetClass],
    }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [assets])

  const openCreateAsset = () => {
    setEditingAsset(null)
    setAssetDialogOpen(true)
  }

  const openCreateBucket = () => {
    setEditingBucket(null)
    setBucketDialogOpen(true)
  }

  return (
    <>
      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={openCreateBucket}>
          <Plus className="mr-1 h-4 w-4" /> Add bucket
        </Button>
        <Button onClick={openCreateAsset}>
          <Plus className="mr-1 h-4 w-4" /> Add asset
        </Button>
      </div>

      {/* Composition by asset class */}
      {!isLoading && classAllocation.length > 0 && (
        <section>
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            {classAllocation.map((entry) => (
              <div
                key={entry.assetClass}
                className="h-full"
                style={{
                  width: `${Math.max(entry.pct, 1)}%`,
                  backgroundColor: entry.color,
                }}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5">
            {classAllocation.map((entry) => (
              <span key={entry.assetClass} className="flex items-center gap-2 text-sm">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
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

      {/* Buckets with their assets */}
      {isLoading ? (
        <p className="py-6 text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="py-6 text-sm text-destructive">Failed to load assets.</p>
      ) : !assets || assets.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No assets yet"
          subtitle="Add a money pool (checking, savings, ...), pick what it is and which bucket it belongs to."
          action={
            <Button size="sm" onClick={openCreateAsset}>
              <Plus className="mr-1 h-4 w-4" /> Add asset
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {(buckets ?? []).map((bucket, index) => {
            const items = (assets ?? []).filter((a) => a.bucket_id === bucket.id)
            return (
              <div key={bucket.id} className="rounded-xl border border-border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: LIQUIDITY_COLOR[bucket.liquidity_category] }}
                    />
                    <span className="text-sm font-semibold">{bucket.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {LIQUIDITY_LABEL[bucket.liquidity_category]}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Money
                      value={(allocationByBucket[bucket.id] ?? 0).toFixed(2)}
                      className="mr-2 text-sm font-medium"
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Move bucket up"
                      disabled={index === 0 || reorderMutation.isPending}
                      onClick={() => reorderMutation.mutate({ bucket, direction: -1 })}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Move bucket down"
                      disabled={
                        index === (buckets?.length ?? 1) - 1 || reorderMutation.isPending
                      }
                      onClick={() => reorderMutation.mutate({ bucket, direction: 1 })}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit bucket"
                      onClick={() => {
                        setEditingBucket(bucket)
                        setBucketDialogOpen(true)
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete bucket"
                      onClick={() => setDeleteBucketTarget(bucket)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {items.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    No assets in this bucket yet.
                  </p>
                ) : (
                  <div className="px-4 py-1">
                    {items.map((asset) => (
                      <div
                        key={asset.id}
                        className="flex items-center justify-between py-1.5"
                      >
                        <span className="flex items-center gap-2 text-sm">
                          <Layers className="hidden size-3.5 text-muted-foreground sm:block" />
                          <span className="font-medium">{asset.name}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">
                            {ASSET_CLASS_LABEL[asset.asset_class]}
                          </span>
                        </span>
                        <div className="flex items-center gap-3">
                          <Money value={asset.balance} className="text-sm font-medium" />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Edit asset"
                            onClick={() => {
                              setEditingAsset(asset)
                              setAssetDialogOpen(true)
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Delete asset"
                            onClick={() => setDeleteAssetTarget(asset)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
        open={assetDialogOpen}
        onOpenChange={setAssetDialogOpen}
        asset={editingAsset}
      />

      <BucketDialog
        open={bucketDialogOpen}
        onOpenChange={setBucketDialogOpen}
        bucket={editingBucket}
      />

      <BucketDeleteDialog
        open={deleteBucketTarget !== null}
        onOpenChange={(open) => !open && setDeleteBucketTarget(null)}
        bucket={deleteBucketTarget}
        buckets={buckets ?? []}
        assetCount={deleteBucketTarget ? (assetCountByBucket[deleteBucketTarget.id] ?? 0) : 0}
      />

      <ConfirmDialog
        open={deleteAssetTarget !== null}
        onOpenChange={(open) => !open && setDeleteAssetTarget(null)}
        title="Delete asset?"
        description={
          deleteAssetTarget
            ? `"${deleteAssetTarget.name}" will be permanently removed. Assets with transactions or transfers cannot be deleted.`
            : undefined
        }
        onConfirm={() => deleteAssetTarget && deleteAssetMutation.mutate(deleteAssetTarget.id)}
      />
    </>
  )
}
