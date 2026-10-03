import { Check, Filter } from "lucide-react"

import type { Category } from "@/types/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface CategoryFilterProps {
  categories: Category[]
  value: number | "all"
  onChange: (value: number | "all") => void
}

export function CategoryFilter({ categories, value, onChange }: CategoryFilterProps) {
  const selected = value === "all" ? null : categories.find((c) => c.id === value)
  const expense = categories.filter((c) => c.transaction_type === "expense")
  const income = categories.filter((c) => c.transaction_type === "income")

  const renderItem = (category: Category) => (
    <DropdownMenuItem
      key={category.id}
      onClick={() => onChange(category.id)}
      className={cn("justify-between", value === category.id && "text-selection data-highlighted:text-selection")}
    >
      {category.name}
      {value === category.id && <Check className="size-4" />}
    </DropdownMenuItem>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" />}
        className={cn(selected && "bg-muted")}
      >
        <Filter className="size-4" />
        {selected?.name ?? "Filter"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-[200px] overflow-y-auto">
        <DropdownMenuItem
          onClick={() => onChange("all")}
          className={cn("justify-between", value === "all" && "text-selection data-highlighted:text-selection")}
        >
          All categories
          {value === "all" && <Check className="size-4" />}
        </DropdownMenuItem>
        {expense.length > 0 && <DropdownMenuSeparator />}
        {expense.length > 0 && <DropdownMenuLabel>Expense</DropdownMenuLabel>}
        {expense.map(renderItem)}
        {income.length > 0 && <DropdownMenuSeparator />}
        {income.length > 0 && <DropdownMenuLabel>Income</DropdownMenuLabel>}
        {income.map(renderItem)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
