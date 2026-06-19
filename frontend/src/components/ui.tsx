import { createContext, useCallback, useContext, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, ChevronsUpDown, Search, X, type LucideIcon } from 'lucide-react'

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'secondary' }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed'
  const styles: Record<string, string> = {
    primary: 'text-[var(--primary-fg)] hover:brightness-110',
    secondary: 'text-[var(--secondary-fg)] hover:brightness-110',
    ghost: 'border text-[var(--text)] hover:bg-[var(--surface-hover)]',
    danger: 'text-white hover:brightness-110',
  }
  const bg: Record<string, string> = {
    primary: 'var(--primary)',
    secondary: 'var(--secondary)',
    ghost: 'transparent',
    danger: 'var(--red)',
  }
  const style = variant === 'ghost'
    ? { borderColor: 'var(--border)' }
    : { backgroundColor: bg[variant] }
  return <button className={`${base} ${styles[variant]} ${className}`} style={style} {...props} />
}

export function Card({
  children,
  className = '',
  hover = false,
  accent,
  onClick,
}: {
  children: ReactNode
  className?: string
  hover?: boolean
  accent?: 'primary' | 'green' | 'red' | 'amber'
  onClick?: () => void
}) {
  const accentColor = accent
    ? { primary: 'var(--primary)', green: 'var(--green)', red: 'var(--red)', amber: 'var(--amber)' }[accent]
    : undefined
  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl border p-5 shadow-sm ${hover || onClick ? 'bf-lift cursor-pointer' : ''} ${className}`}
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {accentColor && (
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: accentColor }} aria-hidden />
      )}
      {children}
    </div>
  )
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }}>{label}</span>
      {children}
    </label>
  )
}

const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2'
const inputStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)', '--tw-ring-color': 'var(--ring)' } as React.CSSProperties

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputCls} ${className}`} style={inputStyle} {...props} />
}

