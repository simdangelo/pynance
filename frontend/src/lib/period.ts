export type Period = "ytd" | "all" | number

export const ALL_TIME_START = "2000-01-01"

export function todayISO(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}

export function periodRange(period: Period): { start: string; end: string } {
  const now = new Date()
  if (period === "all") return { start: ALL_TIME_START, end: todayISO() }
  if (period === "ytd") return { start: `${now.getFullYear()}-01-01`, end: todayISO() }
  return { start: `${period}-01-01`, end: `${period}-12-31` }
}

export function periodLabel(period: Period): string {
  if (period === "ytd") return "Year to date"
  if (period === "all") return "All time"
  return String(period)
}

const SHORT_MONTHS = [
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

export function dateLabel(date: string): string {
  const [year, month, day] = date.split("-")
  if (!year || !month || !day) return date
  return `${SHORT_MONTHS[Number(month) - 1]} ${day.padStart(2, "0")}, ${year}`
}
