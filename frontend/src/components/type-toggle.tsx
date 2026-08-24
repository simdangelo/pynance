import { ArrowDownLeft, ArrowUpRight } from "lucide-react"

import type { TransactionType } from "@/types/api"
import { cn } from "@/lib/utils"

interface TypeToggleProps {
  value: TransactionType
  onChange: (type: TransactionType) => void
}

const itemClass =
  "flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"

export function TypeToggle({ value, onChange }: TypeToggleProps) {
  const income = value === "income"
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
      <button
        type="button"
        onClick={() => onChange("income")}
        className={cn(
          itemClass,
          income
            ? "bg-card text-moss shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <ArrowDownLeft className="size-4" /> Income
      </button>
      <button
        type="button"
        onClick={() => onChange("expense")}
        className={cn(
          itemClass,
          !income
            ? "bg-card text-clay shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <ArrowUpRight className="size-4" /> Expense
      </button>
    </div>
  )
}