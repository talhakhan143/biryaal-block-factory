import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

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

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border p-5 shadow-sm ${className}`}
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
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

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border p-6 shadow-2xl"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold" style={{ color: 'var(--text)' }}>{title}</h2>
        {children}
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
        <Field label="Bank / reference (kaunsa bank, cheque/transfer #)">
          <Input value={bankRef} onChange={(e) => onChange(method, e.target.value)} placeholder="e.g. Meezan — cheque 123" />
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

/** Themed table row helpers reused across pages. */
export function Row({ children }: { children: ReactNode }) {
  return <tr className="transition hover:bg-[var(--surface-hover)]" style={{ borderTop: '1px solid var(--border)' }}>{children}</tr>
}
