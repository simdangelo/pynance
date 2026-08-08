import { NavLink, Outlet } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/transactions", label: "Transactions" },
  { to: "/categories", label: "Categories" },
]

export function Layout() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-5xl flex-wrap items-center justify-between gap-2 px-4">
          <span className="font-semibold tracking-tight">Pynance</span>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
      <Toaster />
    </div>
  )
}
