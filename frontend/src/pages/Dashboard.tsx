import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { SquarePen } from 'lucide-react'
import { api, apiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatPaisa } from '../lib/money'
import { Button, Card, Field, Input, LockedStat, Modal, PageHeader, Spinner } from '../components/ui'

// Paise wali har key optional hai kyunke API chhupi hui raqam bhejti hi nahi,
// server pe se nikal deti hai. Isliye yahan sab ko `?` lagana zaroori hai.
interface DashboardData {
  today: { production_qty: number; blocks_sold: number; sales_total?: number; expenses_total?: number; money_in?: number; money_out?: number }
  month: { label: string; sales_total?: number; income?: number; expenses_total?: number; net_profit?: number }
  totals: { production: number; sold: number; income?: number; cost?: number; net_profit?: number }
  cash_in_hand?: number
  bank_balance?: number
  total_cash?: number
  receivables?: number
  customer_advances?: number
  payables?: number
  payable_breakdown?: { suppliers: number; drivers: number; labourers: number; staff: number }
  advances?: number
  advance_breakdown?: { suppliers: number; drivers: number; labourers: number; staff: number }
  hidden?: string[]
  due_counts: { customers: number; customers_with_advance: number; suppliers: number; drivers: number; labourers: number }
  pending_dispatch: number
  stock: { curing: number; ready: number; damaged: number }
  low_stock_alerts: { id: string; name: string; unit: string; current_qty: number; low_stock_threshold: number }[]
  low_ready_alerts: { id: string; name: string; ready_qty: number; threshold: number }[]
}

type Tone = 'text' | 'green' | 'red' | 'primary' | 'amber'

function Stat({ label, hint, value, tone = 'text', to }: { label: string; hint: string; value: string; tone?: Tone; to?: string }) {
  const navigate = useNavigate()
  const colorVar: Record<string, string> = {
    text: 'var(--text)',
    green: 'var(--green)',
    red: 'var(--red)',
    primary: 'var(--primary)',
    amber: 'var(--amber)',
  }
  const accent = tone === 'text' ? undefined : (tone as 'green' | 'red' | 'primary' | 'amber')
  return (
    <Card hover={!!to} accent={accent} onClick={to ? () => navigate(to) : undefined} className="pl-6">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</div>
        {to && <span className="text-lg leading-none" style={{ color: 'var(--muted)' }}>›</span>}
      </div>
      <div className="text-[10px]" style={{ color: 'var(--muted)' }}>{hint}</div>
      <div className="mt-2 text-2xl font-bold tracking-tight" style={{ color: colorVar[tone] }}>{value}</div>
    </Card>
  )
}

function SectionTitle({ title, note }: { title: string; note?: string }) {
  return (
    <h2 className="mb-3 mt-6 text-sm font-bold" style={{ color: 'var(--text)' }}>
      {title} {note && <span className="font-normal" style={{ color: 'var(--muted)' }}>({note})</span>}
    </h2>
  )
}

// Ek group ke saare tile ke badle ek hi taala lagta hai, warna grid taalon se bhar jata hai
// aur malik ko samajh nahi aata kahan se kholna hai.
const GROUP_LABEL: Record<string, string> = {
  income: 'Profit aur loss',
  sales: 'Total sales aur payments',
  cash: 'Cash aur bank',
  dues: 'Lena dena (udhaar aur advance)',
}

type LowMat = DashboardData['low_stock_alerts'][number]