// Group the integer part with thousands commas, keep decimals as typed.
function groupMoney(raw: string): string {
  if (raw === '') return ''
  const neg = raw.startsWith('-') ? '-' : ''
  const clean = raw.replace('-', '')
  const [int, dec] = clean.split('.')
  const grouped = (int || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec !== undefined ? `${neg}${grouped}.${dec}` : `${neg}${grouped}`
}

/**
 * Money input showing comma grouping while typing (e.g. 1,00,000 -> 100,000),
 * but onChange returns the raw numeric string (no commas) for the form state.
 */
export function MoneyInput({
  value,
  onChange,
  className = '',
  ...props
}: { value: string; onChange: (raw: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  return (
    <input
      inputMode="decimal"
      className={`${inputCls} ${className}`}
      style={inputStyle}
      value={groupMoney(value)}
      onChange={(e) => {
        // keep only digits, one dot, optional leading minus
        let raw = e.target.value.replace(/,/g, '').replace(/[^\d.-]/g, '')
        const firstDot = raw.indexOf('.')
        if (firstDot !== -1) {
          raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '')
        }
        onChange(raw)
      }}
      {...props}
    />
  )
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${inputCls} ${className}`} style={inputStyle} {...props}>
      {children}
    </select>
  )
}

export function Badge({ children, color = 'slate' }: { children: ReactNode; color?: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    slate: { bg: 'var(--surface-hover)', fg: 'var(--muted)' },
    green: { bg: 'color-mix(in srgb, var(--green) 18%, transparent)', fg: 'var(--green)' },
    red: { bg: 'color-mix(in srgb, var(--red) 18%, transparent)', fg: 'var(--red)' },
    amber: { bg: 'color-mix(in srgb, var(--amber) 20%, transparent)', fg: 'var(--amber)' },
    blue: { bg: 'color-mix(in srgb, var(--primary) 20%, transparent)', fg: 'var(--primary)' },
  }
  const c = map[color] ?? map.slate
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: c.bg, color: c.fg }}>
      {children}
    </span>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{title}</h1>
        {subtitle && <p className="text-sm" style={{ color: 'var(--muted)' }}>{subtitle}</p>}
      </div>
      <div className="flex flex-wrap justify-end gap-2">{actions}</div>
    </div>
  )
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide" style={{ background: 'var(--surface-2)', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
            {head.map((h, i) => (
              <th key={i} className="px-4 py-3 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody style={{ color: 'var(--text)' }}>{children}</tbody>
      </table>
    </div>
  )
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="bf-fade fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`bf-pop w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-2xl border shadow-2xl`}
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--muted)' }}
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  )
}

export function Spinner() {
  return <div className="p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>Loading…</div>
}

/** Prev/next pager for list pages. Hidden when only one page. */
export function Pagination({ meta, page, onPage }: { meta?: { current_page: number; last_page: number; total: number }; page: number; onPage: (p: number) => void }) {
  if (!meta || meta.total === 0) return null
  return (
    <div className="mt-3 flex items-center justify-between text-sm" style={{ color: 'var(--muted)' }}>
      <span>Total {meta.total}</span>
      {meta.last_page > 1 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPage(page - 1)}
            disabled={meta.current_page <= 1}
            className="rounded-lg border px-3 py-1 disabled:opacity-40"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
          >
            ← Prev
          </button>
          <span>Page {meta.current_page} / {meta.last_page}</span>
          <button
            onClick={() => onPage(page + 1)}
            disabled={meta.current_page >= meta.last_page}
            className="rounded-lg border px-3 py-1 disabled:opacity-40"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Cash/Bank method selector. When Bank is chosen, a free-text field records
 * which bank / cheque / transfer ref so it's known where the money is.
 */
export function MethodField({ method, bankRef, onChange }: { method: string; bankRef: string; onChange: (method: string, bankRef: string) => void }) {
  return (
    <>
      <Field label="Payment method (kaise)">
        <Select value={method} onChange={(e) => onChange(e.target.value, e.target.value === 'bank' ? bankRef : '')}>
          <option value="cash">Cash (haath me)</option>
          <option value="bank">Bank / online</option>
        </Select>
      </Field>
      {method === 'bank' && (
        <Field label="Bank / reference (kaunsa bank, cheque/transfer #) — zaroori">
          <Input value={bankRef} onChange={(e) => onChange(method, e.target.value)} placeholder="e.g. Meezan — cheque 123" required />
        </Field>
      )}
    </>
  )
}

/** Shows an outstanding balance inside a payment form, with a "fill full" shortcut. */
export function OutstandingNote({ label, amount, onFill }: { label: string; amount: number; onFill?: (rupees: number) => void }) {
  const rupees = (amount / 100).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const settled = amount <= 0
  return (
    <div
      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
    >
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="flex items-center gap-2">
        <strong style={{ color: settled ? 'var(--green)' : 'var(--amber)' }}>
          {settled ? 'Sab clear' : `Rs ${rupees}`}
        </strong>
        {!settled && onFill && (
          <button
            type="button"
            onClick={() => onFill(amount / 100)}
            className="rounded px-2 py-0.5 text-xs font-semibold"
            style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}
          >
            Full
          </button>
        )}
      </span>
    </div>
  )
}

// ===== Reusable DataTable: searchable, sortable headers, paginated =====
export interface Column<T> {
  key: string
  label: string
  sortable?: boolean
  align?: 'left' | 'right'
  render: (row: T) => ReactNode
}

/**
 * Server-driven table. The parent owns the query state (search/sort/dir/page)
 * and passes the current rows; this renders the search box, clickable sort
 * headers (asc/desc), and pagination. Newest-first is just the parent's default.
 */
export function DataTable<T>({
  columns,
  rows,
  loading,
  emptyText = 'Koi record nahi.',
  search,
  onSearch,
  searchPlaceholder = 'Search…',
  sort,
  dir,
  onSort,
  meta,
  page,
  onPage,
  actions,
}: {
  columns: Column<T>[]
  rows: T[] | undefined
  loading?: boolean
  emptyText?: string
  search?: string
  onSearch?: (v: string) => void
  searchPlaceholder?: string
  sort?: string
  dir?: 'asc' | 'desc'
  onSort?: (key: string) => void
  meta?: { current_page: number; last_page: number; total: number }
  page: number
  onPage: (p: number) => void
  actions?: ReactNode
}) {
  return (
    <div>
      {(onSearch || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {onSearch ? (
            <div className="relative max-w-xs flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
              <Input value={search ?? ''} onChange={(e) => onSearch(e.target.value)} placeholder={searchPlaceholder} className="!pl-9" />
            </div>
          ) : <span />}
          {actions}
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide" style={{ background: 'var(--surface-2)', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
              {columns.map((c) => {
                const active = sort === c.key
                return (
                  <th key={c.key} className={`px-4 py-3 font-semibold ${c.align === 'right' ? 'text-right' : ''}`}>
                    {c.sortable && onSort ? (
                      <button
                        onClick={() => onSort(c.key)}
                        className={`inline-flex items-center gap-1 transition hover:text-[var(--text)] ${c.align === 'right' ? 'flex-row-reverse' : ''}`}
                        style={{ color: active ? 'var(--text)' : 'inherit' }}
                      >
                        {c.label}
                        {active ? (dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />) : <ChevronsUpDown size={13} style={{ opacity: 0.5 }} />}
                      </button>
                    ) : c.label}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody style={{ color: 'var(--text)' }}>
            {loading ? (
              <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>Loading…</td></tr>
            ) : rows && rows.length > 0 ? (
              rows.map((row, i) => (
                <tr key={i} className="transition hover:bg-[var(--surface-hover)]" style={{ borderTop: '1px solid var(--border)' }}>
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-3 ${c.align === 'right' ? 'text-right' : ''}`}>{c.render(row)}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr><td colSpan={columns.length} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>{emptyText}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination meta={meta} page={page} onPage={onPage} />
    </div>
  )
}

