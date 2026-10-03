import { NavLink } from "react-router-dom"

import { cn } from "@/lib/utils"

export interface PageTab {
  to: string
  label: string
}

export function PageTabs({ tabs }: { tabs: PageTab[] }) {
  return (
    <div className="flex items-center gap-5">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) =>
            cn(
              "-mb-px inline-flex h-9 cursor-pointer items-center border-b-2 px-0.5 text-[13px] font-medium transition-colors",
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  )
}
