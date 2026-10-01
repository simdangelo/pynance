import { NavLink } from "react-router-dom"

import { cn } from "@/lib/utils"

export interface PageTab {
  to: string
  label: string
}

export function PageTabs({ tabs }: { tabs: PageTab[] }) {
  return (
    <div className="flex items-baseline gap-5">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) =>
            cn(
              "relative cursor-pointer text-lg font-medium transition-colors",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )
          }
        >
          {({ isActive }) => (
            <>
              {tab.label}
              <span
                className={cn(
                  "absolute inset-x-0 -bottom-1.5 h-0.5 rounded-full bg-primary transition-opacity",
                  isActive ? "opacity-100" : "opacity-0",
                )}
              />
            </>
          )}
        </NavLink>
      ))}
    </div>
  )
}
