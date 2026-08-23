import { Route, Routes } from "react-router-dom"
import { Layout } from "@/components/layout"
import Dashboard from "@/pages/dashboard"
import Transactions from "@/pages/transactions"
import Transfers from "@/pages/transfers"
import Recurring from "@/pages/recurring"
import Assets from "@/pages/assets"
import Categories from "@/pages/categories"

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/transfers" element={<Transfers />} />
        <Route path="/recurring" element={<Recurring />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/categories" element={<Categories />} />
      </Route>
    </Routes>
  )
}
