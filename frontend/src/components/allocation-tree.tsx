import { Pencil, Plus, Trash2 } from "lucide-react"

import type { Allocation, Asset, Bucket, LiquidityCategory } from "@/types/api"
import { ASSET_CLASS_LABEL } from "@/lib/asset-meta"
import { buildAllocationGroups } from "@/lib/allocation"
import { cn } from "@/lib/utils"
import { Money } from "@/components/money"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface AllocationTreeProps {
  assets: Asset[]
  buckets: Bucket[]
  allocation?: Allocation
  onAddBucket: (category: LiquidityCategory) => void
  onAddAsset: (bucket: Bucket) => void
  onEditBucket: (bucket: Bucket) => void
  onDeleteBucket: (bucket: Bucket) => void
  onEditAsset: (asset: Asset) => void
  onDeleteAsset: (asset: Asset) => void
}

const rowGrid = "grid grid-cols-[minmax(0,1fr)_auto_4rem] items-center gap-3"

export function AllocationTree({
  assets,
  buckets,
  allocation,
  onAddBucket,
  onAddAsset,
  onEditBucket,
  onDeleteBucket,
  onEditAsset,
  onDeleteAsset,
}: AllocationTreeProps) {
  const { groups, total } = buildAllocationGroups(assets, buckets, allocation)

  if (groups.length === 0) return null

  return (
    <Card className="gap-0 overflow-hidden py-0">
      {groups.map((group) => (
        <div key={group.category}>
          <div
            className={cn(rowGrid, "border-l-4 py-2.5 pr-4 pl-4")}
            style={{
              borderColor: group.color,
              backgroundColor: `color-mix(in srgb, ${group.color} 9%, var(--card))`,
            }}
          >
            <span
              className="min-w-0 truncate text-sm font-semibold"
              style={{ color: group.color }}
            >
              {group.label}
            </span>
            <Money value={group.total.toFixed(2)} className="text-sm font-medium" />
            <span className="flex items-center justify-end">
              {group.pct !== null && (
                <span className="rounded-full bg-card px-2 py-0.5 font-numeric text-xs font-medium">
                  {group.pct}%
                </span>
              )}
            </span>
          </div>

          {group.buckets.map((entry) => (
            <div key={entry.bucket.id}>
              <div
                className={cn(
                  rowGrid,
                  "bg-row-group py-1.5 pr-4 pl-8 transition-colors hover:bg-muted",
                )}
              >
                <span className="min-w-0 truncate text-[13px] font-semibold">
                  {entry.bucket.name}
                </span>
                <Money
                  value={entry.total.toFixed(2)}
                  className="text-sm text-muted-foreground"
                />
                <span className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    aria-label={`Edit ${entry.bucket.name}`}
                    onClick={() => onEditBucket(entry.bucket)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    aria-label={`Delete ${entry.bucket.name}`}
                    onClick={() => onDeleteBucket(entry.bucket)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </span>
              </div>

              {entry.assets.map((asset) => (
                <div
                  key={asset.id}
                  className={cn(
                    rowGrid,
                    "py-1.5 pr-4 pl-16 transition-colors hover:bg-row-hover",
                  )}
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-sm font-medium">
                      {asset.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {ASSET_CLASS_LABEL[asset.asset_class]}
                    </span>
                  </span>
                  <Money value={asset.balance} className="text-sm" />
                  <span className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground"
                      aria-label={`Edit ${asset.name}`}
                      onClick={() => onEditAsset(asset)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground"
                      aria-label={`Delete ${asset.name}`}
                      onClick={() => onDeleteAsset(asset)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </span>
                </div>
              ))}

              <div className="py-1 pr-4 pl-16">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAddAsset(entry.bucket)}
                >
                  <Plus className="mr-1 h-4 w-4" /> Add asset
                </Button>
              </div>
            </div>
          ))}

          <div className="py-1.5 pr-4 pl-8">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAddBucket(group.category)}
            >
              <span
                className="mr-1.5 size-2 shrink-0 rounded-full"
                style={{ backgroundColor: group.color }}
              />
              Add bucket
            </Button>
          </div>
        </div>
      ))}

      <div className={cn(rowGrid, "border-t border-border py-3 pr-4 pl-4")}>
        <span className="text-sm font-semibold">Net worth</span>
        <Money value={total.toFixed(2)} className="text-base font-semibold" />
        <span />
      </div>
    </Card>
  )
}
