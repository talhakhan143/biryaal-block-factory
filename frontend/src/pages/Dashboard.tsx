import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { formatPaisa } from '../lib/money'
import { Card, PageHeader, Spinner } from '../components/ui'

interface DashboardData {
  today: { production_qty: number; blocks_sold: number; sales_total: number; expenses_total: number; money_in: number; money_out: number }
  month: { label: string; sales_total: number; expenses_total: number; net_profit: number }
  totals: { production: number; sold: number }
  cash_in_hand: number
  bank_balance: number
  receivables: number
  payables: number
  payable_breakdown: { suppliers: number; drivers: number; labourers: number; staff: number }
  due_counts: { customers: number; suppliers: number; drivers: number; labourers: number }
  pending_dispatch: number
  stock: { curing: number; ready: number; damaged: number }
  low_stock_alerts: { id: string; name: string; unit: string; current_qty: number }[]
  low_ready_alerts: { id: string; name: string; ready_qty: number; threshold: number }[]
}

function Stat({ label, hint, value, tone = 'text', to }: { label: string; hint: string; value: string; tone?: string; to?: string }) {
  const navigate = useNavigate()
  const colorVar: Record<string, string> = {
    text: 'var(--text)',
    green: 'var(--green)',
    red: 'var(--red)',
    primary: 'var(--primary)',
    amber: 'var(--amber)',
  }
  return (
    <div
      onClick={to ? () => navigate(to) : undefined}
      className={to ? 'cursor-pointer transition hover:-translate-y-0.5' : ''}
    >
      <Card>
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</div>
          {to && <span style={{ color: 'var(--muted)' }}>›</span>}
        </div>
        <div className="text-[10px]" style={{ color: 'var(--muted)' }}>{hint}</div>
        <div className="mt-2 text-2xl font-bold" style={{ color: colorVar[tone] }}>{value}</div>
      </Card>
    </div>
  )
}

function SectionTitle({ title, note }: { title: string; note?: string }) {
  return (
    <h2 className="mb-3 mt-6 text-sm font-bold" style={{ color: 'var(--text)' }}>
      {title} {note && <span className="font-normal" style={{ color: 'var(--muted)' }}>— {note}</span>}
    </h2>
  )
}

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardData>('/dashboard')).data,
  })

  if (isLoading || !data) return <Spinner />

  const b = data.payable_breakdown
  const d = data.due_counts

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Poora hisaab — har cheez yahan se control karein" />

      {/* Money position */}
      <SectionTitle title="Paisa" note="cash position" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Cash in hand" hint="Cash mojood · click for cash book" value={formatPaisa(data.cash_in_hand)} tone={data.cash_in_hand < 0 ? 'red' : 'green'} to="/cash-book" />
        <Stat label="Bank balance" hint="Bank me · click for cash book" value={formatPaisa(data.bank_balance)} tone={data.bank_balance < 0 ? 'red' : 'primary'} to="/cash-book" />
        <Stat label="Receivables" hint={`${d.customers} customers ne dene hain`} value={formatPaisa(data.receivables)} tone="primary" to="/payments" />
        <Stat label="Payables" hint={`${d.suppliers + d.drivers + d.labourers} ko dene hain · click for list`} value={formatPaisa(data.payables)} tone="red" to="/payments" />
      </div>

      {/* Payables breakdown */}
      <SectionTitle title="Dene baqi (kis ko kitna)" note="payables breakdown" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Suppliers" hint={`${d.suppliers} maal walay`} value={formatPaisa(b.suppliers)} tone="red" to="/payments" />
        <Stat label="Drivers" hint={`${d.drivers} driver`} value={formatPaisa(b.drivers)} tone="red" to="/payments" />
        <Stat label="Labourers" hint={`${d.labourers} mazdoor`} value={formatPaisa(b.labourers)} tone="red" to="/payments" />
        <Stat label="Staff salaries" hint="Baqi tankhwah" value={formatPaisa(b.staff)} tone="red" to="/payments" />
      </div>

      {/* Today */}
      <SectionTitle title="Aaj" note="today" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Today Sales" hint="Aaj ki bikri (Rs)" value={formatPaisa(data.today.sales_total)} tone="green" to="/sales" />
        <Stat label="Today Expenses" hint="Aaj ke kharchay" value={formatPaisa(data.today.expenses_total)} tone="red" to="/expenses" />
        <Stat label="Money In" hint="Aaj paisa aaya" value={formatPaisa(data.today.money_in)} tone="green" to="/payments" />
        <Stat label="Money Out" hint="Aaj paisa gaya" value={formatPaisa(data.today.money_out)} tone="red" to="/payments" />
        <Stat label="Today Production" hint="Aaj banaye blocks" value={`${data.today.production_qty} pcs`} tone="primary" to="/production" />
        <Stat label="Today Blocks Sold" hint="Aaj bik'e blocks" value={`${data.today.blocks_sold} pcs`} tone="green" to="/sales" />
        <Stat label="Pending Dispatch" hint="Order jo deliver hone baqi" value={`${data.pending_dispatch}`} tone={data.pending_dispatch > 0 ? 'amber' : 'green'} to="/dispatch" />
        <Stat label="Ready Stock" hint="Tayar maal · click for list" value={`${data.stock.ready} pcs`} tone="green" to="/inventory" />
      </div>

      {/* This month */}
      <SectionTitle title={`Is mahine (${data.month.label})`} note="month P&L" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Month Sales" hint="Is mahine bikri" value={formatPaisa(data.month.sales_total)} tone="green" to="/sales" />
        <Stat label="Month Expenses" hint="Is mahine kharch" value={formatPaisa(data.month.expenses_total)} tone="red" to="/expenses" />
        <Stat label="Net Profit" hint="Maal bikri − kharch" value={formatPaisa(data.month.net_profit)} tone={data.month.net_profit < 0 ? 'red' : 'green'} to="/reports" />
        <Stat label="Curing Stock" hint="Curing me · tayar honay baqi" value={`${data.stock.curing} pcs`} tone="amber" to="/production" />
      </div>

      {/* Lifetime */}
      <SectionTitle title="Ab tak" note="lifetime totals" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total Production" hint="Ab tak banaye blocks" value={`${data.totals.production} pcs`} tone="primary" to="/production" />
        <Stat label="Total Sold" hint="Ab tak bik'e blocks" value={`${data.totals.sold} pcs`} tone="green" to="/sales" />
        <Stat label="Remaining Ready" hint="Bechne ke liye baqi" value={`${data.stock.ready} pcs`} tone="green" to="/inventory" />
        <Stat label="Damaged" hint="Kharab maal" value={`${data.stock.damaged} pcs`} tone="red" to="/inventory" />
      </div>

      {/* Alerts */}
      <SectionTitle title="Kam Stock Alerts" note="low stock" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.low_stock_alerts.map((m) => (
          <Card key={`raw-${m.id}`} className="!border-[var(--red)]">
            <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Raw material</div>
            <div className="font-semibold" style={{ color: 'var(--red)' }}>{m.name}</div>
            <div className="text-sm" style={{ color: 'var(--muted)' }}>{m.current_qty} {m.unit} bacha hai</div>
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
    </div>
  )
}
