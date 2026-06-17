import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Badge, Button, Card, Field, Input, MethodField, Modal, MoneyInput, PageHeader, Pagination, Select, Spinner, Table } from '../components/ui'

interface Dispatch {
  id: string
  reference: string
  customer?: { name: string }
  vehicle?: { name: string }
  driver?: { name: string }
  dispatch_date: string
  status: string
}

interface PendingItem { product_id: string; product_name: string; quantity: number }
interface PendingOrder {
  sale_id: string
  invoice_no: string
  sale_date: string
  customer_id: string | null
  customer_name: string
  total: number
  transport_fare: number
  items: PendingItem[]
}

interface Prefill {
  sale_id?: string
  customer_id?: string | null
  trip_rate?: string
  items: { product_id: string; quantity: string }[]
}

export default function DispatchPage() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [prefill, setPrefill] = useState<Prefill | null>(null)
  const [challanId, setChallanId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const { data, isLoading } = useList<Dispatch>('dispatches', { page })
  const pending = useQuery({
    queryKey: ['dispatches-pending'],
    queryFn: async () => (await api.get<{ data: PendingOrder[] }>('/dispatches/pending')).data,
  })

  const create = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/dispatches', p),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['dispatches'] })
      qc.invalidateQueries({ queryKey: ['dispatches-pending'] })
      setFormOpen(false)
      setPrefill(null)
      setChallanId(res.data.data.id)
    },
  })
  const openFromOrder = (o: PendingOrder) => {
    setPrefill({
      sale_id: o.sale_id,
      customer_id: o.customer_id,
      trip_rate: o.transport_fare ? String(o.transport_fare / 100) : '',
      items: o.items.map((i) => ({ product_id: i.product_id, quantity: String(i.quantity) })),
    })
    setFormOpen(true)
  }

  return (
    <div className="space-y-8">
      {/* Pending orders from POS */}
      {can('dispatch.manage') && (
        <div>
          <PageHeader title="Pending Orders" subtitle="POS se aaye orders — abhi tak dispatch nahi hue" />
          {pending.isLoading ? (
            <Spinner />
          ) : pending.data && pending.data.data.length > 0 ? (
            <Table head={['Invoice', 'Date', 'Customer', 'Items', 'Total', '']}>
              {pending.data.data.map((o) => (
                <tr key={o.sale_id}>
                  <td className="px-4 py-3 font-mono text-xs">{o.invoice_no}</td>
                  <td className="px-4 py-3">{o.sale_date}</td>
                  <td className="px-4 py-3">{o.customer_name}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>
                    {o.items.map((i) => `${i.product_name} ×${i.quantity}`).join(', ')}
                  </td>
                  <td className="px-4 py-3">{formatPaisa(o.total)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button onClick={() => openFromOrder(o)} className="!px-3 !py-1 text-xs">Dispatch</Button>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Card><p className="text-sm" style={{ color: 'var(--muted)' }}>Koi pending order nahi — sab dispatch ho gaye.</p></Card>
          )}
        </div>
      )}

      <div>
        <PageHeader
          title="Dispatch / Challan"
          subtitle="POS order ko 'Dispatch' karein — yahan challan ka record"
        />
        {isLoading ? (
          <Spinner />
        ) : (
          <Table head={['Challan', 'Date', 'Customer', 'Vehicle', 'Driver', 'Status', '']}>
            {data?.data.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-3 font-mono text-xs">{d.reference}</td>
                <td className="px-4 py-3">{d.dispatch_date}</td>
                <td className="px-4 py-3">{d.customer?.name ?? '—'}</td>
                <td className="px-4 py-3">{d.vehicle?.name ?? '—'}</td>
                <td className="px-4 py-3">{d.driver?.name ?? '—'}</td>
                <td className="px-4 py-3"><Badge color={d.status === 'delivered' ? 'green' : 'amber'}>{d.status}</Badge></td>
                <td className="px-4 py-3 text-right">
                  <button className="text-sm hover:underline" style={{ color: 'var(--primary)' }} onClick={() => setChallanId(d.id)}>Challan</button>
                </td>
              </tr>
            ))}
          </Table>
        )}
        <Pagination meta={data?.meta} page={page} onPage={setPage} />
      </div>

      {formOpen && (
        <Modal title={prefill?.sale_id ? `Dispatch Order ${''}` : 'New Dispatch'} onClose={() => { setFormOpen(false); setPrefill(null) }}>
          <DispatchForm prefill={prefill} onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error ? apiError(create.error) : ''} />
        </Modal>
      )}
      {challanId && <Challan id={challanId} onClose={() => setChallanId(null)} />}
    </div>
  )
}

