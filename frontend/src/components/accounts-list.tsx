import { Pencil, Plus, Trash2 } from "lucide-react"

import type { Allocation, Asset, Bucket, LiquidityCategory } from "@/types/api"
import {
  ASSET_CLASS_LABEL,
  LIQUIDITY_CATEGORIES,
  LIQUIDITY_COLOR,
  LIQUIDITY_LABEL,
} from "@/lib/asset-meta"
import { EmptyState } from "@/components/empty-state"
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
  const categoryTotals = new Map(
    (allocation?.by_liquidity ?? []).map((row) => [
      row.liquidity_category,
      Number(row.total),
    ]),
  )
  const netWorth = (allocation?.by_liquidity ?? []).reduce(
    (sum, row) => sum + Number(row.total),
    0,
  )

  const orderedBuckets = [...buckets]
    .filter((bucket) => LIQUIDITY_CATEGORIES.includes(bucket.liquidity_category))
    .sort((a, b) => a.sort_order - b.sort_order)

  const groups = LIQUIDITY_CATEGORIES.map((category) => ({
    category,
    label: LIQUIDITY_LABEL[category],
    color: LIQUIDITY_COLOR[category],
    total: categoryTotals.get(category) ?? 0,
    buckets: orderedBuckets.filter(
      (bucket) => bucket.liquidity_category === category,
    ),
  }))

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

      <CardContent className="space-y-8">
        {groups.map((group) => (
          <section key={group.category} className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: group.color }}
                />
                <span className="text-xs font-semibold tracking-[0.02em]">
                  {group.label}
                </span>
              </span>
              <Money
                value={group.total.toFixed(2)}
                className="text-sm text-muted-foreground"
              />
            </div>

            {group.buckets.length === 0 ? (
              <EmptyState
                title="No buckets yet"
                subtitle="Add a bucket to start grouping your accounts."
              />
            ) : (
              group.buckets.map((bucket) => {
                const items = assets.filter(
                  (asset) => asset.bucket_id === bucket.id,
                )
                return (
                  <div
                    key={bucket.id}
                    className="overflow-hidden rounded-xl border border-border"
                  >
                    <div className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-2">
                      <span className="min-w-0 truncate text-sm font-semibold">
                        {bucket.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <Money
                          value={(bucketTotals.get(bucket.id) ?? 0).toFixed(2)}
                          className="text-sm font-medium"
                        />
                        <RowActions label={`Actions for ${bucket.name}`}>
                          <DropdownMenuItem
                            onClick={() => onAddAsset(bucket.id)}
                          >
                            <Plus /> Add asset
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onEditBucket(bucket)}
                          >
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
                        <EmptyState
                          className="py-5"
                          title="No assets in this bucket yet"
                        />
                      ) : (
                        items.map((asset) => (
                          <div
                            key={asset.id}
                            className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/40"
                          >
                            <div className="flex min-w-0 items-baseline gap-2">
                              <span className="truncate text-sm font-medium">
                                {asset.name}
                              </span>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {ASSET_CLASS_LABEL[asset.asset_class]}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Money value={asset.balance} className="text-sm" />
                              <RowActions label={`Actions for ${asset.name}`}>
                                <DropdownMenuItem
                                  onClick={() => onEditAsset(asset)}
                                >
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
              })
            )}
          </section>
        ))}
      </CardContent>

      <CardFooter className="justify-between">
        <span className="text-sm font-semibold">Net worth</span>
        <Money value={netWorth.toFixed(2)} className="text-base font-semibold" />
      </CardFooter>
    </Card>
  )
}
