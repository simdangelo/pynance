import { Navigate, Route, Routes } from "react-router-dom"
import { Layout } from "@/components/layout"
import { useAuth } from "@/lib/auth"
import Login from "@/pages/login"
import Dashboard from "@/pages/dashboard"
import Transactions from "@/pages/transactions"
import Recurring from "@/pages/recurring"
import Assets from "@/pages/assets"
import Categories from "@/pages/categories"
import ImportData from "@/pages/import"
import Reports from "@/pages/reports"
import Settings from "@/pages/settings"

function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/overview" element={<Dashboard />} />
        <Route path="/overview/net-worth" element={<Navigate to="/overview" replace />} />
        <Route path="/overview/cash-flow" element={<Navigate to="/overview" replace />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/recurring" element={<Recurring />} />
        <Route path="/assets/*" element={<Assets />} />
        <Route path="/reports/*" element={<Reports />} />
        <Route path="/import" element={<ImportData />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/transfers" element={<Navigate to="/assets/transfers" replace />} />
        <Route path="/account" element={<Navigate to="/settings" replace />} />
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
