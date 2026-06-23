import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, ReceiptText, Users, HandCoins, Factory, Boxes,
  Package, Truck, ClipboardList, Car, UserRound, HardHat, Wallet, BookText,
  FileSpreadsheet, FileBarChart, Tag, BookOpenText, UsersRound, History,
  Undo2, LogOut, Languages, Menu, X, type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useLang } from '../lib/lang'

interface NavItem {
  to: string
  en: string
  ur: string
  permission: string
  icon: LucideIcon
}
interface NavGroup {
  en: string
  ur: string
  items: NavItem[]
}

const GROUPS: NavGroup[] = [
  {
    en: 'Overview', ur: 'مرکزی',
    items: [
      { to: '/', en: 'Dashboard', ur: 'ڈیش بورڈ', permission: 'dashboard.view', icon: LayoutDashboard },
    ],
  },
  {
    en: 'Sales', ur: 'فروخت',
    items: [
      { to: '/pos', en: 'New Sale', ur: 'نئی فروخت', permission: 'sales.manage', icon: ShoppingCart },
      { to: '/sales', en: 'Sales', ur: 'سیلز اور آرڈرز', permission: 'sales.view', icon: ReceiptText },
      { to: '/returns', en: 'Block Return', ur: 'بلاک واپسی', permission: 'sales.view', icon: Undo2 },
      { to: '/customers', en: 'Customers', ur: 'کسٹمر', permission: 'customers.view', icon: Users },
      { to: '/payments', en: 'Payments', ur: 'لین دین', permission: 'payments.view', icon: HandCoins },
    ],
  },
  {
    en: 'Production & Stock', ur: 'پروڈکشن اور اسٹاک',
    items: [
      { to: '/production', en: 'Production', ur: 'روزانہ پروڈکشن', permission: 'production.view', icon: Factory },
      { to: '/inventory', en: 'Finished Goods', ur: 'تیار بلاک اسٹاک', permission: 'inventory.view', icon: Boxes },
      { to: '/materials', en: 'Raw Materials', ur: 'خام مال', permission: 'materials.view', icon: Package },
      { to: '/products', en: 'Products / Rates', ur: 'پروڈکٹس اور ریٹ', permission: 'inventory.view', icon: Tag },
    ],
  },
  {
    en: 'Purchases', ur: 'خریداری',
    items: [
      { to: '/purchases', en: 'Purchases', ur: 'مال خریدنا', permission: 'purchases.view', icon: ClipboardList },
      { to: '/suppliers', en: 'Suppliers', ur: 'سپلائر', permission: 'suppliers.view', icon: Users },
    ],
  },
  {
    en: 'Delivery', ur: 'ڈسپیچ',
    items: [
      { to: '/dispatch', en: 'Dispatch', ur: 'چالان / ڈلیوری', permission: 'dispatch.view', icon: Truck },
      { to: '/transport', en: 'Transport', ur: 'ٹرانسپورٹ', permission: 'transport.view', icon: Car },
      { to: '/drivers', en: 'Drivers', ur: 'ڈرائیور', permission: 'transport.view', icon: UserRound },
    ],
  },
  {
    en: 'Staff', ur: 'عملہ',
    items: [
      { to: '/labour', en: 'Labour', ur: 'مزدور (حاضری و مزدوری)', permission: 'labour.view', icon: HardHat },
      { to: '/staff', en: 'Staff & Salary', ur: 'عملہ اور تنخواہ', permission: 'hr.view', icon: UserRound },
    ],
  },
  {
    en: 'Accounts', ur: 'حساب کتاب',
    items: [
      { to: '/cash-book', en: 'Cash Book', ur: 'روزانہ کیش', permission: 'accounting.view', icon: Wallet },
      { to: '/expenses', en: 'Expenses', ur: 'اخراجات', permission: 'expenses.view', icon: BookText },
      { to: '/adjustments', en: 'Adjustments', ur: 'ایڈجسٹمنٹ', permission: 'accounting.view', icon: Undo2 },
      { to: '/trial-balance', en: 'Accounts Summary', ur: 'اکاؤنٹس خلاصہ', permission: 'accounting.view', icon: FileSpreadsheet },
      { to: '/accounts', en: 'Accounts Ledger', ur: 'اکاؤنٹ لیجر', permission: 'accounting.view', icon: BookOpenText },
      { to: '/reports', en: 'Reports', ur: 'رپورٹس', permission: 'reports.view', icon: FileBarChart },
    ],
  },
  {
    en: 'Settings', ur: 'سیٹنگز',
    items: [
      { to: '/users', en: 'Users', ur: 'یوزرز اور رولز', permission: 'users.manage', icon: UsersRound },
      { to: '/audit-logs', en: 'Audit Logs', ur: 'ریکارڈ تبدیلیاں', permission: 'audit.view', icon: History },
    ],
  },
]

