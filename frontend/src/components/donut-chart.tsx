import { Pie, PieChart } from "recharts"

import { cn } from "@/lib/utils"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export interface DonutSlice {
  label: string
  value: number
  color: string
}

interface DonutChartProps {
  data: DonutSlice[]
  className?: string
  innerRadius: number
  outerRadius: number
}

export function DonutChart({
  data,
  className,
  innerRadius,
  outerRadius,
}: DonutChartProps) {
  const config = Object.fromEntries(
    data.map((slice, index) => [
      `slice-${index}`,
      { label: slice.label, color: slice.color },
    ]),
  ) satisfies ChartConfig

  const chartData = data.map((slice, index) => ({
    name: `slice-${index}`,
    value: slice.value,
    fill: `var(--color-slice-${index})`,
  }))

  return (
    <ChartContainer config={config} className={cn("aspect-square", className)}>
      <PieChart>
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent hideLabel />}
        />
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          isAnimationActive={false}
        />
      </PieChart>
    </ChartContainer>
  )
}
