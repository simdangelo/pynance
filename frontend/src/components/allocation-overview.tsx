import type { Allocation, Asset, Bucket } from "@/types/api"
import { buildAllocationGroups } from "@/lib/allocation"
import { DonutChart } from "@/components/donut-chart"
import { Money } from "@/components/money"

interface AllocationOverviewProps {
  assets: Asset[]
  buckets: Bucket[]
  allocation?: Allocation
}

export function AllocationOverview({
  assets,
  buckets,
  allocation,
}: AllocationOverviewProps) {
  const { groups } = buildAllocationGroups(assets, buckets, allocation)
  const slices = groups.filter((group) => group.total > 0)

  if (groups.length === 0) return null

  return (
    <section className="flex flex-col items-center gap-8 lg:flex-row lg:justify-center lg:gap-14">
      <DonutChart
        data={slices.map((group) => ({
          label: group.label,
          value: group.total,
          color: group.color,
        }))}
        className="size-80 shrink-0"
        innerRadius={96}
        outerRadius={148}
      />

      <div className="w-full space-y-4 lg:w-auto">
        {groups.map((group) => (
          <div key={group.category} className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: group.color }}
                />
                {group.label}
              </span>
              <Money
                value={group.total.toFixed(2)}
                className="text-sm font-medium"
              />
              {group.pct !== null && (
                <span
                  className="rounded-md px-1.5 py-0.5 font-numeric text-sm font-semibold"
                  style={{
                    color: group.color,
                    backgroundColor: `color-mix(in srgb, ${group.color} 14%, transparent)`,
                  }}
                >
                  {group.pct}%
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-1 pl-4">
              {group.buckets.map((entry) => (
                <span
                  key={entry.bucket.id}
                  className="flex items-baseline gap-1.5 text-[13px]"
                >
                  <span className="text-muted-foreground">
                    {entry.bucket.name}
                  </span>
                  <Money value={entry.total.toFixed(2)} className="text-[13px]" />
                  {entry.pct !== null && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 font-numeric text-[11px] font-medium text-muted-foreground">
                      {entry.pct}%
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
