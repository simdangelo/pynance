import { NavLink, Outlet } from "react-router-dom"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/page-header"

export default function Overview() {
  return (
    <div className="space-y-6">
      <PageHeader title="Overview" subtitle="Your financial overview." />
      <div className="flex gap-0 border-b border-border">
        <NavLink
          to="net-worth"
          className={({ isActive }) =>
            cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors -mb-px",
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )
          }
        >
          Net worth
        </NavLink>
        <NavLink
          to="cash-flow"
          className={({ isActive }) =>
            cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors -mb-px",
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )
          }
        >
          Cash flow
        </NavLink>
      </div>
      <Outlet />
    </div>
  )
}