import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { formatPaisa } from '../lib/money'
import { Card, PageHeader, Spinner } from '../components/ui'

interface DashboardData {
  today: { production_qty: number; blocks_sold: number; sales_total: number; expenses_total: number }
  totals: { production: number; sold: number }
  cash_balance: number
  receivables: number
  payables: number
  stock: { curing: number; ready: number; damaged: number }
  low_stock_alerts: { id: string; name: string; unit: string; current_qty: number }[]
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

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardData>('/dashboard')).data,
  })

  if (isLoading || !data) return <Spinner />

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Aaj ka hisaab — today at a glance" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Today Production" hint="Aaj banaye blocks" value={`${data.today.production_qty} pcs`} tone="primary" to="/production" />
        <Stat label="Today Blocks Sold" hint="Aaj bik'e blocks" value={`${data.today.blocks_sold} pcs`} tone="green" to="/sales" />
        <Stat label="Today Sales" hint="Aaj ki bikri (Rs)" value={formatPaisa(data.today.sales_total)} tone="green" to="/sales" />
        <Stat label="Today Expenses" hint="Aaj ke kharchay" value={formatPaisa(data.today.expenses_total)} tone="red" to="/expenses" />
        <Stat label="Cash Balance" hint="Cash mojood" value={formatPaisa(data.cash_balance)} tone={data.cash_balance < 0 ? 'red' : 'green'} to="/cash-book" />
        <Stat label="Receivables" hint="Customers ne dene hain · click for list" value={formatPaisa(data.receivables)} tone="primary" to="/customers" />
        <Stat label="Payables" hint="Humne dene hain · click for list" value={formatPaisa(data.payables)} tone="red" to="/suppliers" />
        <Stat label="Ready Stock" hint="Tayar maal · click for list" value={`${data.stock.ready} pcs`} tone="green" to="/inventory" />
        <Stat label="Curing Stock" hint="Curing me" value={`${data.stock.curing} pcs`} tone="amber" to="/production" />
      </div>

      <h2 className="mb-3 mt-6 text-sm font-bold" style={{ color: 'var(--text)' }}>Overall (ab tak) <span className="font-normal" style={{ color: 'var(--muted)' }}>— total</span></h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total Production" hint="Ab tak banaye blocks" value={`${data.totals.production} pcs`} tone="primary" to="/production" />
        <Stat label="Total Sold" hint="Ab tak bik'e blocks" value={`${data.totals.sold} pcs`} tone="green" to="/sales" />
        <Stat label="Remaining Ready" hint="Bechne ke liye baqi" value={`${data.stock.ready} pcs`} tone="green" to="/inventory" />
        <Stat label="Damaged" hint="Kharab maal" value={`${data.stock.damaged} pcs`} tone="red" to="/inventory" />
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-bold" style={{ color: 'var(--text)' }}>Low Stock Alerts <span className="font-normal" style={{ color: 'var(--muted)' }}>(kam maal)</span></h2>
        {data.low_stock_alerts.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Sab raw material theek hai.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.low_stock_alerts.map((m) => (
              <Card key={m.id} className="!border-[var(--red)]">
                <div className="font-semibold" style={{ color: 'var(--red)' }}>{m.name}</div>
                <div className="text-sm" style={{ color: 'var(--muted)' }}>{m.current_qty} {m.unit} bacha hai</div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
