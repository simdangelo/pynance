import { Fragment } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"

import type { Allocation, Asset, Bucket, LiquidityCategory } from "@/types/api"
import {
  ASSET_CLASS_LABEL,
  LIQUIDITY_CATEGORIES,
  LIQUIDITY_COLOR,
  LIQUIDITY_LABEL,
} from "@/lib/asset-meta"
import { Money } from "@/components/money"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface AccountsTableProps {
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

export function AccountsTable({
  assets,
  buckets,
  allocation,
  onAddBucket,
  onAddAsset,
  onEditBucket,
  onDeleteBucket,
  onEditAsset,
  onDeleteAsset,
}: AccountsTableProps) {
  const categoryTotals = new Map(
    (allocation?.by_liquidity ?? []).map((row) => [
      row.liquidity_category,
      Number(row.total),
    ]),
  )
  const bucketTotals = new Map(
    (allocation?.by_bucket ?? []).map((row) => [row.bucket_id, Number(row.total)]),
  )
  const total = [...categoryTotals.values()].reduce((sum, value) => sum + value, 0)

  const groups = LIQUIDITY_CATEGORIES.map((category) => ({
    category,
    label: LIQUIDITY_LABEL[category],
    color: LIQUIDITY_COLOR[category],
    total: categoryTotals.get(category) ?? 0,
    buckets: buckets
      .filter((bucket) => bucket.liquidity_category === category)
      .map((bucket) => ({
        bucket,
        total: bucketTotals.get(bucket.id) ?? 0,
        assets: assets.filter((asset) => asset.bucket_id === bucket.id),
      })),
  }))

  return (
    <Card className="overflow-hidden py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asset</TableHead>
            <TableHead className="w-[180px]">Type</TableHead>
            <TableHead className="w-[140px] text-right">Balance</TableHead>
            <TableHead className="w-[120px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <Fragment key={group.category}>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableCell colSpan={4} className="py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-semibold tracking-[0.06em] uppercase">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: group.color }}
                      />
                      {group.label}
                      <span className="font-normal text-muted-foreground">
                        ({group.buckets.length})
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <Money value={group.total.toFixed(2)} className="text-sm font-medium" />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-muted-foreground"
                        onClick={() => onAddBucket(group.category)}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" /> Bucket
                      </Button>
                    </span>
                  </div>
                </TableCell>
              </TableRow>

              {group.buckets.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="py-2 pl-6 text-sm text-muted-foreground">
                    No buckets yet.
                  </TableCell>
                </TableRow>
              ) : (
                group.buckets.map((entry) => (
                  <Fragment key={entry.bucket.id}>
                    <TableRow className="hover:bg-muted/30">
                      <TableCell colSpan={2} className="pl-6">
                        <span className="text-[13px] font-semibold">
                          {entry.bucket.name}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        <Money value={entry.total.toFixed(2)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-muted-foreground"
                            onClick={() => onAddAsset(entry.bucket)}
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" /> Asset
                          </Button>
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
                        </div>
                      </TableCell>
                    </TableRow>

                    {entry.assets.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={4}
                          className="py-1.5 pl-10 text-sm text-muted-foreground"
                        >
                          No assets in this bucket yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      entry.assets.map((asset) => (
                        <TableRow key={asset.id} className="hover:bg-muted/20">
                          <TableCell className="pl-10 text-sm font-medium">
                            {asset.name}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {ASSET_CLASS_LABEL[asset.asset_class]}
                          </TableCell>
                          <TableCell className="text-right font-numeric">
                            <Money value={asset.balance} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
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
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </Fragment>
                ))
              )}
            </Fragment>
          ))}

          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={2} className="font-semibold">
              Net worth
            </TableCell>
            <TableCell className="text-right font-numeric text-base font-semibold">
              <Money value={total.toFixed(2)} />
            </TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
    </Card>
  )
}
