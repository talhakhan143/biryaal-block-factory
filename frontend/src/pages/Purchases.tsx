import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Badge, Button, Field, Input, MethodField, Modal, MoneyInput, OutstandingNote, PageHeader, Pagination, Select, Spinner, Table } from '../components/ui'

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
  const [page, setPage] = useState(1)
  const [payFor, setPayFor] = useState<Purchase | null>(null)
  const { data, isLoading } = useList<Purchase>('purchases', { page })

  const create = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/purchases', p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] })
      setCreating(false)
    },
  })

  const pay = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.post(`/purchases/${id}/pay`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] })
      setPayFor(null)
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
        <Table head={['Ref', 'Date', 'Supplier', 'Material', 'Qty', 'Total', 'Status', '']}>
          {data?.data.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-3 font-mono text-xs">{p.reference}</td>
              <td className="px-4 py-3">{p.purchase_date}</td>
              <td className="px-4 py-3">{p.supplier?.name}</td>
              <td className="px-4 py-3">{p.raw_material?.name}</td>
              <td className="px-4 py-3">{p.quantity}</td>
              <td className="px-4 py-3">{formatPaisa(p.total_cost)}</td>
              <td className="px-4 py-3"><Badge color={statusColor[p.payment_status]}>{p.payment_status}</Badge></td>
              <td className="px-4 py-3 text-right">
                {can('payments.manage') && p.payment_status !== 'paid' && (
                  <button className="text-sm hover:underline" style={{ color: 'var(--primary)' }} onClick={() => setPayFor(p)}>Pay</button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pagination meta={data?.meta} page={page} onPage={setPage} />
      {payFor && (
        <Modal title={`Pay — ${payFor.reference}`} onClose={() => setPayFor(null)}>
          <PayBillForm
            outstanding={payFor.total_cost - payFor.paid_amount}
            onSubmit={(payload) => pay.mutate({ id: payFor.id, payload })}
            busy={pay.isPending}
            error={pay.error ? apiError(pay.error) : ''}
          />
        </Modal>
      )}
      {creating && (
        <Modal title="New Purchase" onClose={() => setCreating(false)}>
          <PurchaseForm onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error ? apiError(create.error) : ''} />
        </Modal>
      )}
    </div>
  )
}

function PayBillForm({ outstanding, onSubmit, busy, error }: { outstanding: number; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ payment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, amount: Number(form.amount) }) }} className="space-y-3">
      <OutstandingNote label="Is bill ka baqi (supplier ko dena)" amount={outstanding} onFill={(rs) => set('amount', String(rs))} />
      <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required /></Field>
      <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Pay'}</Button>
    </form>
  )
}

function PurchaseForm({ onSubmit, busy, error }: { onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const suppliers = useList<{ id: string; name: string }>('suppliers', { per_page: 100 })
  const materials = useList<{ id: string; name: string; unit: string }>('raw-materials', { per_page: 100 })
  const [form, setForm] = useState({
    supplier_id: '', raw_material_id: '', purchase_date: new Date().toISOString().slice(0, 10),
    quantity: '', unit_cost: '', transport_cost: '0', loading_cost: '0', unloading_cost: '0', paid_amount: '0', method: 'cash', bank_ref: '',
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
        <Field label="Unit cost (Rs)"><MoneyInput value={form.unit_cost} onChange={(v) => set('unit_cost', v)} required /></Field>
        <Field label="Transport (Rs, total)"><MoneyInput value={form.transport_cost} onChange={(v) => set('transport_cost', v)} /></Field>
        <Field label="Loading (Rs, total)"><MoneyInput value={form.loading_cost} onChange={(v) => set('loading_cost', v)} /></Field>
        <Field label="Unloading (Rs, total)"><MoneyInput value={form.unloading_cost} onChange={(v) => set('unloading_cost', v)} /></Field>
        <Field label="Paid now (Rs)"><MoneyInput value={form.paid_amount} onChange={(v) => set('paid_amount', v)} /></Field>
      </div>
      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Record Purchase'}</Button>
    </form>
  )
}
