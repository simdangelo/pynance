import { Navigate, Route, Routes } from "react-router-dom"
import { Layout } from "@/components/layout"
import { useAuth } from "@/lib/auth"
import Login from "@/pages/login"
import Overview from "@/pages/dashboard"
import OverviewNetWorth from "@/pages/overview-net-worth"
import OverviewCashFlow from "@/pages/overview-cash-flow"
import Transactions from "@/pages/transactions"
import Recurring from "@/pages/recurring"
import Assets from "@/pages/assets"
import Transfers from "@/pages/transfers"
import Categories from "@/pages/categories"

function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/overview" element={<Overview />}>
          <Route index element={<Navigate to="net-worth" replace />} />
          <Route path="net-worth" element={<OverviewNetWorth />} />
          <Route path="cash-flow" element={<OverviewCashFlow />} />
        </Route>
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/recurring" element={<Recurring />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/transfers" element={<Transfers />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  return <AppRoutes />
}