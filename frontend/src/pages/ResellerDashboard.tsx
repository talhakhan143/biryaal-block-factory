import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { SquarePen } from 'lucide-react'
import { api, apiError } from '../lib/api'
import { formatPaisa } from '../lib/money'
import { Button, Card, Field, Input, Modal, PageHeader, Spinner } from '../components/ui'

interface LowItem { id: string; name: string; unit: string; sale_price: number; stock_qty: number; low_stock_threshold: number }
interface ResellerDash {
  today: { in: number; out: number; net: number }
  all: { in: number; out: number; net: number }
  payable: number
  receivable: number
  stock_value: number
  low_stock_count: number
  low_items: LowItem[]
  items_count: number
  purchase_total: number
  sales: { today: number; revenue: number; profit: number; receivable: number }
  kiraya: { active: number; earned: number; this_month: number; collected: number; outstanding: number }
  profit: number
}

type Tone = 'text' | 'green' | 'red' | 'primary' | 'amber'

function Stat({ label, hint, value, tone = 'text', to }: { label: string; hint: string; value: string; tone?: Tone; to?: string }) {
  const navigate = useNavigate()
  const colorVar: Record<string, string> = {
    text: 'var(--text)', green: 'var(--green)', red: 'var(--red)', primary: 'var(--primary)', amber: 'var(--amber)',
  }
  const accent = tone === 'text' ? undefined : (tone as 'green' | 'red' | 'primary' | 'amber')
  return (
    <Card hover accent={accent} onClick={to ? () => navigate(to) : undefined} className="pl-6">
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
      {title} {note && <span className="font-normal" style={{ color: 'var(--muted)' }}>— {note}</span>}
    </h2>
  )
}

