import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import { Spinner } from './components/ui'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import POS from './pages/POS'
import Sales from './pages/Sales'
import Production from './pages/Production'
import Inventory from './pages/Inventory'
import Purchases from './pages/Purchases'
import RawMaterials from './pages/RawMaterials'
import Suppliers from './pages/Suppliers'
import Customers from './pages/Customers'
import Payments from './pages/Payments'
import Expenses from './pages/Expenses'
import CashBook from './pages/CashBook'
import TrialBalance from './pages/TrialBalance'
import Dispatch from './pages/Dispatch'
import Transport from './pages/Transport'
import Drivers from './pages/Drivers'
import Vehicles from './pages/Vehicles'
import Labour from './pages/Labour'
import Staff from './pages/Staff'
import Reports from './pages/Reports'
import Products from './pages/Products'
import Accounts from './pages/Accounts'
import Users from './pages/Users'
import AuditLogs from './pages/AuditLogs'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return <div className="flex h-full items-center justify-center"><Spinner /></div>

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/pos" element={<POS />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/production" element={<Production />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/dispatch" element={<Dispatch />} />
        <Route path="/transport" element={<Transport />} />
        <Route path="/drivers" element={<Drivers />} />
        <Route path="/vehicles" element={<Vehicles />} />
        <Route path="/labour" element={<Labour />} />
        <Route path="/staff" element={<Staff />} />
        <Route path="/purchases" element={<Purchases />} />
        <Route path="/materials" element={<RawMaterials />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/cash-book" element={<CashBook />} />
        <Route path="/trial-balance" element={<TrialBalance />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/products" element={<Products />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/users" element={<Users />} />
        <Route path="/audit-logs" element={<AuditLogs />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
