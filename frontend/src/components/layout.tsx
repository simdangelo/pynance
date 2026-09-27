import { useEffect, useState } from "react"
import { NavLink, Outlet } from "react-router-dom"
import {
  Euro,
  Menu as MenuIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react"

import { SidebarNav } from "@/components/sidebar-nav"
import { UserMenu } from "@/components/user-menu"
import { Toaster } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const COLLAPSED_STORAGE_KEY = "pynance.sidebar.collapsed"

const iconButtonClass =
  "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"

function Logo({ expanded = true }: { expanded?: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
        <Euro className="size-4" />
      </span>
      <span
        className={cn(
          "font-semibold tracking-tight whitespace-nowrap transition-opacity duration-150",
          expanded ? "opacity-100" : "opacity-0",
        )}
      >
        Pynance
      </span>
    </span>
  )
}

function SidebarIconLink({
  to,
  label,
  icon: Icon,
  onNavigate,
}: {
  to: string
  label: string
  icon: LucideIcon
  onNavigate?: () => void
}) {
  return (
    <NavLink
      to={to}
      title={label}
      aria-label={label}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          iconButtonClass,
          isActive && "bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary",
        )
      }
    >
      <Icon className="size-[18px]" />
    </NavLink>
  )
}

export function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(
    () => window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true",
  )
  const [peeking, setPeeking] = useState(false)

  useEffect(() => {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed))
  }, [collapsed])

  // Hover/focus on the collapsed rail expands it temporarily as an overlay:
  // the main content never moves while peeking.
  const expanded = !collapsed || peeking

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside
        onMouseEnter={() => {
          if (collapsed) setPeeking(true)
        }}
        onMouseLeave={() => setPeeking(false)}
        onFocusCapture={() => {
          if (collapsed) setPeeking(true)
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setPeeking(false)
          }
        }}
        className={cn(
          "fixed top-0 bottom-0 left-0 z-40 hidden flex-col overflow-hidden border-r border-border bg-sidebar transition-[width,box-shadow] duration-200 ease-out md:flex",
          expanded ? "w-60" : "w-16",
          collapsed && peeking && "shadow-[0_12px_32px_rgb(36_31_31_/_0.10)]",
        )}
      >
        {/* Header: fixed height and fixed logo slot in both states, so nothing moves. */}
        <div className="relative flex h-16 shrink-0 items-center px-4">
          <Logo expanded={expanded} />
          <div
            className={cn(
              "absolute right-4 flex items-center gap-0.5 transition-opacity duration-150",
              expanded ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <SidebarIconLink to="/settings" label="Settings" icon={Settings} />
            <button
              type="button"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => {
                setPeeking(false)
                setCollapsed(!collapsed)
              }}
              className={iconButtonClass}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-[18px]" />
              ) : (
                <PanelLeftClose className="size-[18px]" />
              )}
            </button>
          </div>
        </div>

        <SidebarNav expanded={expanded} />

        <div className="shrink-0 border-t border-border p-3">
          <UserMenu collapsed={!expanded} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="flex h-14 items-center justify-between border-b border-border bg-sidebar px-4 md:hidden">
        <Logo />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation"
          onClick={() => setDrawerOpen(true)}
        >
          <MenuIcon className="h-5 w-5" />
        </Button>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute top-0 bottom-0 left-0 flex w-64 flex-col bg-sidebar shadow-lg">
            <div className="flex h-14 items-center justify-between px-4">
              <Logo />
              <div className="flex items-center gap-0.5">
                <SidebarIconLink
                  to="/settings"
                  label="Settings"
                  icon={Settings}
                  onNavigate={() => setDrawerOpen(false)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close navigation"
                  onClick={() => setDrawerOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
            <SidebarNav onNavigate={() => setDrawerOpen(false)} />
            <div className="border-t border-border p-3">
              <UserMenu />
            </div>
          </aside>
        </div>
      )}

      {/* Main content: margin follows only the pinned state, not the peek. */}
      <main
        className={cn(
          "transition-[margin] duration-200 ease-out",
          collapsed ? "md:ml-16" : "md:ml-60",
        )}
      >
        <div className="px-6 py-6 md:px-8">
          <Outlet />
        </div>
      </main>

      <Toaster />
    </div>
  )
}
