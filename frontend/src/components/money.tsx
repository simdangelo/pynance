import { cn } from "@/lib/utils"

const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
})

interface MoneyProps {
  value: string
  className?: string
}

export function Money({ value, className }: MoneyProps) {
  const amount = Number(value)
  if (Number.isNaN(amount)) {
    return <span className={cn("font-numeric tabular-nums", className)}>—</span>
  }
  const sign = amount > 0 ? "+" : ""
  return (
    <span className={cn("font-numeric tabular-nums", className)}>
      {sign}
      {formatter.format(amount)}
    </span>
  )
}
