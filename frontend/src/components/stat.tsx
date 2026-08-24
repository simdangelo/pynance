import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface StatProps {
  label: string
  value: ReactNode
  meta?: ReactNode
  tone?: "default" | "positive" | "negative" | "attention"
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
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
}: StatProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground/60 uppercase">
        {label}
      </span>
      <span
        className={cn(
          "font-numeric font-medium leading-tight tracking-tight",
          sizeClasses[size],
          tone === "positive" && "text-moss",
          tone === "negative" && "text-clay",
          tone === "attention" && "text-ochre",
        )}
      >
        {value}
      </span>
      {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
    </div>
  )
}
