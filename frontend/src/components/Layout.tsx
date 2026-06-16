import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, ReceiptText, Users, HandCoins, Factory, Boxes,
  Package, Truck, ClipboardList, Car, UserRound, HardHat, Wallet, BookText,
  FileSpreadsheet, FileBarChart, Tag, BookOpenText, UsersRound, History,
  LogOut, Moon, Sun, type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'

interface NavItem {
  to: string
  label: string
  hint: string          // small Roman Urdu explanation
  permission: string
  icon: LucideIcon
}
interface NavGroup {
  title: string
  items: NavItem[]
}

const GROUPS: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', hint: 'Aaj ka hisaab', permission: 'dashboard.view', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Sales (Bikri)',
    items: [
      { to: '/pos', label: 'New Sale', hint: 'Nayi bikri / POS', permission: 'sales.manage', icon: ShoppingCart },
      { to: '/sales', label: 'Sales', hint: 'Bikri record', permission: 'sales.view', icon: ReceiptText },
      { to: '/customers', label: 'Customers', hint: 'Grahak', permission: 'customers.view', icon: Users },
      { to: '/payments', label: 'Payments', hint: 'Len-den', permission: 'payments.view', icon: HandCoins },
    ],
  },
  {
    title: 'Production & Stock (Maal)',
    items: [
      { to: '/production', label: 'Production', hint: 'Block banana', permission: 'production.view', icon: Factory },
      { to: '/inventory', label: 'Finished Goods', hint: 'Tayar maal', permission: 'inventory.view', icon: Boxes },
      { to: '/materials', label: 'Raw Materials', hint: 'Kacha maal', permission: 'materials.view', icon: Package },
      { to: '/products', label: 'Products / Rates', hint: 'Block rate set karo', permission: 'inventory.view', icon: Tag },
    ],
  },
  {
    title: 'Purchases (Kharidari)',
    items: [
      { to: '/purchases', label: 'Purchases', hint: 'Maal khareedna', permission: 'purchases.view', icon: ClipboardList },
      { to: '/suppliers', label: 'Suppliers', hint: 'Maal walay', permission: 'suppliers.view', icon: Users },
    ],
  },
  {
    title: 'Delivery (Dispatch)',
    items: [
      { to: '/dispatch', label: 'Dispatch', hint: 'Challan / delivery', permission: 'dispatch.view', icon: Truck },
      { to: '/transport', label: 'Transport', hint: 'Gaari kiraya', permission: 'transport.view', icon: Car },
      { to: '/drivers', label: 'Drivers', hint: 'Driver hisaab', permission: 'transport.view', icon: UserRound },
      { to: '/vehicles', label: 'Vehicles', hint: 'Gaariyan', permission: 'transport.view', icon: Car },
    ],
  },
  {
    title: 'Staff (Mulazim)',
    items: [
      { to: '/labour', label: 'Labour', hint: 'Dihari mazdoor', permission: 'labour.view', icon: HardHat },
      { to: '/staff', label: 'Staff & Salary', hint: 'Tankha', permission: 'hr.view', icon: UserRound },
    ],
  },
  {
    title: 'Accounts (Hisaab)',
    items: [
      { to: '/cash-book', label: 'Cash Book', hint: 'Rozana cash', permission: 'accounting.view', icon: Wallet },
      { to: '/expenses', label: 'Expenses', hint: 'Kharchay', permission: 'expenses.view', icon: BookText },
      { to: '/trial-balance', label: 'Accounts Summary', hint: 'Trial balance', permission: 'accounting.view', icon: FileSpreadsheet },
      { to: '/accounts', label: 'Accounts Ledger', hint: 'Har account ka hisaab', permission: 'accounting.view', icon: BookOpenText },
      { to: '/reports', label: 'Reports', hint: 'PDF / Excel report', permission: 'reports.view', icon: FileBarChart },
    ],
  },
  {
    title: 'Settings (Admin)',
    items: [
      { to: '/users', label: 'Users', hint: 'Staff logins & roles', permission: 'users.manage', icon: UsersRound },
      { to: '/audit-logs', label: 'Audit Logs', hint: 'Kisne kya badla', permission: 'audit.view', icon: History },
    ],
  },
]

export default function Layout() {
  const { user, logout, can } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()

  return (
    <div className="flex h-full" style={{ background: 'var(--bg)' }}>
      <aside
        className="no-print flex w-64 shrink-0 flex-col border-r"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2 border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg font-black"
            style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}
          >
            B
          </div>
          <div>
            <div className="text-sm font-bold leading-tight" style={{ color: 'var(--text)' }}>Biryaal Block Factory</div>
            <div className="text-[11px]" style={{ color: 'var(--muted)' }}>Cement Hollow Blocks</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {GROUPS.map((group) => {
            const items = group.items.filter((i) => can(i.permission))
            if (items.length === 0) return null
            return (
              <div key={group.title} className="mb-4">
                <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                  {group.title}
                </div>
                {items.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className="mb-0.5 flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition"
                      style={({ isActive }) =>
                        isActive
                          ? { background: 'var(--primary)', color: 'var(--primary-fg)' }
                          : { color: 'var(--text)' }
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon size={17} style={{ opacity: isActive ? 1 : 0.7 }} />
                          <span className="flex flex-col leading-tight">
                            <span className="font-medium">{item.label}</span>
                            <span className="text-[10px]" style={{ color: isActive ? 'var(--primary-fg)' : 'var(--muted)', opacity: isActive ? 0.85 : 1 }}>
                              {item.hint}
                            </span>
                          </span>
                        </>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            )
          })}
        </nav>

        <div className="border-t px-4 py-3 text-center text-[10px] leading-relaxed" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
          Design &amp; Developed by <span style={{ color: 'var(--text)' }}>Talha Khan</span>
          <br />
          WhatsApp: 92-336-8469404
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="no-print flex items-center justify-between border-b px-6 py-3"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="text-sm font-medium" style={{ color: 'var(--muted)' }}>{user?.roles.join(', ')}</div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggle}
              title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
              className="flex h-9 w-9 items-center justify-center rounded-lg border transition hover:opacity-80"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{user?.name}</span>
            <button
              onClick={async () => {
                await logout()
                navigate('/login')
              }}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition hover:opacity-80"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              <LogOut size={15} /> Logout
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
