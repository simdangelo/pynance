import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import { StatLabel } from "@/components/stat-label"

interface StatProps {
  label: string
  value: ReactNode
  meta?: ReactNode
  tone?: "default" | "positive" | "negative" | "attention"
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
  valueClassName?: string
}

const sizeClasses = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
  xl: "text-5xl",
} as const

export function Stat({
  label,
  value,
  meta,
  tone = "default",
  size = "md",
  className,
  valueClassName,
}: StatProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <StatLabel>{label}</StatLabel>
      <span
        className={cn(
          "font-numeric font-medium leading-tight tracking-tight",
          sizeClasses[size],
          tone === "positive" && "text-positive",
          tone === "negative" && "text-destructive",
          tone === "attention" && "text-chart-2",
          valueClassName,
        )}
      >
        {value}
      </span>
      {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
    </div>
  )
}
