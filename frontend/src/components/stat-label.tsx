import type { ReactNode } from "react"

interface StatLabelProps {
  children: ReactNode
}

export function StatLabel({ children }: StatLabelProps) {
  return (
    <span className="text-[13px] font-medium text-muted-foreground">
      {children}
    </span>
  )
}