export default function ResellerDashboard() {
  const qc = useQueryClient()
  const [editItem, setEditItem] = useState<LowItem | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['reseller/dashboard'],
    queryFn: async () => (await api.get<{ data: ResellerDash }>('/reseller/dashboard')).data.data,
  })
  const saveItem = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.put(`/reseller/items/${id}`, payload),
    onSuccess: () => { ['reseller/dashboard', 'reseller/items'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); setEditItem(null) },
  })

  if (isLoading || !data) return <Spinner />

  return (
    <div>
      <PageHeader title="Resellers Point — Dashboard" subtitle="Alag hisab — aaj ka lain den, payable/receivable, stock, kiraya" />

      <SectionTitle title="Aaj (Today)" note="kitna aya / gaya" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Aaj Aya" hint="Kiraya receipts" value={formatPaisa(data.today.in)} tone="green" to="/reseller/payments" />
        <Stat label="Aaj Gaya" hint="Supplier payments" value={formatPaisa(data.today.out)} tone="red" to="/reseller/payments" />
        <Stat label="Aaj Net" hint="Aya − Gaya" value={formatPaisa(data.today.net)} tone={data.today.net >= 0 ? 'green' : 'red'} to="/reseller/payments" />
      </div>

      <SectionTitle title="Bikri (Sales)" note="revenue aur munafa" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Aaj Bikri" hint="Aaj ka total sale" value={formatPaisa(data.sales.today)} tone="primary" to="/reseller/pos" />
        <Stat label="Total Revenue" hint="Ab tak" value={formatPaisa(data.sales.revenue)} tone="text" to="/reseller/sales" />
        <Stat label="Sale Profit" hint="Revenue − cost (margin)" value={formatPaisa(data.sales.profit)} tone="green" to="/reseller/sales" />
        <Stat label="Udhaar (sale)" hint="Customers se lena" value={formatPaisa(data.sales.receivable)} tone="amber" to="/reseller/sales" />
      </div>

      <SectionTitle title="Baqi Jaat (Outstanding)" note="lena / dena" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Receivable" hint="Customers se lena (sale+kiraya)" value={formatPaisa(data.receivable)} tone="amber" to="/reseller/payments" />
        <Stat label="Payable" hint="Suppliers+drivers ko dena" value={formatPaisa(data.payable)} tone="red" to="/reseller/payments" />
        <Stat label="Net Cash" hint="Ab tak: aya − gaya" value={formatPaisa(data.all.net)} tone={data.all.net >= 0 ? 'green' : 'red'} to="/reseller/payments" />
      </div>

      <SectionTitle title="Kiraya (Rental)" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Active" hint="Abhi kiraye par" value={String(data.kiraya.active)} tone="primary" to="/reseller/kiraya" />
        <Stat label="This Month" hint="Is mahine ki income" value={formatPaisa(data.kiraya.this_month)} tone="green" to="/reseller/kiraya" />
        <Stat label="Kiraya Income" hint="Total banna (earned)" value={formatPaisa(data.kiraya.earned)} tone="green" to="/reseller/kiraya" />
        <Stat label="Collected" hint="Wasool ho chuka" value={formatPaisa(data.kiraya.collected)} tone="text" to="/reseller/kiraya" />
        <Stat label="Outstanding" hint="Kiraya lena baqi" value={formatPaisa(data.kiraya.outstanding)} tone="amber" to="/reseller/kiraya" />
      </div>

      <SectionTitle title="Stock" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Stock Value" hint="Avg cost par" value={formatPaisa(data.stock_value)} tone="primary" to="/reseller/items" />
        <Stat label="Items" hint="Total items" value={String(data.items_count)} tone="text" to="/reseller/items" />
        <Stat label="Low Stock" hint="Kam maal wale items" value={String(data.low_stock_count)} tone={data.low_stock_count > 0 ? 'amber' : 'text'} to="/reseller/items" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat label="Total Profit" hint="Sale margin + kiraya income" value={formatPaisa(data.profit)} tone="green" to="/reseller/payments" />
        <Stat label="Total Khareed" hint="Ab tak maal khareeda (stock)" value={formatPaisa(data.purchase_total)} tone="text" to="/reseller/purchases" />
      </div>

      <SectionTitle title="Kam Stock Alerts" note="low items" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.low_items.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Sab stock theek hai.</p>
        ) : data.low_items.map((it) => (
          <Card key={it.id} className="!border-[var(--red)]">
            <div className="flex items-start justify-between">
              <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Reseller item</div>
              <button onClick={() => setEditItem(it)} className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--primary)' }}>
                <SquarePen size={13} /> Update
              </button>
            </div>
            <div className="font-semibold" style={{ color: 'var(--red)' }}>{it.name}</div>
            <div className="text-sm" style={{ color: 'var(--muted)' }}>{it.stock_qty} {it.unit} bacha (alert &le; {it.low_stock_threshold})</div>
          </Card>
        ))}
      </div>

      {editItem && (
        <Modal title={`Update — ${editItem.name}`} onClose={() => setEditItem(null)}>
          <ItemEditForm item={editItem} busy={saveItem.isPending} error={saveItem.error ? apiError(saveItem.error) : ''} onSubmit={(payload) => saveItem.mutate({ id: editItem.id, payload })} />
        </Modal>
      )}
    </div>
  )
}

function ItemEditForm({ item, onSubmit, busy, error }: { item: LowItem; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({
    name: item.name,
    unit: item.unit,
    sale_price: String(item.sale_price / 100),
    stock_qty: String(item.stock_qty),
    low_stock_threshold: String(item.low_stock_threshold),
  })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({ name: form.name, unit: form.unit, sale_price: Number(form.sale_price), stock_qty: Number(form.stock_qty), low_stock_threshold: Number(form.low_stock_threshold) })
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><Input value={form.name} onChange={(e) => set('name', e.target.value)} required /></Field>
        <Field label="Unit"><Input value={form.unit} onChange={(e) => set('unit', e.target.value)} required /></Field>
        <Field label="Rate / unit (Rs)"><Input type="number" step="0.01" min="0" value={form.sale_price} onChange={(e) => set('sale_price', e.target.value)} required /></Field>
        <Field label={`Current stock (${form.unit})`}><Input type="number" step="0.001" min="0" value={form.stock_qty} onChange={(e) => set('stock_qty', e.target.value)} required /></Field>
        <Field label="Low stock alert par"><Input type="number" step="0.001" min="0" value={form.low_stock_threshold} onChange={(e) => set('low_stock_threshold', e.target.value)} /></Field>
      </div>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>Stock manual theek karne ke liye — khareed ke liye Purchases use karein.</p>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Update'}</Button>
    </form>
  )
}
