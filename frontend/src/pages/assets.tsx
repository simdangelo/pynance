import { useMemo, useState } from "react"
import { Navigate, Route, Routes, useLocation } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Landmark, Plus } from "lucide-react"

import { api } from "@/lib/api"
import type { Asset, Bucket, LiquidityCategory, Transfer } from "@/types/api"
import { AllocationOverview } from "@/components/allocation-overview"
import { AccountsList } from "@/components/accounts-list"
import { AssetDialog } from "@/components/asset-dialog"
import { BucketDialog } from "@/components/bucket-dialog"
import { BucketDeleteDialog } from "@/components/bucket-delete-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { PageTabs } from "@/components/page-tabs"
import { ReconcilePanel } from "@/components/reconcile-panel"
import { TransferDialog } from "@/components/transfer-dialog"
import { Button } from "@/components/ui/button"
import Transfers from "@/pages/transfers"

const ASSET_TABS = [
  { to: "/assets/accounts", label: "Accounts" },
  { to: "/assets/transfers", label: "Transfers" },
  { to: "/assets/reconcile", label: "Reconcile" },
]

export default function Assets() {
  const location = useLocation()
  const isTransfers = location.pathname.endsWith("/transfers")

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
        tabs={<PageTabs tabs={ASSET_TABS} />}
        action={
          isTransfers ? (
            <Button onClick={openAddTransfer}>
              <Plus className="mr-1 h-4 w-4" /> Add transfer
            </Button>
          ) : undefined
        }
      />

      <Routes>
        <Route index element={<Navigate to="accounts" replace />} />
        <Route
          path="accounts"
          element={
            <AccountsPanel
              onAddAsset={openAddAsset}
              onEditAsset={openEditAsset}
              onAddBucket={openAddBucket}
              onEditBucket={openEditBucket}
            />
          }
        />
        <Route
          path="transfers"
          element={
            <Transfers
              onAddTransfer={openAddTransfer}
              onEditTransfer={openEditTransfer}
            />
          }
        />
        <Route path="reconcile" element={<ReconcilePanel />} />
        <Route path="*" element={<Navigate to="accounts" replace />} />
      </Routes>

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
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={() => onAddAsset()}>
                <Plus className="mr-1 h-4 w-4" /> Add asset
              </Button>
              <Button size="sm" variant="outline" onClick={() => onAddBucket()}>
                <Plus className="mr-1 h-4 w-4" /> Add bucket
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-5">
          <AllocationOverview
            assets={assets}
            buckets={buckets ?? []}
            allocation={allocation}
          />
          <AccountsList
            assets={assets}
            buckets={buckets ?? []}
            allocation={allocation}
            onAddBucket={onAddBucket}
            onAddAsset={onAddAsset}
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