/** Themed table row helpers reused across pages. */
export function Row({ children }: { children: ReactNode }) {
  return <tr className="transition hover:bg-[var(--surface-hover)]" style={{ borderTop: '1px solid var(--border)' }}>{children}</tr>
}

/**
 * Compact icon action button for table rows (Edit / Delete / Ledger / Pay).
 * Tone tints the icon and gives a matching soft hover — looks VIP, no childish text links.
 */
export function IconButton({
  icon: Icon,
  label,
  tone = 'default',
  onClick,
}: {
  icon: LucideIcon
  label: string
  tone?: 'default' | 'primary' | 'green' | 'red' | 'amber'
  onClick: () => void
}) {
  const color: Record<string, string> = {
    default: 'var(--muted)',
    primary: 'var(--primary)',
    green: 'var(--green)',
    red: 'var(--red)',
    amber: 'var(--amber)',
  }
  const c = color[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition hover:-translate-y-0.5"
      style={{ borderColor: 'var(--border)', color: c, background: 'var(--surface-2)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = `color-mix(in srgb, ${c} 16%, transparent)`; e.currentTarget.style.borderColor = c }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  )
}

/** Wrap row action icons so they sit together, right-aligned. */
export function RowActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-1.5">{children}</div>
}

// ===== Animated confirm dialog (replaces window.confirm everywhere) =====
interface ConfirmOptions {
  title?: string
  message: ReactNode
  confirmText?: string
  cancelText?: string
  tone?: 'danger' | 'primary'
}
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>
const ConfirmContext = createContext<ConfirmFn>(async () => false)

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
  return useContext(ConfirmContext)
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null)

  const confirm = useCallback<ConfirmFn>((opts) => new Promise<boolean>((resolve) => setState({ opts, resolve })), [])

  const close = (val: boolean) => {
    state?.resolve(val)
    setState(null)
  }

  const o = state?.opts
  const danger = (o?.tone ?? 'danger') === 'danger'
  const accent = danger ? 'var(--red)' : 'var(--primary)'

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="bf-fade fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => close(false)}>
          <div
            className="bf-pop w-full max-w-sm rounded-2xl border p-6 shadow-2xl"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}
              >
                <AlertTriangle size={22} />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>{o?.title ?? 'Confirm karein'}</h3>
                <div className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{o?.message}</div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => close(false)}>{o?.cancelText ?? 'Cancel'}</Button>
              <Button variant={danger ? 'danger' : 'primary'} onClick={() => close(true)}>{o?.confirmText ?? 'Confirm'}</Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
