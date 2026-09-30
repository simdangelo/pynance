import type { Allocation, Asset, Bucket, LiquidityCategory } from "@/types/api"
import {
  LIQUIDITY_CATEGORIES,
  LIQUIDITY_COLOR,
  LIQUIDITY_LABEL,
} from "@/lib/asset-meta"

export interface AllocationBucketGroup {
  bucket: Bucket
  total: number
  pct: number | null
  assets: Asset[]
}

export interface AllocationGroup {
  category: LiquidityCategory
  label: string
  color: string
  total: number
  pct: number | null
  buckets: AllocationBucketGroup[]
}

export function buildAllocationGroups(
  assets: Asset[],
  buckets: Bucket[],
  allocation?: Allocation,
): { groups: AllocationGroup[]; total: number } {
  const liquidityTotals = new Map(
    (allocation?.by_liquidity ?? []).map((row) => [
      row.liquidity_category,
      Number(row.total),
    ]),
  )
  const bucketTotals = new Map(
    (allocation?.by_bucket ?? []).map((row) => [row.bucket_id, Number(row.total)]),
  )
  const total = [...liquidityTotals.values()].reduce((sum, value) => sum + value, 0)

  const groups = LIQUIDITY_CATEGORIES.map((category) => {
    const categoryTotal = liquidityTotals.get(category) ?? 0
    return {
      category,
      label: LIQUIDITY_LABEL[category],
      color: LIQUIDITY_COLOR[category],
      total: categoryTotal,
      pct: total > 0 ? Math.round((categoryTotal / total) * 100) : null,
      buckets: buckets
        .filter((bucket) => bucket.liquidity_category === category)
        .map((bucket) => {
          const bucketTotal = bucketTotals.get(bucket.id) ?? 0
          return {
            bucket,
            total: bucketTotal,
            pct:
              categoryTotal > 0
                ? Math.round((bucketTotal / categoryTotal) * 100)
                : null,
            assets: assets.filter((asset) => asset.bucket_id === bucket.id),
          }
        })
        .filter((entry) => entry.assets.length > 0),
    }
  }).filter((group) => group.buckets.length > 0)

  return { groups, total }
}
