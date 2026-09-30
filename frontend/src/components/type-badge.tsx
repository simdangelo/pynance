import type { TransactionType } from "@/types/api"
import { Badge } from "@/components/ui/badge"

export function TypeBadge({ type }: { type: TransactionType }) {
  return type === "income" ? (
    <Badge variant="secondary" className="bg-positive-soft text-positive">
      Income
    </Badge>
  ) : (
    <Badge variant="secondary" className="bg-destructive-soft text-destructive">
      Expense
    </Badge>
  )
}
