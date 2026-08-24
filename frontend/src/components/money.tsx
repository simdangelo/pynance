import { cn } from "@/lib/utils"

const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
})

const signedFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  signDisplay: "exceptZero",
})

interface MoneyProps {
  value: string
  className?: string
  signed?: boolean
}

export function Money({ value, className, signed = false }: MoneyProps) {
  const amount = Number(value)
  if (Number.isNaN(amount)) {
    return <span className={cn("font-numeric tabular-nums", className)}>—</span>
  }
  const fmt = signed ? signedFormatter : formatter
  return (
    <span className={cn("font-numeric tabular-nums", className)}>
      {fmt.format(amount)}
    </span>
  )
}
