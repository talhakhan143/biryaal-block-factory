import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import { Spinner } from './components/ui'

// Route-based code splitting — each page loads its own chunk on first visit,
// so the initial bundle stays small and the app opens fast.
const Login = lazy(() => import('./pages/Login'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const POS = lazy(() => import('./pages/POS'))
const Sales = lazy(() => import('./pages/Sales'))
const Returns = lazy(() => import('./pages/Returns'))
const Production = lazy(() => import('./pages/Production'))
const Inventory = lazy(() => import('./pages/Inventory'))
const Purchases = lazy(() => import('./pages/Purchases'))
const RawMaterials = lazy(() => import('./pages/RawMaterials'))
const Suppliers = lazy(() => import('./pages/Suppliers'))
const Customers = lazy(() => import('./pages/Customers'))
const Payments = lazy(() => import('./pages/Payments'))
const Expenses = lazy(() => import('./pages/Expenses'))
const CashBook = lazy(() => import('./pages/CashBook'))
const TrialBalance = lazy(() => import('./pages/TrialBalance'))
const Dispatch = lazy(() => import('./pages/Dispatch'))
const Transport = lazy(() => import('./pages/Transport'))
const Drivers = lazy(() => import('./pages/Drivers'))
const Vehicles = lazy(() => import('./pages/Vehicles'))
const Labour = lazy(() => import('./pages/Labour'))
const Staff = lazy(() => import('./pages/Staff'))
const Reports = lazy(() => import('./pages/Reports'))
const Products = lazy(() => import('./pages/Products'))
const Accounts = lazy(() => import('./pages/Accounts'))
const Adjustments = lazy(() => import('./pages/Adjustments'))
const Users = lazy(() => import('./pages/Users'))
const AuditLogs = lazy(() => import('./pages/AuditLogs'))
const ResellerDashboard = lazy(() => import('./pages/ResellerDashboard'))
const ResellerItems = lazy(() => import('./pages/ResellerItems'))
const ResellerSuppliers = lazy(() => import('./pages/ResellerSuppliers'))
const ResellerPurchases = lazy(() => import('./pages/ResellerPurchases'))
const ResellerKiraya = lazy(() => import('./pages/ResellerKiraya'))
const ResellerPOS = lazy(() => import('./pages/ResellerPOS'))
const ResellerSales = lazy(() => import('./pages/ResellerSales'))
const ResellerDispatch = lazy(() => import('./pages/ResellerDispatch'))
const ResellerReturns = lazy(() => import('./pages/ResellerReturns'))
const ResellerPayments = lazy(() => import('./pages/ResellerPayments'))

const Loading = () => <div className="flex h-full items-center justify-center"><Spinner /></div>

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return <Loading />

  if (!user) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/returns" element={<Returns />} />
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
          <Route path="/adjustments" element={<Adjustments />} />
          <Route path="/users" element={<Users />} />
          <Route path="/audit-logs" element={<AuditLogs />} />
          {/* Resellers Point */}
          <Route path="/reseller" element={<ResellerDashboard />} />
          <Route path="/reseller/pos" element={<ResellerPOS />} />
          <Route path="/reseller/sales" element={<ResellerSales />} />
          <Route path="/reseller/payments" element={<ResellerPayments />} />
          <Route path="/reseller/returns" element={<ResellerReturns />} />
          <Route path="/reseller/dispatch" element={<ResellerDispatch />} />
          <Route path="/reseller/items" element={<ResellerItems />} />
          <Route path="/reseller/suppliers" element={<ResellerSuppliers />} />
          <Route path="/reseller/purchases" element={<ResellerPurchases />} />
          <Route path="/reseller/kiraya" element={<ResellerKiraya />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