export default function Layout() {
  const { user, logout, can } = useAuth()
  const { lang, toggle: toggleLang } = useLang()
  const navigate = useNavigate()
  const ur = lang === 'ur'
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="flex h-full" style={{ background: 'var(--bg)' }}>
      {/* Mobile backdrop — tap to close the drawer */}
      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside
        className={`no-print fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r transition-transform duration-200 lg:static lg:translate-x-0 ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          background: 'linear-gradient(180deg, var(--sidebar-bg-2) 0%, var(--sidebar-bg) 100%)',
          borderColor: 'var(--sidebar-border)',
          color: 'var(--sidebar-text)',
        }}
      >
        <div className="relative px-4 py-5" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            className="absolute right-3 top-3 rounded-lg p-1.5 lg:hidden"
            style={{ background: 'var(--sidebar-hover)', color: 'var(--sidebar-text)' }}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
          <div className="flex items-center justify-center rounded-2xl bg-white px-3 py-3 shadow-lg shadow-black/20">
            <img src="/logo.png" alt="Barval Block Factory" className="block h-24 w-auto max-w-full object-contain" />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {GROUPS.map((group) => {
            const items = group.items.filter((i) => can(i.permission))
            if (items.length === 0) return null
            return (
              <div key={group.en} className="mb-5">
                <div
                  dir={ur ? 'rtl' : 'ltr'}
                  className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--sidebar-muted)' }}
                >
                  {ur ? group.ur : group.en}
                </div>
                {items.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      dir={ur ? 'rtl' : 'ltr'}
                      onClick={() => setNavOpen(false)}
                      className="bf-nav-item mb-0.5 flex items-center gap-3 rounded-lg px-2.5 py-2"
                      style={({ isActive }) =>
                        isActive
                          ? {
                              background: 'var(--sidebar-active-bg)',
                              color: 'var(--sidebar-active-fg)',
                              boxShadow: `inset 3px 0 0 0 var(--sidebar-accent)`,
                            }
                          : { color: 'var(--sidebar-text)' }
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon size={18} style={{ opacity: isActive ? 1 : 0.65, flexShrink: 0, color: isActive ? 'var(--sidebar-accent)' : undefined }} />
                          <span className={ur ? 'text-[16px] leading-relaxed' : 'text-sm font-medium'}>
                            {ur ? item.ur : item.en}
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

        <div className="px-4 py-3 text-center text-[10px] leading-relaxed" style={{ borderTop: '1px solid var(--sidebar-border)', color: 'var(--sidebar-muted)' }}>
          Design &amp; Developed by <span style={{ color: 'var(--sidebar-text)' }}>Talha Khan</span>
          <br />
          WhatsApp: 92-336-8469404
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="no-print flex items-center justify-between gap-2 border-b px-4 py-3 sm:px-6"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="rounded-lg border p-2 lg:hidden"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
            <div className="truncate text-sm font-medium" style={{ color: 'var(--muted)' }}>{user?.roles.join(', ')}</div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={toggleLang}
              title="Language"
              className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition hover:opacity-80"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              <Languages size={16} /> {ur ? 'English' : 'اردو'}
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
              <LogOut size={15} /> {ur ? 'لاگ آؤٹ' : 'Logout'}
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
