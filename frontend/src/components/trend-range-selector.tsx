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

export function rangeToDates(range: TrendRange): { start: string; end: string } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const fmt = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }

  const start = new Date(today)
  switch (range) {
    case "YTD":
      start.setMonth(0)
      start.setDate(1)
      break
    case "1Y":
      start.setFullYear(start.getFullYear() - 1)
      break
    case "5Y":
      start.setFullYear(start.getFullYear() - 5)
      break
    case "ALL":
      start.setFullYear(2000)
      start.setMonth(0)
      start.setDate(1)
      break
  }
  return { start: fmt(start), end: fmt(today) }
}