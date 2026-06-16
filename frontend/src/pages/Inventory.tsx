import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Button, Field, Input, Modal, PageHeader, Select, Spinner, Table } from '../components/ui'

interface Product {
  id: string
  name: string
  stock?: { curing_qty: number; ready_qty: number; damaged_qty: number }
}

export default function Inventory() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [adjusting, setAdjusting] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['finished-goods'],
    queryFn: async () => (await api.get<{ data: Product[] }>('/finished-goods')).data,
  })

  const adjust = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/finished-goods/adjust', p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finished-goods'] })
      setAdjusting(false)
    },
  })

  return (
    <div>
      <PageHeader
        title="Finished Goods"
        subtitle="Curing → Tayar → Kharab maal"
        actions={can('inventory.manage') && <Button onClick={() => setAdjusting(true)}>Stock Adjustment</Button>}
      />
      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Product', 'Curing', 'Ready', 'Damaged']}>
          {data?.data.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-3 font-medium">{p.name}</td>
              <td className="px-4 py-3 text-amber-600">{p.stock?.curing_qty ?? 0}</td>
              <td className="px-4 py-3 font-semibold text-green-600">{p.stock?.ready_qty ?? 0}</td>
              <td className="px-4 py-3 text-red-600">{p.stock?.damaged_qty ?? 0}</td>
            </tr>
          ))}
        </Table>
      )}
      {adjusting && (
        <Modal title="Stock Adjustment" onClose={() => setAdjusting(false)}>
          <AdjustForm products={data?.data ?? []} onSubmit={(p) => adjust.mutate(p)} busy={adjust.isPending} error={adjust.error ? apiError(adjust.error) : ''} />
        </Modal>
      )}
    </div>
  )
}

function AdjustForm({ products, onSubmit, busy, error }: { products: Product[]; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ product_id: '', bucket: 'ready', delta: '', note: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, delta: Number(form.delta) }) }} className="space-y-3">
      <Field label="Product">
        <Select value={form.product_id} onChange={(e) => set('product_id', e.target.value)} required>
          <option value="">Select…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bucket">
          <Select value={form.bucket} onChange={(e) => set('bucket', e.target.value)}>
            <option value="curing">Curing</option>
            <option value="ready">Ready</option>
            <option value="damaged">Damaged</option>
          </Select>
        </Field>
        <Field label="Delta (+/-)"><Input type="number" value={form.delta} onChange={(e) => set('delta', e.target.value)} required /></Field>
      </div>
      <Field label="Note"><Input value={form.note} onChange={(e) => set('note', e.target.value)} /></Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Apply'}</Button>
    </form>
  )
}