function DispatchForm({ prefill, onSubmit, busy, error }: { prefill: Prefill | null; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const customers = useList<{ id: string; name: string }>('customers', { per_page: 100 })
  const drivers = useList<{ id: string; name: string; vehicle_name?: string }>('drivers', { per_page: 100 })
  const products = useList<{ id: string; name: string }>('products', { per_page: 100 })
  const [form, setForm] = useState({
    customer_id: prefill?.customer_id ?? '',
    driver_id: '',
    dispatch_date: new Date().toISOString().slice(0, 10),
    trip_rate: prefill?.trip_rate ?? '',
    trip_paid: '0',
    method: 'cash',
    bank_ref: '',
  })
  const [items, setItems] = useState<{ product_id: string; quantity: string }[]>(
    prefill?.items.length ? prefill.items : [{ product_id: '', quantity: '' }],
  )
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  const driverVehicle = drivers.data?.data.find((d) => d.id === form.driver_id)?.vehicle_name
  const validItems = items.filter((i) => i.product_id && Number(i.quantity) > 0)
  const noDriver = !form.driver_id
  const noFare = !(Number(form.trip_rate) > 0)
  const blockSubmit = noDriver || noFare || validItems.length === 0

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (blockSubmit) return
        onSubmit({
          customer_id: form.customer_id || null,
          driver_id: form.driver_id,
          dispatch_date: form.dispatch_date,
          sale_id: prefill?.sale_id ?? null,
          trip_rate: Number(form.trip_rate),
          trip_paid: Number(form.trip_paid),
          method: form.method,
          bank_ref: form.method === 'bank' ? form.bank_ref : undefined,
          items: validItems.map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity) })),
        })
      }}
      className="space-y-3"
    >
      <Field label="Customer (Grahak)">
        <Select value={form.customer_id} onChange={(e) => set('customer_id', e.target.value)}>
          <option value="">Walk-in</option>
          {customers.data?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>

      <div>
        <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }}>Kitne blocks bhej rahe (qty adjust karo)</span>
        {items.map((it, idx) => {
          const p = products.data?.data.find((x) => x.id === it.product_id)
          const max = prefill?.items.find((x) => x.product_id === it.product_id)?.quantity ?? it.quantity
          return (
            <div key={idx} className="mb-2 flex items-center gap-2">
              <span className="flex-1 text-sm" style={{ color: 'var(--text)' }}>{p?.name ?? '—'}</span>
              <Input
                type="number" min={1} max={Number(max)} value={it.quantity}
                onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))}
                className="w-24"
              />
              <span className="text-xs" style={{ color: 'var(--muted)' }}>/ {max} baqi</span>
            </div>
          )
        })}
        <p className="text-xs" style={{ color: 'var(--muted)' }}>Aik gaari me jitne jayen wo qty rakho — baqi order pending list me rahega.</p>
      </div>

      <Field label="Driver (gaari saath aati hai) — zaroori">
        <Select value={form.driver_id} onChange={(e) => set('driver_id', e.target.value)} required>
          <option value="">Select driver…</option>
          {drivers.data?.data.map((d) => <option key={d.id} value={d.id}>{d.name}{d.vehicle_name ? ` — ${d.vehicle_name}` : ''}</option>)}
        </Select>
      </Field>
      {driverVehicle && <p className="text-xs" style={{ color: 'var(--muted)' }}>Gaari: {driverVehicle}</p>}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Trip kiraya (Rs) — zaroori"><MoneyInput value={form.trip_rate} onChange={(v) => set('trip_rate', v)} /></Field>
        <Field label="Driver ko abhi diya (Rs)"><MoneyInput value={form.trip_paid} onChange={(v) => set('trip_paid', v)} /></Field>
      </div>
      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />

      <Field label="Date"><Input type="date" value={form.dispatch_date} onChange={(e) => set('dispatch_date', e.target.value)} required /></Field>

      {noDriver && <p className="text-sm" style={{ color: 'var(--red)' }}>Driver chunna zaroori hai — challan gaadi par jata hai.</p>}
      {!noDriver && noFare && <p className="text-sm" style={{ color: 'var(--red)' }}>Kiraya (trip rate) likhna zaroori hai.</p>}
      {validItems.length === 0 && <p className="text-sm" style={{ color: 'var(--red)' }}>Kam az kam aik block ki qty daalein.</p>}
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy || blockSubmit} className="w-full">{busy ? 'Saving…' : 'Deliver & Print Challan'}</Button>
    </form>
  )
}

function Challan({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['dispatch', id],
    queryFn: async () => (await api.get(`/dispatches/${id}`)).data.data,
  })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 text-slate-900" onClick={(e) => e.stopPropagation()}>
        {isLoading || !data ? <Spinner /> : (
          <>
            <div className="text-center">
              <img src="/logo.png" alt="Barval" className="mx-auto mb-2 h-16 w-auto object-contain" />
              <p className="text-xs text-slate-500">Dispatch Challan</p>
              <p className="mt-1 font-mono">{data.reference}</p>
            </div>
            <div className="my-3 text-sm">
              <div>Date: {data.dispatch_date}</div>
              <div>Customer: {data.customer?.name ?? '—'}</div>
              <div>Driver: {data.driver?.name ?? '—'} · Gaari: {data.driver?.vehicle_name ?? data.vehicle?.name ?? '—'}{data.driver?.vehicle_plate ? ` (${data.driver.vehicle_plate})` : ''}</div>
            </div>
            <Table head={['Product', 'Qty']}>
              {data.items?.map((it: { id: string; product_name: string; quantity: number }) => (
                <tr key={it.id}><td className="px-4 py-2">{it.product_name}</td><td className="px-4 py-2">{it.quantity}</td></tr>
              ))}
            </Table>
            <p className="mt-4 text-center text-[10px] text-slate-400">Developer: Talha Khan · Phone: 0336-8469404</p>
            <div className="no-print mt-5 flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={onClose}>Close</Button>
              <Button className="flex-1" onClick={() => window.print()}>Print</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
