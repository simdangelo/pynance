import { cn } from "@/lib/utils"

export interface PageTab {
  value: string
  label: string
}

interface PageTabsProps {
  tabs: PageTab[]
  value: string
  onChange: (value: string) => void
}

export function PageTabs({ tabs, value, onChange }: PageTabsProps) {
  return (
    <div className="flex items-baseline gap-5">
      {tabs.map((tab) => {
        const active = value === tab.value
        return (
          <button
            key={tab.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "relative cursor-pointer text-lg font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            <span
              className={cn(
                "absolute inset-x-0 -bottom-1.5 h-0.5 rounded-full bg-primary transition-opacity",
                active ? "opacity-100" : "opacity-0",
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
