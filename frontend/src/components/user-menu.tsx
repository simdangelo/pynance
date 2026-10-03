import { Menu } from "@base-ui/react/menu"
import { ChevronUp, LogOut } from "lucide-react"

import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"

interface UserMenuProps {
  collapsed?: boolean
}

export function UserMenu({ collapsed = false }: UserMenuProps) {
  const { user, logout } = useAuth()

  if (!user) return null

  const initial = user.email.charAt(0).toUpperCase()

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={collapsed ? "Account menu" : undefined}
        className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-muted data-[popup-open]:bg-muted"
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-foreground text-[11px] font-semibold text-background">
          {initial}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px] text-muted-foreground transition-opacity duration-150",
            collapsed ? "opacity-0" : "opacity-100",
          )}
        >
          {user.email}
        </span>
        <ChevronUp
          className={cn(
            "size-4 shrink-0 text-faint-foreground transition-opacity duration-150",
            collapsed ? "opacity-0" : "opacity-100",
          )}
        />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="top" align="start" sideOffset={8} className="z-50">
          <Menu.Popup className="min-w-[190px] rounded-lg border border-border bg-popover p-1 shadow-[0_10px_30px_rgb(0_0_0_/_0.08)] outline-none">
            <Menu.Item
              onClick={() => void logout()}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-destructive outline-hidden select-none data-[highlighted]:bg-destructive-soft"
            >
              <LogOut className="size-4" />
              Sign out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
