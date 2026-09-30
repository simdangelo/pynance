import type { ReactNode } from "react"

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
  tabs?: ReactNode
}

export function PageHeader({ title, subtitle, action, tabs }: PageHeaderProps) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-4">
      <div className="flex min-w-0 items-baseline gap-10">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="truncate text-[13px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {tabs}
      </div>
      {action}
    </div>
  )
}
