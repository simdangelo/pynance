import type { ReactNode } from "react"

interface StatLabelProps {
  children: ReactNode
}

export function StatLabel({ children }: StatLabelProps) {
  return (
    <span className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground/60 uppercase">
      {children}
    </span>
  )
}
