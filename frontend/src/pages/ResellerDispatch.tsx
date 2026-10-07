import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { FileText } from 'lucide-react'
import { Badge, Button, Card, type Column, DataTable, Field, IconButton, Input, MethodField, Modal, MoneyInput, PageHeader, RowActions, Select, Spinner, PagedTable } from '../components/ui'
import InvoiceSheet from '../components/InvoiceSheet'

interface Dispatch {
  id: string
  reference: string
  customer?: { name: string }
  vehicle?: { name?: string; plate_no?: string }
  driver?: { name: string }
  dispatch_date: string
  status: string
}

interface PendingItem { reseller_item_id: string; item_name: string; unit: string; quantity: number }
interface PendingOrder {
  reseller_sale_id: string
  invoice_no: string
  sale_date: string
  customer_id: string | null
  customer_name: string
  total: number
  transport_fare: number
  items: PendingItem[]
}
interface Prefill {
  reseller_sale_id: string
  customer_id: string | null
  trip_rate: string
  items: { reseller_item_id: string; item_name: string; unit: string; quantity: string; max: number }[]
}

export default function ResellerDispatch() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [prefill, setPrefill] = useState<Prefill | null>(null)
  const [challanId, setChallanId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('dispatch_date')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const { data, isLoading } = useList<Dispatch>('reseller/dispatches', { page, search, sort, dir })
  const manage = can('reseller.manage')

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }
  const pending = useQuery({
    queryKey: ['reseller/dispatches-pending'],
    queryFn: async () => (await api.get<{ data: PendingOrder[] }>('/reseller/dispatches/pending')).data,
  })

  const create = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/reseller/dispatches', p),
    onSuccess: (res) => {
      ['reseller/dispatches', 'reseller/dispatches-pending', 'reseller/dashboard', 'reseller/payables', 'reseller/payments'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      setFormOpen(false); setPrefill(null); setChallanId(res.data.data.id)
    },
  })
  const openFromOrder = (o: PendingOrder) => {
    setPrefill({
      reseller_sale_id: o.reseller_sale_id,
      customer_id: o.customer_id,
      trip_rate: o.transport_fare ? String(o.transport_fare / 100) : '',
      items: o.items.map((i) => ({ reseller_item_id: i.reseller_item_id, item_name: i.item_name, unit: i.unit, quantity: String(i.quantity), max: i.quantity })),
    })
    setFormOpen(true)
  }

  return (
    <div className="space-y-8">
      {manage && (
        <div>
          <PageHeader title="Pending Orders" subtitle="Farokht jo abhi tak deliver nahi hui" />
          {pending.isLoading ? <Spinner /> : pending.data && pending.data.data.length > 0 ? (
            <PagedTable
              head={['Invoice', 'Date', 'Customer', 'Items', { label: 'Total', align: 'right' }, '']}
              rows={pending.data.data}
              searchText={(o: PendingOrder) => `${o.invoice_no} ${o.customer_name} ${o.sale_date}`}
              searchPlaceholder="Invoice ya customer se dhoondein…"
              emptyText="Koi pending order nahi."
              row={(o: PendingOrder) => (
              
                <tr key={o.reseller_sale_id}>
                  <td className="px-4 py-3 font-mono text-xs">{o.invoice_no}</td>
                  <td className="px-4 py-3">{o.sale_date}</td>
                  <td className="px-4 py-3">{o.customer_name}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>{o.items.map((i) => `${i.item_name} ×${i.quantity}`).join(', ')}</td>
                  <td className="px-4 py-3">{formatPaisa(o.total)}</td>
                  <td className="px-4 py-3 text-right"><Button onClick={() => openFromOrder(o)} className="!px-3 !py-1 text-xs">Dispatch</Button></td>
                </tr>
              )}
            />
          ) : (
            <Card><p className="text-sm" style={{ color: 'var(--muted)' }}>Koi pending order nahi — sab deliver ho gaye.</p></Card>
          )}
        </div>
      )}

      <div>
        <PageHeader title="Dispatch / Challan" subtitle="Farokht ko deliver karein — challan ka record" />
        <DataTable
          columns={[
            { key: 'reference', label: 'Challan', sortable: true, render: (d) => <span className="font-mono text-xs">{d.reference}</span> },
            { key: 'dispatch_date', label: 'Date', sortable: true, render: (d) => d.dispatch_date },
            { key: 'customer', label: 'Customer', render: (d) => d.customer?.name ?? '—' },
            { key: 'driver', label: 'Driver', render: (d) => d.driver?.name ?? '—' },
            { key: 'status', label: 'Status', sortable: true, render: (d) => <Badge color={d.status === 'delivered' ? 'green' : 'amber'}>{d.status}</Badge> },
            { key: 'actions', label: '', align: 'right', render: (d) => <RowActions><IconButton icon={FileText} label="Challan" tone="primary" onClick={() => setChallanId(d.id)} /></RowActions> },
          ] as Column<Dispatch>[]}
          rows={data?.data} loading={isLoading} emptyText="Koi challan nahi."
          search={search} onSearch={(v) => { setSearch(v); setPage(1) }} searchPlaceholder="Challan, customer ya driver se search…"
          sort={sort} dir={dir} onSort={onSort} meta={data?.meta} page={page} onPage={setPage}
        />
      </div>

      {formOpen && prefill && (
        <Modal title="Naya Challan" onClose={() => { setFormOpen(false); setPrefill(null) }}>
          <DispatchForm prefill={prefill} onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error ? apiError(create.error) : ''} />
        </Modal>
      )}
      {challanId && <Challan id={challanId} onClose={() => setChallanId(null)} />}
    </div>
  )
}

