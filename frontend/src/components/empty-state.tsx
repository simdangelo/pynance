import type { ReactNode } from "react"
import { Inbox, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  subtitle,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-input bg-background px-5 py-10 text-center",
        className,
      )}
    >
      <Icon className="size-5 text-faint-foreground" />
      <div className="space-y-0.5">
        <p className="text-[13.5px] font-semibold">{title}</p>
        {subtitle && (
          <p className="mx-auto max-w-sm text-[13px] text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