export default function Dashboard() {
  const qc = useQueryClient()
  const { can } = useAuth()
  const money = can('accounting.view') // Owner/Super Admin/Accountant; NOT Sales User
  const [editMat, setEditMat] = useState<LowMat | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardData>('/dashboard')).data,
  })
  const saveMat = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.put(`/raw-materials/${id}`, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['raw-materials'] }); setEditMat(null) },
  })

  if (isLoading || !data) return <Spinner />

  const d = data.due_counts
  // Settings se jo group chhupaya gaya hai wo API khud bata deti hai.
  const hidden = new Set(data.hidden ?? [])
  const shown = (g: string) => !hidden.has(g)
  // Kharch wale cards apna scope sath le kar jaate hain, warna list page
  // card ka number kabhi explain nahi kar paata.
  const now = new Date()
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  const today = iso(now)
  const monthFrom = iso(new Date(now.getFullYear(), now.getMonth(), 1))
  const monthTo = iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  const expensesToday = `/expenses?from=${today}&to=${today}`
  const expensesMonth = `/expenses?from=${monthFrom}&to=${monthTo}`

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Poora hisaab, har cheez yahan se control karein" />

      {/* Money position, sirf accounts-access wale (Sales User ko nahi) */}
      {money && (
        <>
          <SectionTitle title="Paisa" note="cash position" />
          <div className="bf-stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
            {shown('cash') ? (
              <>
                <Stat label="Total Cash" hint="Bank + haath ka cash (total liquid)" value={formatPaisa(data.total_cash ?? 0)} tone={(data.total_cash ?? 0) < 0 ? 'red' : 'green'} to="/cash-book" />
                <Stat label="Cash in hand" hint="Cash mojood · click for cash book" value={formatPaisa(data.cash_in_hand ?? 0)} tone={(data.cash_in_hand ?? 0) < 0 ? 'red' : 'green'} to="/cash-book" />
                <Stat label="Bank balance" hint="Bank me · click for cash book" value={formatPaisa(data.bank_balance ?? 0)} tone={(data.bank_balance ?? 0) < 0 ? 'red' : 'primary'} to="/cash-book" />
              </>
            ) : (
              <LockedStat label={GROUP_LABEL.cash} />
            )}
            {shown('dues') ? (
              <>
                <Stat label="Receivables" hint={`${d.customers} customers se lene hain · click for list`} value={formatPaisa(data.receivables ?? 0)} tone="primary" to="/payments" />
                <Stat label="Payables" hint={`${d.suppliers + d.drivers + d.labourers} ko dene hain · click for list`} value={formatPaisa(data.payables ?? 0)} tone="red" to="/payments" />
                {(data.customer_advances ?? 0) > 0 && (
                  <Stat
                    label="Customer ka advance"
                    hint={`${d.customers_with_advance} ne paisa pehle diya · click for list`}
                    value={formatPaisa(data.customer_advances ?? 0)}
                    tone="amber"
                    to="/customers?advance=1"
                  />
                )}
                {(data.advances ?? 0) > 0 && (
                  <Stat label="Advances diye" hint="Mazdoor/driver ko pehle diya · click for list" value={formatPaisa(data.advances ?? 0)} tone="primary" to="/payments" />
                )}
              </>
            ) : (
              <LockedStat label={GROUP_LABEL.dues} />
            )}
          </div>
        </>
      )}

      {/* Today */}
      <SectionTitle title="Aaj" note="today" />
      <div className="bf-stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Taala pehle chhupe tile ki jagah pe aata hai, taake neeche wale blocks ke card apni jagah pe hi rahein */}
        {money && (shown('sales')
          ? <Stat label="Today Sales" hint="Aaj ki farokht (Rs)" value={formatPaisa(data.today.sales_total ?? 0)} tone="green" to="/sales" />
          : <LockedStat label={GROUP_LABEL.sales} />)}
        {/* Kharch kabhi nahi chhupta, owner ko hamesha dikhna chahiye */}
        {money && <Stat label="Today Expenses" hint="Aaj ke kharchay · click for details" value={formatPaisa(data.today.expenses_total ?? 0)} tone="red" to={expensesToday} />}
        {money && shown('sales') && <Stat label="Money In" hint="Aaj paisa aaya" value={formatPaisa(data.today.money_in ?? 0)} tone="green" to="/payments" />}
        {money && shown('sales') && <Stat label="Money Out" hint="Aaj paisa gaya" value={formatPaisa(data.today.money_out ?? 0)} tone="red" to="/payments" />}
        <Stat label="Today Production" hint="Aaj banaye blocks" value={`${data.today.production_qty} pcs`} tone="primary" to="/production" />
        <Stat label="Today Blocks Sold" hint="Aaj bik'e blocks" value={`${data.today.blocks_sold} pcs`} tone="green" to="/sales" />
        <Stat label="Pending Dispatch" hint="Order jo deliver hone baqi" value={`${data.pending_dispatch}`} tone={data.pending_dispatch > 0 ? 'amber' : 'green'} to="/dispatch" />
        <Stat label="Ready Stock" hint="Tayar maal · click for list" value={`${data.stock.ready} pcs`} tone="green" to="/inventory" />
      </div>

      {/* Profit & Loss, sirf accounts-access wale */}
      {money && (
        <>
          {/* Section chhupne par bhi heading rehti hai, warna malik ko pata hi nahi chalega ke yahan kuch tha */}
          <SectionTitle title={`Munafa / Nuksan (${data.month.label})`} note="profit & loss, kharch me expenses + salaries + labour sab" />
          <div className="bf-stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
            {shown('income')
              ? <Stat label="Is mahine Aamdani" hint="Farokht + other income" value={formatPaisa(data.month.income ?? 0)} tone="green" to="/reports" />
              : <LockedStat label={GROUP_LABEL.income} />}
            {/* Kharch is parde se bahar hai, is liye taala lagne par bhi apni jagah rehta hai */}
            <Stat label="Is mahine Kharch" hint="Expenses + salary + labour · click for breakdown" value={formatPaisa(data.month.expenses_total ?? 0)} tone="red" to={expensesMonth} />
            {shown('income') && (
              <>
                <Stat label="Net Profit (mahina)" hint={(data.month.net_profit ?? 0) < 0 ? 'NUKSAN' : 'Munafa is mahine'} value={formatPaisa(data.month.net_profit ?? 0)} tone={(data.month.net_profit ?? 0) < 0 ? 'red' : 'green'} />
                <Stat label="Net Profit (ab tak)" hint={(data.totals.net_profit ?? 0) < 0 ? 'NUKSAN, lifetime' : 'Lifetime munafa'} value={formatPaisa(data.totals.net_profit ?? 0)} tone={(data.totals.net_profit ?? 0) < 0 ? 'red' : 'green'} />
              </>
            )}
          </div>
        </>
      )}

      {/* Lifetime */}
      <SectionTitle title="Ab tak" note="lifetime totals" />
      <div className="bf-stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total Production" hint="Ab tak banaye blocks" value={`${data.totals.production} pcs`} tone="primary" to="/production" />
        <Stat label="Total Sold" hint="Ab tak bik'e blocks" value={`${data.totals.sold} pcs`} tone="green" to="/sales" />
        <Stat label="Remaining Ready" hint="Bechne ke liye baqi" value={`${data.stock.ready} pcs`} tone="green" to="/inventory" />
        <Stat label="Curing Stock" hint="Curing me · tayar honay baqi" value={`${data.stock.curing} pcs`} tone="amber" to="/production" />
        {/* Damaged card hidden, data safe, re-enable anytime */}
      </div>

      {/* Alerts */}
      <SectionTitle title="Kam Stock Alerts" note="low stock" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.low_stock_alerts.map((m) => (
          <Card key={`raw-${m.id}`} className="!border-[var(--red)]">
            <div className="flex items-start justify-between">
              <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Raw material</div>
              <button onClick={() => setEditMat(m)} className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--primary)' }}>
                <SquarePen size={13} /> Update
              </button>
            </div>
            <div className="font-semibold" style={{ color: 'var(--red)' }}>{m.name}</div>
            <div className="text-sm" style={{ color: 'var(--muted)' }}>{m.current_qty} {m.unit} bacha hai (alert &le; {m.low_stock_threshold})</div>
          </Card>
        ))}
        {data.low_ready_alerts.map((p) => (
          <Card key={`fin-${p.id}`} className="!border-[var(--amber)]">
            <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Finished blocks</div>
            <div className="font-semibold" style={{ color: 'var(--amber)' }}>{p.name}</div>
            <div className="text-sm" style={{ color: 'var(--muted)' }}>Sirf {p.ready_qty} pcs ready (alert &le; {p.threshold})</div>
          </Card>
        ))}
        {data.low_stock_alerts.length === 0 && data.low_ready_alerts.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Sab stock theek hai.</p>
        )}
      </div>

      {editMat && (
        <Modal title={`Update, ${editMat.name}`} onClose={() => setEditMat(null)}>
          <MaterialEditForm
            mat={editMat}
            busy={saveMat.isPending}
            error={saveMat.error ? apiError(saveMat.error) : ''}
            onSubmit={(payload) => saveMat.mutate({ id: editMat.id, payload })}
          />
        </Modal>
      )}
    </div>
  )
}

function MaterialEditForm({ mat, onSubmit, busy, error }: { mat: LowMat; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({
    name: mat.name,
    unit: mat.unit,
    current_qty: String(mat.current_qty),
    low_stock_threshold: String(mat.low_stock_threshold),
  })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({ name: form.name, unit: form.unit, current_qty: Number(form.current_qty), low_stock_threshold: Number(form.low_stock_threshold) })
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><Input value={form.name} onChange={(e) => set('name', e.target.value)} required /></Field>
        <Field label="Unit"><Input value={form.unit} onChange={(e) => set('unit', e.target.value)} required /></Field>
        <Field label={`Current stock (${form.unit})`}><Input type="number" step="0.001" min="0" value={form.current_qty} onChange={(e) => set('current_qty', e.target.value)} required /></Field>
        <Field label="Low stock alert par"><Input type="number" step="0.001" min="0" value={form.low_stock_threshold} onChange={(e) => set('low_stock_threshold', e.target.value)} /></Field>
      </div>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>Stock manual theek karne ke liye, khareed ke liye Purchases use karein.</p>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Update'}</Button>
    </form>
  )
}
