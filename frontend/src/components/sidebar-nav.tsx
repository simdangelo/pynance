import { NavLink } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  ChartColumn,
  FileUp,
  Landmark,
  LayoutDashboard,
  Receipt,
  Repeat,
  Tags,
  type LucideIcon,
} from "lucide-react"

import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

const MAIN_ITEMS: NavItem[] = [
  { to: "/overview", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: Receipt },
  { to: "/assets", label: "Assets", icon: Landmark },
  { to: "/recurring", label: "Recurring", icon: Repeat },
  { to: "/reports", label: "Reports", icon: ChartColumn },
]

const MANAGE_ITEMS: NavItem[] = [
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/import", label: "Import", icon: FileUp },
]

interface SidebarNavProps {
  expanded?: boolean
  onNavigate?: () => void
}

/**
 * Renders based on `expanded` only through opacity, never through spacing:
 * item height, padding and icon slot are identical in both states, so icons
 * keep exactly the same position while the sidebar animates its width.
 */
function SidebarLink({
  item,
  expanded,
  onNavigate,
  count,
}: {
  item: NavItem
  expanded: boolean
  onNavigate?: () => void
  count?: number
}) {
  const Icon = item.icon
  const showCount = count !== undefined && count > 0

  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      title={expanded ? undefined : item.label}
      className={({ isActive }) =>
        cn(
          "relative flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors",
          isActive
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )
      }
    >
      <Icon className="size-[18px] shrink-0" />
      <span
        className={cn(
          "truncate transition-opacity duration-150",
          expanded ? "opacity-100" : "opacity-0",
        )}
      >
        {item.label}
      </span>
      {showCount && (
        <>
          <Badge
            className={cn(
              "ml-auto bg-destructive-soft text-destructive transition-opacity duration-150",
              expanded ? "opacity-100" : "opacity-0",
            )}
          >
            {count}
          </Badge>
          <span
            className={cn(
              "absolute top-1.5 right-1.5 size-1.5 rounded-full bg-destructive transition-opacity duration-150",
              expanded ? "opacity-0" : "opacity-100",
            )}
          />
        </>
      )}
    </NavLink>
  )
}

export function SidebarNav({ expanded = true, onNavigate }: SidebarNavProps) {
  const { data: templates } = useQuery({
    queryKey: ["recurring"],
    queryFn: api.recurringTemplates.list,
  })

  const dueCount = (templates ?? []).filter((t) => t.active && t.due).length

  return (
    <nav className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto p-3">
      <div className="flex w-full flex-col gap-0.5">
        {MAIN_ITEMS.map((item) => (
          <SidebarLink
            key={item.to}
            item={item}
            expanded={expanded}
            onNavigate={onNavigate}
            count={item.to === "/recurring" ? dueCount : undefined}
          />
        ))}
      </div>

      <div className="mt-4 w-full">
        <span
          className={cn(
            "block px-3 pb-1.5 text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap text-faint-foreground uppercase transition-opacity duration-150",
            expanded ? "opacity-100" : "opacity-0",
          )}
        >
          Manage
        </span>
        <div className="flex w-full flex-col gap-0.5">
          {MANAGE_ITEMS.map((item) => (
            <SidebarLink
              key={item.to}
              item={item}
              expanded={expanded}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>
    </nav>
  )
}
