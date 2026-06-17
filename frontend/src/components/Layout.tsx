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
      { to: '/', label: 'Dashboard', hint: 'ڈیش بورڈ (آج کا حساب)', permission: 'dashboard.view', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Sales (فروخت)',
    items: [
      { to: '/pos', label: 'New Sale', hint: 'نئی فروخت / POS', permission: 'sales.manage', icon: ShoppingCart },
      { to: '/sales', label: 'Sales', hint: 'سیلز اور آرڈرز', permission: 'sales.view', icon: ReceiptText },
      { to: '/customers', label: 'Customers', hint: 'کسٹمر (گاہک)', permission: 'customers.view', icon: Users },
      { to: '/payments', label: 'Payments', hint: 'لین دین', permission: 'payments.view', icon: HandCoins },
    ],
  },
  {
    title: 'Production & Stock (مال)',
    items: [
      { to: '/production', label: 'Production', hint: 'روزانہ پروڈکشن', permission: 'production.view', icon: Factory },
      { to: '/inventory', label: 'Finished Goods', hint: 'تیار بلاک اسٹاک', permission: 'inventory.view', icon: Boxes },
      { to: '/materials', label: 'Raw Materials', hint: 'خام مال (سیمنٹ، بجری، ریت)', permission: 'materials.view', icon: Package },
      { to: '/products', label: 'Products / Rates', hint: 'پروڈکٹس اور ریٹ', permission: 'inventory.view', icon: Tag },
    ],
  },
  {
    title: 'Purchases (خریداری)',
    items: [
      { to: '/purchases', label: 'Purchases', hint: 'مال خریدنا', permission: 'purchases.view', icon: ClipboardList },
      { to: '/suppliers', label: 'Suppliers', hint: 'سپلائر', permission: 'suppliers.view', icon: Users },
    ],
  },
  {
    title: 'Delivery (ڈسپیچ)',
    items: [
      { to: '/dispatch', label: 'Dispatch', hint: 'چالان / ڈلیوری', permission: 'dispatch.view', icon: Truck },
      { to: '/transport', label: 'Transport', hint: 'ٹرانسپورٹ (گاڑی کرایہ)', permission: 'transport.view', icon: Car },
      { to: '/drivers', label: 'Drivers', hint: 'ڈرائیور حساب', permission: 'transport.view', icon: UserRound },
      { to: '/vehicles', label: 'Vehicles', hint: 'گاڑیاں', permission: 'transport.view', icon: Car },
    ],
  },
  {
    title: 'Staff (عملہ)',
    items: [
      { to: '/labour', label: 'Labour', hint: 'مزدور (حاضری و مزدوری)', permission: 'labour.view', icon: HardHat },
      { to: '/staff', label: 'Staff & Salary', hint: 'عملہ اور تنخواہ', permission: 'hr.view', icon: UserRound },
    ],
  },
  {
    title: 'Accounts (حساب)',
    items: [
      { to: '/cash-book', label: 'Cash Book', hint: 'روزانہ کیش', permission: 'accounting.view', icon: Wallet },
      { to: '/expenses', label: 'Expenses', hint: 'اخراجات', permission: 'expenses.view', icon: BookText },
      { to: '/trial-balance', label: 'Accounts Summary', hint: 'اکاؤنٹس خلاصہ', permission: 'accounting.view', icon: FileSpreadsheet },
      { to: '/accounts', label: 'Accounts Ledger', hint: 'اکاؤنٹ لیجر', permission: 'accounting.view', icon: BookOpenText },
      { to: '/reports', label: 'Reports', hint: 'رپورٹس (PDF/Excel)', permission: 'reports.view', icon: FileBarChart },
    ],
  },
  {
    title: 'Settings (سیٹنگز)',
    items: [
      { to: '/users', label: 'Users', hint: 'یوزرز اور رولز', permission: 'users.manage', icon: UsersRound },
      { to: '/audit-logs', label: 'Audit Logs', hint: 'ریکارڈ تبدیلیاں', permission: 'audit.view', icon: History },
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
            <div dir="rtl" className="text-[12px]" style={{ color: 'var(--muted)' }}>بلاک فیکٹری مینجمنٹ</div>
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
                          <span className="flex min-w-0 flex-col leading-tight">
                            <span className="font-medium">{item.label}</span>
                            <span
                              dir="rtl"
                              className="text-[13px] leading-snug"
                              style={{ color: isActive ? 'var(--primary-fg)' : 'var(--muted)', opacity: isActive ? 0.9 : 1 }}
                            >
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
