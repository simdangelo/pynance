import { useState } from "react"
import { Outlet } from "react-router-dom"
import { Euro, Menu, X } from "lucide-react"

import { SidebarNav } from "@/components/sidebar-nav"
import { Toaster } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background">
        <Euro className="size-4" />
      </span>
      <span className="font-semibold tracking-tight">Pynance</span>
    </span>
  )
}

export function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed top-0 bottom-0 left-0 z-30 hidden w-56 border-r border-border bg-background md:flex md:flex-col">
        <div className="flex h-16 items-center px-5">
          <Logo />
        </div>
        <SidebarNav />
      </aside>

      {/* Mobile top bar */}
      <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4 md:hidden">
        <Logo />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className={cn(
              "absolute top-0 bottom-0 left-0 w-64 bg-background shadow-lg",
            )}
          >
            <div className="flex h-14 items-center justify-between px-4">
              <Logo />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close navigation"
                onClick={() => setDrawerOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <SidebarNav onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="md:ml-56">
        <div className="px-6 py-6 md:px-8">
          <Outlet />
        </div>
      </main>
      <Toaster />
    </div>
  )
}
