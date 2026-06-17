import { useQuery } from '@tanstack/react-query'
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

function Stat({ label, hint, value, tone = 'text' }: { label: string; hint: string; value: string; tone?: string }) {
  const colorVar: Record<string, string> = {
    text: 'var(--text)',
    green: 'var(--green)',
    red: 'var(--red)',
    primary: 'var(--primary)',
    amber: 'var(--amber)',
  }
  return (
    <Card>
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="text-[10px]" style={{ color: 'var(--muted)' }}>{hint}</div>
      <div className="mt-2 text-2xl font-bold" style={{ color: colorVar[tone] }}>{value}</div>
    </Card>
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
        <Stat label="Today Production" hint="Aaj banaye blocks" value={`${data.today.production_qty} pcs`} tone="primary" />
        <Stat label="Today Blocks Sold" hint="Aaj bik'e blocks" value={`${data.today.blocks_sold} pcs`} tone="green" />
        <Stat label="Today Sales" hint="Aaj ki bikri (Rs)" value={formatPaisa(data.today.sales_total)} tone="green" />
        <Stat label="Today Expenses" hint="Aaj ke kharchay" value={formatPaisa(data.today.expenses_total)} tone="red" />
        <Stat label="Cash Balance" hint="Cash mojood" value={formatPaisa(data.cash_balance)} tone={data.cash_balance < 0 ? 'red' : 'green'} />
        <Stat label="Receivables" hint="Customers ne dene hain" value={formatPaisa(data.receivables)} tone="primary" />
        <Stat label="Payables" hint="Humne dene hain" value={formatPaisa(data.payables)} tone="red" />
        <Stat label="Ready Stock" hint="Tayar maal (baqi)" value={`${data.stock.ready} pcs`} tone="green" />
        <Stat label="Curing Stock" hint="Curing me" value={`${data.stock.curing} pcs`} tone="amber" />
      </div>

      <h2 className="mb-3 mt-6 text-sm font-bold" style={{ color: 'var(--text)' }}>Overall (ab tak) <span className="font-normal" style={{ color: 'var(--muted)' }}>— total</span></h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total Production" hint="Ab tak banaye blocks" value={`${data.totals.production} pcs`} tone="primary" />
        <Stat label="Total Sold" hint="Ab tak bik'e blocks" value={`${data.totals.sold} pcs`} tone="green" />
        <Stat label="Remaining Ready" hint="Bechne ke liye baqi" value={`${data.stock.ready} pcs`} tone="green" />
        <Stat label="Damaged" hint="Kharab maal" value={`${data.stock.damaged} pcs`} tone="red" />
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
