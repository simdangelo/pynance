import { Segmented } from "@/components/segmented"

export type TrendRange = "ALL" | "5Y" | "1Y" | "YTD"

const RANGES: TrendRange[] = ["ALL", "5Y", "1Y", "YTD"]

interface TrendRangeSelectorProps {
  value: TrendRange
  onChange: (range: TrendRange) => void
}

export function TrendRangeSelector({ value, onChange }: TrendRangeSelectorProps) {
  return (
    <Segmented
      size="sm"
      variant="dark"
      value={value}
      onChange={(range) => onChange(range as TrendRange)}
      options={RANGES.map((range) => ({ value: range, label: range }))}
    />
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