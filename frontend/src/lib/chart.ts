const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

export function monthLabel(month: string): string {
  const [year, value] = month.split("-")
  return `${MONTHS[Number(value) - 1]} ${year}`
}

export function formatCompact(value: number): string {
  return Math.abs(value) >= 1000
    ? `${Math.round(value / 1000)}k`
    : String(value)
}
