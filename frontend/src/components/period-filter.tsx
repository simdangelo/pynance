import { CalendarDays, Check, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { periodLabel, type Period } from "@/lib/period"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface PeriodFilterProps {
  value: Period
  onChange: (value: Period) => void
  years: number[]
}

export function PeriodFilter({ value, onChange, years }: PeriodFilterProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <CalendarDays className="size-4" />
        {periodLabel(value)}
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuItem
          onClick={() => onChange("ytd")}
          className={cn("justify-between", value === "ytd" && "text-selection data-highlighted:text-selection")}
        >
          Year to date
          {value === "ytd" && <Check className="size-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onChange("all")}
          className={cn("justify-between", value === "all" && "text-selection data-highlighted:text-selection")}
        >
          All time
          {value === "all" && <Check className="size-4" />}
        </DropdownMenuItem>
        {years.length > 0 && <DropdownMenuSeparator />}
        <div className="max-h-64 overflow-y-auto">
          {years.map((year) => (
            <DropdownMenuItem
              key={year}
              onClick={() => onChange(year)}
              className={cn("justify-between", value === year && "text-selection data-highlighted:text-selection")}
            >
              {year}
              {value === year && <Check className="size-4" />}
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
