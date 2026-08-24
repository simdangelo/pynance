import type { ReactNode } from "react"
import { useNavigate } from "react-router-dom"

import { cn } from "@/lib/utils"

interface SegmentedOption {
  value: string
  label: ReactNode
  href?: string
}

interface SegmentedProps {
  options: SegmentedOption[]
  value: string
  onChange?: (value: string) => void
  size?: "sm" | "md"
  variant?: "default" | "dark"
  className?: string
}

export function Segmented({
  options,
  value,
  onChange,
  size = "sm",
  variant = "default",
  className,
}: SegmentedProps) {
  const navigate = useNavigate()

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
            onClick={() => {
              if (option.href) {
                navigate(option.href)
              }
              onChange?.(option.value)
            }}
            className={cn(
              "font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
              size === "sm"
                ? "rounded-full px-3 py-1 font-numeric text-xs"
                : "rounded-md px-4 py-1.5 text-sm",
              active &&
                (variant === "dark"
                  ? "bg-foreground text-background"
                  : "bg-card text-foreground shadow-sm"),
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}