import { CalendarDays, Check, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

interface MonthFilterProps {
  year: number
  month: number
  years: number[]
  onChange: (year: number, month: number) => void
}

export function MonthFilter({ year, month, years, onChange }: MonthFilterProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <CalendarDays className="size-4" />
        {MONTHS[month - 1]} {year}
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[200px]">
        <div className="p-1">
          <Select
            value={String(year)}
            onValueChange={(value) => {
              if (!value) return
              onChange(Number(value), month)
            }}
          >
            <SelectTrigger className="w-full text-selection">
              <SelectValue>{year}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {years.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-64 overflow-y-auto">
          {MONTHS.map((name, index) => (
            <DropdownMenuItem
              key={name}
              onClick={() => onChange(year, index + 1)}
              className={cn("justify-between", index + 1 === month && "text-selection data-highlighted:text-selection")}
            >
              {name}
              {index + 1 === month && <Check className="size-4" />}
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
