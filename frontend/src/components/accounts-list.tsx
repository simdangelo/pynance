import { Pencil, Plus, Trash2 } from "lucide-react"

import type { Allocation, Asset, Bucket, LiquidityCategory } from "@/types/api"
import {
  ASSET_CLASS_LABEL,
  LIQUIDITY_CATEGORIES,
  LIQUIDITY_COLOR,
  LIQUIDITY_LABEL,
} from "@/lib/asset-meta"
import { Money } from "@/components/money"
import { RowActions } from "@/components/row-actions"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

interface AccountsListProps {
  assets: Asset[]
  buckets: Bucket[]
  allocation?: Allocation
  onAddBucket: (category?: LiquidityCategory) => void
  onAddAsset: (bucketId?: number) => void
  onEditBucket: (bucket: Bucket) => void
  onDeleteBucket: (bucket: Bucket) => void
  onEditAsset: (asset: Asset) => void
  onDeleteAsset: (asset: Asset) => void
}

export function AccountsList({
  assets,
  buckets,
  allocation,
  onAddBucket,
  onAddAsset,
  onEditBucket,
  onDeleteBucket,
  onEditAsset,
  onDeleteAsset,
}: AccountsListProps) {
  const bucketTotals = new Map(
    (allocation?.by_bucket ?? []).map((row) => [row.bucket_id, Number(row.total)]),
  )
  const netWorth = (allocation?.by_liquidity ?? []).reduce(
    (sum, row) => sum + Number(row.total),
    0,
  )

  const categoryOrder = new Map(LIQUIDITY_CATEGORIES.map((category, index) => [category, index]))
  const orderedBuckets = [...buckets].sort((a, b) => {
    const byCategory =
      (categoryOrder.get(a.liquidity_category) ?? 0) -
      (categoryOrder.get(b.liquidity_category) ?? 0)
    return byCategory !== 0 ? byCategory : a.sort_order - b.sort_order
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Accounts</CardTitle>
        <CardDescription>
          {orderedBuckets.length} bucket{orderedBuckets.length === 1 ? "" : "s"},{" "}
          {assets.length} asset{assets.length === 1 ? "" : "s"}
        </CardDescription>
        <CardAction>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onAddBucket()}>
              <Plus className="mr-1 h-4 w-4" /> Bucket
            </Button>
            <Button variant="outline" size="sm" onClick={() => onAddAsset()}>
              <Plus className="mr-1 h-4 w-4" /> Asset
            </Button>
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-3">
        {orderedBuckets.map((bucket) => {
          const items = assets.filter((asset) => asset.bucket_id === bucket.id)
          return (
            <div key={bucket.id} className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: LIQUIDITY_COLOR[bucket.liquidity_category] }}
                  />
                  <span className="truncate text-sm font-semibold">{bucket.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {LIQUIDITY_LABEL[bucket.liquidity_category]}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Money
                    value={(bucketTotals.get(bucket.id) ?? 0).toFixed(2)}
                    className="text-sm font-medium"
                  />
                  <RowActions label={`Actions for ${bucket.name}`}>
                    <DropdownMenuItem onClick={() => onAddAsset(bucket.id)}>
                      <Plus /> Add asset
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEditBucket(bucket)}>
                      <Pencil /> Edit bucket
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onDeleteBucket(bucket)}
                    >
                      <Trash2 /> Delete bucket
                    </DropdownMenuItem>
                  </RowActions>
                </div>
              </div>

              <div className="p-1.5">
                {items.length === 0 ? (
                  <p className="px-2.5 py-2 text-sm text-muted-foreground">
                    No assets in this bucket yet.
                  </p>
                ) : (
                  items.map((asset) => (
                    <div
                      key={asset.id}
                      className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-sm font-medium">{asset.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {ASSET_CLASS_LABEL[asset.asset_class]}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Money value={asset.balance} className="text-sm" />
                        <RowActions label={`Actions for ${asset.name}`}>
                          <DropdownMenuItem onClick={() => onEditAsset(asset)}>
                            <Pencil /> Edit asset
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => onDeleteAsset(asset)}
                          >
                            <Trash2 /> Delete asset
                          </DropdownMenuItem>
                        </RowActions>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </CardContent>

      <CardFooter className="justify-between">
        <span className="text-sm font-semibold">Net worth</span>
        <Money value={netWorth.toFixed(2)} className="text-base font-semibold" />
      </CardFooter>
    </Card>
  )
}
