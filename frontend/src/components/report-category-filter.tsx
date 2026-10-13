import { Filter } from "lucide-react"

import type { Category } from "@/types/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface ReportCategoryFilterProps {
  categories: Category[]
  onToggle: (categoryId: number, included: boolean) => void
  onReset: () => void
}

export function ReportCategoryFilter({
  categories,
  onToggle,
  onReset,
}: ReportCategoryFilterProps) {
  const excludedCount = categories.filter((c) => c.exclude_from_reports).length
  const expense = categories.filter((c) => c.transaction_type === "expense")
  const income = categories.filter((c) => c.transaction_type === "income")

  const renderItem = (category: Category) => (
    <DropdownMenuCheckboxItem
      key={category.id}
      checked={!category.exclude_from_reports}
      onCheckedChange={(checked) => onToggle(category.id, checked)}
    >
      {category.name}
    </DropdownMenuCheckboxItem>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" />}
        className={cn(excludedCount > 0 && "bg-muted")}
      >
        <Filter className="size-4" />
        Categories
        {excludedCount > 0 && (
          <span className="rounded-md bg-muted px-1.5 text-xs text-muted-foreground">
            {excludedCount} excluded
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 w-[220px] overflow-y-auto">
        {excludedCount > 0 && (
          <>
            <DropdownMenuItem onClick={onReset}>Reset</DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel>Include in reports</DropdownMenuLabel>
        {expense.length > 0 && <DropdownMenuLabel>Expense</DropdownMenuLabel>}
        {expense.map(renderItem)}
        {income.length > 0 && <DropdownMenuLabel>Income</DropdownMenuLabel>}
        {income.map(renderItem)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
