import type { ReactNode } from "react"

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
  tabs?: ReactNode
}

export function PageHeader({ title, subtitle, action, tabs }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-9 min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="truncate text-[13px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {tabs && <div className="border-b border-border">{tabs}</div>}
    </div>
  )
}
