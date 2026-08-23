import { useState } from "react"
import { Outlet } from "react-router-dom"
import { Menu, X } from "lucide-react"

import { SidebarNav } from "@/components/sidebar-nav"
import { Toaster } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 z-30 hidden w-60 border-r border-border bg-background md:flex md:flex-col">
        <div className="flex h-14 items-center px-4">
          <span className="font-semibold tracking-tight">Pynance</span>
        </div>
        <SidebarNav />
      </aside>

      {/* Mobile top bar */}
      <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4 md:hidden">
        <span className="font-semibold tracking-tight">Pynance</span>
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
              "absolute left-0 top-0 bottom-0 w-64 bg-background shadow-lg",
            )}
          >
            <div className="flex h-14 items-center justify-between px-4">
              <span className="font-semibold tracking-tight">Pynance</span>
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
      <main className="md:ml-60">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Outlet />
        </div>
      </main>
      <Toaster />
    </div>
  )
}