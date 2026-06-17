import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Pagination, Select, Spinner, Table } from '../components/ui'

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
  items: PendingItem[]
}

interface Prefill {
  sale_id?: string
  customer_id?: string | null
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
  const deliver = useMutation({
    mutationFn: (id: string) => api.post(`/dispatches/${id}/deliver`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dispatches'] }),
  })

  const openBlank = () => { setPrefill(null); setFormOpen(true) }
  const openFromOrder = (o: PendingOrder) => {
    setPrefill({
      sale_id: o.sale_id,
      customer_id: o.customer_id,
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
          subtitle="Delivery ka record aur challan print"
          actions={can('dispatch.manage') && <Button variant="ghost" onClick={openBlank}>+ Manual Dispatch</Button>}
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
                <td className="px-4 py-3 text-right space-x-3">
                  <button className="text-sm hover:underline" style={{ color: 'var(--primary)' }} onClick={() => setChallanId(d.id)}>Challan</button>
                  {can('dispatch.manage') && d.status !== 'delivered' && (
                    <button className="text-sm hover:underline" style={{ color: 'var(--green)' }} onClick={() => deliver.mutate(d.id)}>Deliver</button>
                  )}
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
  const vehicles = useList<{ id: string; name: string }>('vehicles', { per_page: 100 })
  const drivers = useList<{ id: string; name: string }>('drivers', { per_page: 100 })
  const products = useList<{ id: string; name: string }>('products', { per_page: 100 })
  const [form, setForm] = useState({
    customer_id: prefill?.customer_id ?? '',
    vehicle_id: '',
    driver_id: '',
    dispatch_date: new Date().toISOString().slice(0, 10),
  })
  const [items, setItems] = useState<{ product_id: string; quantity: string }[]>(
    prefill?.items.length ? prefill.items : [{ product_id: '', quantity: '' }],
  )
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({
          ...form,
          customer_id: form.customer_id || null,
          vehicle_id: form.vehicle_id || null,
          driver_id: form.driver_id || null,
          sale_id: prefill?.sale_id ?? null,
          items: items.filter((i) => i.product_id && i.quantity).map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity) })),
        })
      }}
      className="space-y-3"
    >
      {prefill?.sale_id && (
        <p className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}>
          POS order se bhara gaya — items edit kar sakte ho, gaari/driver chuno.
        </p>
      )}
      <Field label="Customer">
        <Select value={form.customer_id} onChange={(e) => set('customer_id', e.target.value)}>
          <option value="">Walk-in / none</option>
          {customers.data?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vehicle (gaari)">
          <Select value={form.vehicle_id} onChange={(e) => set('vehicle_id', e.target.value)}>
            <option value="">—</option>
            {vehicles.data?.data.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
        </Field>
        <Field label="Driver">
          <Select value={form.driver_id} onChange={(e) => set('driver_id', e.target.value)}>
            <option value="">—</option>
            {drivers.data?.data.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Date"><Input type="date" value={form.dispatch_date} onChange={(e) => set('dispatch_date', e.target.value)} required /></Field>

      <div>
        <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }}>Items</span>
        {items.map((it, idx) => (
          <div key={idx} className="mb-2 flex gap-2">
            <Select value={it.product_id} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, product_id: e.target.value } : x)))}>
              <option value="">Product…</option>
              {products.data?.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Input type="number" placeholder="Qty" value={it.quantity} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))} className="w-24" />
            {items.length > 1 && <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} style={{ color: 'var(--red)' }}>✕</button>}
          </div>
        ))}
        <button type="button" className="text-sm" style={{ color: 'var(--primary)' }} onClick={() => setItems([...items, { product_id: '', quantity: '' }])}>+ Add item</button>
      </div>

      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Create & View Challan'}</Button>
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
              <h2 className="text-lg font-bold">Barval Block Factory</h2>
              <p className="text-xs text-slate-500">Dispatch Challan</p>
              <p className="mt-1 font-mono">{data.reference}</p>
            </div>
            <div className="my-3 text-sm">
              <div>Date: {data.dispatch_date}</div>
              <div>Customer: {data.customer?.name ?? '—'}</div>
              <div>Vehicle: {data.vehicle?.name ?? '—'} · Driver: {data.driver?.name ?? '—'}</div>
            </div>
            <Table head={['Product', 'Qty']}>
              {data.items?.map((it: { id: string; product_name: string; quantity: number }) => (
                <tr key={it.id}><td className="px-4 py-2">{it.product_name}</td><td className="px-4 py-2">{it.quantity}</td></tr>
              ))}
            </Table>
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
