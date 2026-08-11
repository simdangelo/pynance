import type { TransactionType } from "@/types/api"
import { Badge } from "@/components/ui/badge"

export function TypeBadge({ type }: { type: TransactionType }) {
  return type === "income" ? (
    <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
      Income
    </Badge>
  ) : (
    <Badge variant="secondary" className="bg-rose-50 text-rose-700">
      Expense
    </Badge>
  )
}
