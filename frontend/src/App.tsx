import { Route, Routes } from "react-router-dom"
import { Layout } from "@/components/layout"
import Dashboard from "@/pages/dashboard"
import Transactions from "@/pages/transactions"
import Categories from "@/pages/categories"

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/categories" element={<Categories />} />
      </Route>
    </Routes>
  )
}