function DispatchForm({ prefill, onSubmit, busy, error }: { prefill: Prefill; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const drivers = useList<{ id: string; name: string; vehicle_name?: string }>('drivers', { per_page: 100 })
  const vehicles = useList<{ id: string; name?: string; plate_no?: string }>('vehicles', { per_page: 100 })
  const [form, setForm] = useState({ driver_id: '', vehicle_id: '', dispatch_date: new Date().toISOString().slice(0, 10), trip_rate: prefill.trip_rate, trip_paid: '0', method: 'cash', bank_ref: '' })
  const [items, setItems] = useState(prefill.items)
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  const validItems = items.filter((i) => Number(i.quantity) > 0)
  const blockSubmit = !form.driver_id || validItems.length === 0

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (blockSubmit) return
        onSubmit({
          reseller_sale_id: prefill.reseller_sale_id,
          customer_id: prefill.customer_id,
          driver_id: form.driver_id,
          vehicle_id: form.vehicle_id || null,
          dispatch_date: form.dispatch_date,
          trip_rate: Number(form.trip_rate) || 0,
          trip_paid: Number(form.trip_paid) || 0,
          method: form.method,
          bank_ref: form.method === 'bank' ? form.bank_ref : undefined,
          items: validItems.map((i) => ({ reseller_item_id: i.reseller_item_id, quantity: Number(i.quantity) })),
        })
      }}
      className="space-y-3"
    >
      <div>
        <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }}>Kitna maal bhej rahe (qty adjust karo)</span>
        {items.map((it, idx) => (
          <div key={idx} className="mb-2 flex items-center gap-2">
            <span className="flex-1 text-sm" style={{ color: 'var(--text)' }}>{it.item_name}</span>
            <Input type="number" min={0} max={it.max} value={it.quantity} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))} className="w-24" />
            <span className="text-xs" style={{ color: 'var(--muted)' }}>/ {it.max} {it.unit} baqi</span>
          </div>
        ))}
        <p className="text-xs" style={{ color: 'var(--muted)' }}>Ek gaari me jitna jaye wo qty rakho — baqi order pending list me rahega.</p>
      </div>

      <Field label="Driver (gaadi saath) — zaroori">
        <Select value={form.driver_id} onChange={(e) => set('driver_id', e.target.value)} required>
          <option value="">Select driver…</option>
          {drivers.data?.data.map((d) => <option key={d.id} value={d.id}>{d.name}{d.vehicle_name ? ` — ${d.vehicle_name}` : ''}</option>)}
        </Select>
      </Field>
      <Field label="Vehicle (optional)">
        <Select value={form.vehicle_id} onChange={(e) => set('vehicle_id', e.target.value)}>
          <option value="">—</option>
          {vehicles.data?.data.map((v) => <option key={v.id} value={v.id}>{v.plate_no ?? v.name}</option>)}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Trip kiraya (Rs)"><MoneyInput value={form.trip_rate} onChange={(v) => set('trip_rate', v)} /></Field>
        <Field label="Driver ko abhi diya (Rs)"><MoneyInput value={form.trip_paid} onChange={(v) => set('trip_paid', v)} /></Field>
      </div>
      {Number(form.trip_paid) > 0 && <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />}

      <Field label="Date"><Input type="date" value={form.dispatch_date} onChange={(e) => set('dispatch_date', e.target.value)} required /></Field>

      {!form.driver_id && <p className="text-sm" style={{ color: 'var(--red)' }}>Driver chunna zaroori hai.</p>}
      {validItems.length === 0 && <p className="text-sm" style={{ color: 'var(--red)' }}>Kam az kam ek item ki qty daalein.</p>}
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy || blockSubmit} className="w-full">{busy ? 'Saving…' : 'Deliver & Print Challan'}</Button>
    </form>
  )
}

function Challan({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['reseller/dispatches', id],
    queryFn: async () => (await api.get(`/reseller/dispatches/${id}`)).data.data,
  })
  if (isLoading || !data) {
    return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}><Spinner /></div>
  }
  const gaadi = data.vehicle?.plate_no ?? data.vehicle?.name ?? data.driver?.vehicle_name ?? '—'
  const details = [
    `Invoice: ${data.invoice_no ?? '—'}`,
    `Driver: ${data.driver?.name ?? '—'} · Gaadi: ${gaadi}`,
    ...(data.trip_rate > 0 ? [`Kiraya: ${formatPaisa(data.trip_rate)} · Diya: ${formatPaisa(data.trip_paid)} · Baqi: ${formatPaisa(data.trip_balance)}`] : []),
  ]
  return (
    <InvoiceSheet
      subtitle="Resellers Point"
      docType="Dispatch Challan"
      number={data.reference}
      date={data.dispatch_date}
      customer={data.customer?.name ?? 'Walk-in'}
      details={details}
      showRates={false}
      lines={(data.items ?? []).map((it: { item_name: string; unit: string; quantity: number }) => ({ name: it.item_name, qty: `${it.quantity} ${it.unit}` }))}
      onClose={onClose}
    />
  )
}
