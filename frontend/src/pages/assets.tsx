import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Landmark, Plus } from "lucide-react"

import { api } from "@/lib/api"
import type { Asset, Bucket, LiquidityCategory, Transfer } from "@/types/api"
import { AllocationOverview } from "@/components/allocation-overview"
import { AllocationTree } from "@/components/allocation-tree"
import { AssetDialog } from "@/components/asset-dialog"
import { BucketDialog } from "@/components/bucket-dialog"
import { BucketDeleteDialog } from "@/components/bucket-delete-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { TransferDialog } from "@/components/transfer-dialog"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import Transfers from "@/pages/transfers"

type AssetsTab = "accounts" | "transfers"

export default function Assets() {
  const [tab, setTab] = useState<AssetsTab>("accounts")

  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
  const [assetBucketPreset, setAssetBucketPreset] = useState<number | undefined>(undefined)

  const [bucketDialogOpen, setBucketDialogOpen] = useState(false)
  const [editingBucket, setEditingBucket] = useState<Bucket | null>(null)
  const [bucketCategoryPreset, setBucketCategoryPreset] = useState<
    LiquidityCategory | undefined
  >(undefined)

  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null)

  const openAddTransfer = () => {
    setEditingTransfer(null)
    setTransferDialogOpen(true)
  }

  const openEditTransfer = (transfer: Transfer) => {
    setEditingTransfer(transfer)
    setTransferDialogOpen(true)
  }

  const openAddAsset = (bucketId?: number) => {
    setEditingAsset(null)
    setAssetBucketPreset(bucketId)
    setAssetDialogOpen(true)
  }

  const openEditAsset = (asset: Asset) => {
    setEditingAsset(asset)
    setAssetBucketPreset(undefined)
    setAssetDialogOpen(true)
  }

  const openAddBucket = (category?: LiquidityCategory) => {
    setEditingBucket(null)
    setBucketCategoryPreset(category)
    setBucketDialogOpen(true)
  }

  const openEditBucket = (bucket: Bucket) => {
    setEditingBucket(bucket)
    setBucketCategoryPreset(undefined)
    setBucketDialogOpen(true)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Assets"
        tabs={<AssetTabs value={tab} onChange={setTab} />}
        action={
          tab === "transfers" ? (
            <Button onClick={openAddTransfer}>
              <Plus className="mr-1 h-4 w-4" /> Add transfer
            </Button>
          ) : undefined
        }
      />
      {tab === "transfers" ? (
        <Transfers
          onAddTransfer={openAddTransfer}
          onEditTransfer={openEditTransfer}
        />
      ) : (
        <AccountsPanel
          onAddAsset={openAddAsset}
          onEditAsset={openEditAsset}
          onAddBucket={openAddBucket}
          onEditBucket={openEditBucket}
        />
      )}

      <AssetDialog
        open={assetDialogOpen}
        onOpenChange={setAssetDialogOpen}
        asset={editingAsset}
        defaultBucketId={assetBucketPreset}
      />

      <BucketDialog
        open={bucketDialogOpen}
        onOpenChange={setBucketDialogOpen}
        bucket={editingBucket}
        defaultLiquidityCategory={bucketCategoryPreset}
      />

      <TransferDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        transfer={editingTransfer}
      />
    </div>
  )
}

function AssetTabs({
  value,
  onChange,
}: {
  value: AssetsTab
  onChange: (tab: AssetsTab) => void
}) {
  const tabs: { value: AssetsTab; label: string }[] = [
    { value: "accounts", label: "Accounts" },
    { value: "transfers", label: "Transfers" },
  ]

  return (
    <div className="flex items-baseline gap-5">
      {tabs.map((tab) => {
        const active = value === tab.value
        return (
          <button
            key={tab.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "relative cursor-pointer text-lg font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            <span
              className={cn(
                "absolute inset-x-0 -bottom-1.5 h-0.5 rounded-full bg-primary transition-opacity",
                active ? "opacity-100" : "opacity-0",
              )}
            />
          </button>
        )
      })}
    </div>
  )
}

interface AccountsPanelProps {
  onAddAsset: (bucketId?: number) => void
  onEditAsset: (asset: Asset) => void
  onAddBucket: (category?: LiquidityCategory) => void
  onEditBucket: (bucket: Bucket) => void
}

function AccountsPanel({
  onAddAsset,
  onEditAsset,
  onAddBucket,
  onEditBucket,
}: AccountsPanelProps) {
  const queryClient = useQueryClient()
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

  const assetCountByBucket = useMemo(() => {
    const map: Record<number, number> = {}
    for (const asset of assets ?? []) {
      map[asset.bucket_id] = (map[asset.bucket_id] ?? 0) + 1
    }
    return map
  }, [assets])

  return (
    <>
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
            <Button size="sm" onClick={() => onAddAsset()}>
              <Plus className="mr-1 h-4 w-4" /> Add asset
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          <AllocationOverview
            assets={assets}
            buckets={buckets ?? []}
            allocation={allocation}
          />
          <AllocationTree
            assets={assets}
            buckets={buckets ?? []}
            allocation={allocation}
            onAddBucket={onAddBucket}
            onAddAsset={(bucket) => onAddAsset(bucket.id)}
            onEditBucket={onEditBucket}
            onDeleteBucket={(bucket) => setDeleteBucketTarget(bucket)}
            onEditAsset={onEditAsset}
            onDeleteAsset={(asset) => setDeleteAssetTarget(asset)}
          />
        </div>
      )}

      <BucketDeleteDialog
        open={deleteBucketTarget !== null}
        onOpenChange={(open) => !open && setDeleteBucketTarget(null)}
        bucket={deleteBucketTarget}
        buckets={buckets ?? []}
        assetCount={
          deleteBucketTarget ? (assetCountByBucket[deleteBucketTarget.id] ?? 0) : 0
        }
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
        onConfirm={() =>
          deleteAssetTarget && deleteAssetMutation.mutate(deleteAssetTarget.id)
        }
      />
    </>
  )
}
