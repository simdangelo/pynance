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
  sm: "text-[18px]",
  md: "text-[26px]",
  lg: "text-[28px]",
  xl: "text-[32px]",
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
          "font-numeric font-[650] leading-tight tracking-tight",
          sizeClasses[size],
          tone === "positive" && "text-positive",
          tone === "negative" && "text-destructive",
          tone === "attention" && "text-chart-5",
          valueClassName,
        )}
      >
        {value}
      </span>
      {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
    </div>
  )
}
