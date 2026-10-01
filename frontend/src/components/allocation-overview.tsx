import { Cell, Pie, PieChart } from "recharts"

import type { Allocation, Asset, Bucket } from "@/types/api"
import { buildAllocationGroups } from "@/lib/allocation"
import { useDonutHover } from "@/components/donut-hover"
import { Money } from "@/components/money"
import { ChartContainer } from "@/components/ui/chart"

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
  const { groups, total } = buildAllocationGroups(assets, buckets, allocation)
  const slices = groups.filter((group) => group.total > 0)

  const { containerProps, enterSlice, popup } = useDonutHover(
    slices.map((group) => ({
      id: group.category,
      name: group.label,
      color: group.color,
      value: group.total.toFixed(2),
      extra: group.pct !== null ? `${group.pct}%` : undefined,
    })),
  )

  if (groups.length === 0) return null

  return (
    <section className="flex flex-col items-center gap-8 lg:flex-row lg:justify-center lg:gap-14">
      <div className="relative size-80 shrink-0" {...containerProps}>
        <ChartContainer config={{}} className="size-80">
          <PieChart>
            <Pie
              data={slices}
              dataKey="total"
              nameKey="label"
              innerRadius={96}
              outerRadius={148}
              paddingAngle={2}
              strokeWidth={0}
              isAnimationActive={false}
              onMouseEnter={(_, index) => enterSlice(index)}
            >
              {slices.map((group) => (
                <Cell key={group.category} fill={group.color} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className="text-xs text-muted-foreground">Net worth</span>
          <Money value={total.toFixed(2)} className="text-lg font-semibold" />
        </div>
        {popup}
      </div>

      <div className="w-full space-y-4 lg:w-auto">
        {groups.map((group) => (
          <div key={group.category} className="space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
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
                <span className="rounded-full bg-muted px-1.5 py-0.5 font-numeric text-[11px] font-medium text-muted-foreground">
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
