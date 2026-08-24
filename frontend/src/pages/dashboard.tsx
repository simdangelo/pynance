import { Outlet, useLocation } from "react-router-dom"

import { Segmented } from "@/components/segmented"

const TABS = [
  { value: "net-worth", label: "Net worth", href: "net-worth" },
  { value: "cash-flow", label: "Cash flow", href: "cash-flow" },
]

export default function Overview() {
  const location = useLocation()
  const active = location.pathname.endsWith("cash-flow") ? "cash-flow" : "net-worth"

  return (
    <div className="space-y-5">
      <Segmented size="md" value={active} options={TABS} />
      <Outlet />
    </div>
  )
}