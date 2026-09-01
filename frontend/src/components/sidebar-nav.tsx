import { NavLink } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeftRight,
  ArrowRightLeft,
  FileUp,
  LayoutDashboard,
  Landmark,
  LogOut,
  Repeat,
  Settings,
} from "lucide-react"

import { useAuth } from "@/lib/auth"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const NAV_ITEMS = [
  { to: "/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/recurring", label: "Recurring", icon: Repeat },
  { to: "/assets", label: "Assets", icon: Landmark },
  { to: "/transfers", label: "Transfers", icon: ArrowRightLeft },
] as const

const FOOTER_ITEMS = [
  { to: "/import", label: "Import", icon: FileUp },
  { to: "/categories", label: "Categories", icon: Settings },
] as const

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { data: templates } = useQuery({
    queryKey: ["recurring"],
    queryFn: api.recurringTemplates.list,
  })
  const { user, logout } = useAuth()

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
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
              {showBadge && (
                <Badge
                  variant="secondary"
                  className="ml-auto bg-ochre/10 text-ochre"
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
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground/70 hover:bg-secondary/50 hover:text-foreground",
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2 px-3">
            <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Log out"
              onClick={() => void logout()}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  )
}