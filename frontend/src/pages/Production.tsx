import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { Badge, Button, Field, Input, Modal, PageHeader, Pagination, Select, Spinner, Table } from '../components/ui'

interface Batch {
  id: string
  reference: string
  product?: { name: string }
  production_date: string
  shift: string
  quantity_produced: number
  status: string
  ready_at: string
}

export default function Production() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState(1)
  const { data, isLoading } = useList<Batch>('production', { page })

  const create = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/production', p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production'] })
      setCreating(false)
    },
  })

  const promote = useMutation({
    mutationFn: () => api.post('/production/promote'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['production'] }),
  })

  const markReady = useMutation({
    mutationFn: (id: string) => api.post(`/production/${id}/mark-ready`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['production'] }),
  })

  return (
    <div>
      <PageHeader
        title="Production"
        subtitle="Roz banaye blocks pehle curing me jate hain, phir tayar"
        actions={
          can('production.manage') && (
            <>
              <Button variant="ghost" onClick={() => promote.mutate()} disabled={promote.isPending}>
                Run Curing Check
              </Button>
              <Button onClick={() => setCreating(true)}>+ Production</Button>
            </>
          )
        }
      />
      {promote.isSuccess && (
        <p className="mb-3 text-sm text-green-600">
          Promoted {(promote.data?.data as { promoted: number })?.promoted ?? 0} batch(es) to ready stock.
        </p>
      )}
      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Ref', 'Date', 'Product', 'Shift', 'Qty', 'Ready On', 'Status', '']}>
          {data?.data.map((b) => (
            <tr key={b.id}>
              <td className="px-4 py-3 font-mono text-xs">{b.reference}</td>
              <td className="px-4 py-3">{b.production_date}</td>
              <td className="px-4 py-3">{b.product?.name}</td>
              <td className="px-4 py-3 capitalize">{b.shift}</td>
              <td className="px-4 py-3">{b.quantity_produced}</td>
              <td className="px-4 py-3">{b.ready_at}</td>
              <td className="px-4 py-3">
                <Badge color={b.status === 'ready' ? 'green' : 'amber'}>{b.status}</Badge>
              </td>
              <td className="px-4 py-3 text-right">
                {can('production.manage') && b.status === 'curing' && (
                  <button
                    className="text-sm font-medium hover:underline disabled:opacity-50"
                    style={{ color: 'var(--green)' }}
                    disabled={markReady.isPending}
                    onClick={() => markReady.mutate(b.id)}
                  >
                    Mark Ready Now
                  </button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pagination meta={data?.meta} page={page} onPage={setPage} />
      {creating && (
        <Modal title="Record Production" onClose={() => setCreating(false)}>
          <ProductionForm onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error ? apiError(create.error) : ''} />
        </Modal>
      )}
    </div>
  )
}

function ProductionForm({ onSubmit, busy, error }: { onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const products = useList<{ id: string; name: string; default_curing_days: number }>('products', { per_page: 100 })
  const [form, setForm] = useState({
    product_id: '', production_date: new Date().toISOString().slice(0, 10), shift: 'day', quantity_produced: '', curing_days: '',
  })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const payload: Record<string, unknown> = {
          product_id: form.product_id,
          production_date: form.production_date,
          shift: form.shift,
          quantity_produced: Number(form.quantity_produced),
        }
        if (form.curing_days !== '') payload.curing_days = Number(form.curing_days)
        onSubmit(payload)
      }}
      className="space-y-3"
    >
      <Field label="Product">
        <Select value={form.product_id} onChange={(e) => set('product_id', e.target.value)} required>
          <option value="">Select…</option>
          {products.data?.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={form.production_date} onChange={(e) => set('production_date', e.target.value)} required /></Field>
        <Field label="Shift">
          <Select value={form.shift} onChange={(e) => set('shift', e.target.value)}>
            <option value="day">Day</option>
            <option value="night">Night</option>
          </Select>
        </Field>
        <Field label="Quantity"><Input type="number" value={form.quantity_produced} onChange={(e) => set('quantity_produced', e.target.value)} required /></Field>
        <Field label="Curing days (blank = default)"><Input type="number" value={form.curing_days} onChange={(e) => set('curing_days', e.target.value)} placeholder="7" /></Field>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Record'}</Button>
    </form>
  )
}
