import { NavLink } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeftRight,
  ArrowRightLeft,
  LayoutDashboard,
  Landmark,
  Repeat,
  Settings,
} from "lucide-react"

import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

const NAV_ITEMS = [
  { to: "/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/recurring", label: "Recurring", icon: Repeat },
  { to: "/assets", label: "Assets", icon: Landmark },
  { to: "/transfers", label: "Transfers", icon: ArrowRightLeft },
] as const

const FOOTER_ITEMS = [
  { to: "/categories", label: "Categories", icon: Settings },
] as const

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { data: templates } = useQuery({
    queryKey: ["recurring"],
    queryFn: api.recurringTemplates.list,
  })

  const dueCount = (templates ?? []).filter((t) => t.active && t.due).length

  return (
    <nav className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-0.5 p-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const showBadge = item.to === "/recurring" && dueCount > 0
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
              {showBadge && (
                <Badge
                  variant="secondary"
                  className="ml-auto bg-amber-50 text-amber-700"
                >
                  {dueCount}
                </Badge>
              )}
            </NavLink>
          )
        })}
      </div>
      <div className="border-t border-border p-3">
        {FOOTER_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground/70 hover:bg-accent/50 hover:text-foreground",
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}