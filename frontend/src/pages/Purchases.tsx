import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Spinner, Table } from '../components/ui'

interface Purchase {
  id: string
  reference: string
  supplier?: { name: string }
  raw_material?: { name: string }
  purchase_date: string
  quantity: number
  total_cost: number
  paid_amount: number
  payment_status: string
}

const statusColor: Record<string, string> = { paid: 'green', partial: 'amber', unpaid: 'red' }

export default function Purchases() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const { data, isLoading } = useList<Purchase>('purchases')

  const create = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/purchases', p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] })
      setCreating(false)
    },
  })

  return (
    <div>
      <PageHeader
        title="Material Purchases"
        subtitle="Kacha maal khareedna — kharcha aur udhaar"
        actions={can('purchases.manage') && <Button onClick={() => setCreating(true)}>+ Purchase</Button>}
      />
      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Ref', 'Date', 'Supplier', 'Material', 'Qty', 'Total', 'Status']}>
          {data?.data.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-3 font-mono text-xs">{p.reference}</td>
              <td className="px-4 py-3">{p.purchase_date}</td>
              <td className="px-4 py-3">{p.supplier?.name}</td>
              <td className="px-4 py-3">{p.raw_material?.name}</td>
              <td className="px-4 py-3">{p.quantity}</td>
              <td className="px-4 py-3">{formatPaisa(p.total_cost)}</td>
              <td className="px-4 py-3"><Badge color={statusColor[p.payment_status]}>{p.payment_status}</Badge></td>
            </tr>
          ))}
        </Table>
      )}
      {creating && (
        <Modal title="New Purchase" onClose={() => setCreating(false)}>
          <PurchaseForm onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error ? apiError(create.error) : ''} />
        </Modal>
      )}
    </div>
  )
}

function PurchaseForm({ onSubmit, busy, error }: { onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const suppliers = useList<{ id: string; name: string }>('suppliers', { per_page: 100 })
  const materials = useList<{ id: string; name: string; unit: string }>('raw-materials', { per_page: 100 })
  const [form, setForm] = useState({
    supplier_id: '', raw_material_id: '', purchase_date: new Date().toISOString().slice(0, 10),
    quantity: '', unit_cost: '', transport_cost: '0', loading_cost: '0', unloading_cost: '0', paid_amount: '0', method: 'cash',
  })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({
          ...form,
          quantity: Number(form.quantity),
          unit_cost: Number(form.unit_cost),
          transport_cost: Number(form.transport_cost),
          loading_cost: Number(form.loading_cost),
          unloading_cost: Number(form.unloading_cost),
          paid_amount: Number(form.paid_amount),
        })
      }}
      className="space-y-3"
    >
      <Field label="Supplier">
        <Select value={form.supplier_id} onChange={(e) => set('supplier_id', e.target.value)} required>
          <option value="">Select…</option>
          {suppliers.data?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
      <Field label="Material">
        <Select value={form.raw_material_id} onChange={(e) => set('raw_material_id', e.target.value)} required>
          <option value="">Select…</option>
          {materials.data?.data.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={form.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} required /></Field>
        <Field label="Quantity"><Input type="number" step="0.001" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} required /></Field>
        <Field label="Unit cost (Rs)"><Input type="number" step="0.01" value={form.unit_cost} onChange={(e) => set('unit_cost', e.target.value)} required /></Field>
        <Field label="Transport (Rs)"><Input type="number" step="0.01" value={form.transport_cost} onChange={(e) => set('transport_cost', e.target.value)} /></Field>
        <Field label="Loading (Rs)"><Input type="number" step="0.01" value={form.loading_cost} onChange={(e) => set('loading_cost', e.target.value)} /></Field>
        <Field label="Unloading (Rs)"><Input type="number" step="0.01" value={form.unloading_cost} onChange={(e) => set('unloading_cost', e.target.value)} /></Field>
        <Field label="Paid now (Rs)"><Input type="number" step="0.01" value={form.paid_amount} onChange={(e) => set('paid_amount', e.target.value)} /></Field>
        <Field label="Method">
          <Select value={form.method} onChange={(e) => set('method', e.target.value)}>
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
          </Select>
        </Field>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Record Purchase'}</Button>
    </form>
  )
}
