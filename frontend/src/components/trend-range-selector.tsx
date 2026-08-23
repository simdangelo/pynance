import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export type TrendRange = "ALL" | "5Y" | "1Y" | "YTD"

const RANGES: TrendRange[] = ["ALL", "5Y", "1Y", "YTD"]

interface TrendRangeSelectorProps {
  value: TrendRange
  onChange: (range: TrendRange) => void
}

export function TrendRangeSelector({ value, onChange }: TrendRangeSelectorProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
      {RANGES.map((range) => (
        <Button
          key={range}
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-6 px-2 text-xs",
            value === range && "bg-accent text-accent-foreground",
          )}
          onClick={() => onChange(range)}
        >
          {range}
        </Button>
      ))}
    </div>
  )
}