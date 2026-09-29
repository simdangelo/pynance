import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface SegmentedOption {
  value: string
  label: ReactNode
}

interface SegmentedProps {
  options: SegmentedOption[]
  value: string
  onChange?: (value: string) => void
  size?: "sm" | "md"
  className?: string
}

export function Segmented({
  options,
  value,
  onChange,
  size = "sm",
  className,
}: SegmentedProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-secondary p-1",
        size === "md" && "gap-1.5 rounded-xl p-1.5",
        className,
      )}
    >
      {options.map((option) => {
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              onChange?.(option.value)
            }}
            className={cn(
              "font-medium cursor-pointer whitespace-nowrap text-muted-foreground transition-colors",
              !active && "hover:text-foreground",
              size === "sm"
                ? "rounded-full px-3 py-1 text-[13px]"
                : "rounded-md px-4 py-1.5 text-sm",
              active && "bg-card text-foreground shadow-sm ring-1 ring-border",
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}