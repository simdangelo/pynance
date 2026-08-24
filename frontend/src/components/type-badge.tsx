import type { TransactionType } from "@/types/api"
import { Badge } from "@/components/ui/badge"

export function TypeBadge({ type }: { type: TransactionType }) {
  return type === "income" ? (
    <Badge variant="secondary" className="bg-moss/10 text-moss">
      Income
    </Badge>
  ) : (
    <Badge variant="secondary" className="bg-clay/10 text-clay">
      Expense
    </Badge>
  )
}
