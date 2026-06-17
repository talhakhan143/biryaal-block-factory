import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Button, Field, Input, MethodField, Modal, MoneyInput, PageHeader, Select, Spinner, Table } from '../components/ui'

interface Adjustment {
  id: string
  reference: string
  mode: string
  party_name?: string
  adjustment_date: string
  amount: number
  reason: string
}

const MODES = [
  { key: 'customer_discount', label: 'Customer ko discount / kami (dues kam)' },
  { key: 'customer_charge', label: 'Customer pe extra charge (dues zyada)' },
  { key: 'supplier_discount', label: 'Supplier discount mila (hamari dues kam)' },
  { key: 'supplier_charge', label: 'Supplier extra (hamari dues zyada)' },
  { key: 'cash_out', label: 'Cash kharcha / diya (OUT)' },
  { key: 'cash_in', label: 'Cash aamdani / mila (IN)' },
]

const modeLabel = (m: string) => MODES.find((x) => x.key === m)?.label ?? m

export default function Adjustments() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['adjustments'],
    queryFn: async () => (await api.get<{ data: Adjustment[] }>('/adjustments')).data,
  })

  const create = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/adjustments', p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['adjustments'] }); setCreating(false) },
  })

  return (
    <div>
      <PageHeader
        title="Adjustments"
        subtitle="Bill/dues ya cash ka adjustment — sab jaga balanced plus-minus"
        actions={can('payments.manage') && <Button onClick={() => setCreating(true)}>+ Adjustment</Button>}
      />
      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Ref', 'Date', 'Type', 'Party', 'Amount', 'Reason']}>
          {data?.data.map((a) => (
            <tr key={a.id}>
              <td className="px-4 py-3 font-mono text-xs">{a.reference}</td>
              <td className="px-4 py-3">{a.adjustment_date}</td>
              <td className="px-4 py-3 text-xs">{modeLabel(a.mode)}</td>
              <td className="px-4 py-3">{a.party_name ?? '—'}</td>
              <td className="px-4 py-3">{formatPaisa(a.amount)}</td>
              <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>{a.reason}</td>
            </tr>
          ))}
          {data?.data.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-6 text-center" style={{ color: 'var(--muted)' }}>Koi adjustment nahi.</td></tr>
          )}
        </Table>
      )}
      {creating && (
        <Modal title="New Adjustment" onClose={() => setCreating(false)}>
          <AdjForm onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error ? apiError(create.error) : ''} />
        </Modal>
      )}
    </div>
  )
}

function AdjForm({ onSubmit, busy, error }: { onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ mode: 'customer_discount', party_id: '', adjustment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '', reason: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  const isCustomer = form.mode.startsWith('customer_')
  const isSupplier = form.mode.startsWith('supplier_')
  const isCash = form.mode === 'cash_in' || form.mode === 'cash_out'
  const customers = useList<{ id: string; name: string }>('customers', { per_page: 100 })
  const suppliers = useList<{ id: string; name: string }>('suppliers', { per_page: 100 })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({
          mode: form.mode,
          party_id: isCustomer || isSupplier ? form.party_id : undefined,
          adjustment_date: form.adjustment_date,
          amount: Number(form.amount),
          method: isCash ? form.method : undefined,
          bank_ref: isCash && form.method === 'bank' ? form.bank_ref : undefined,
          reason: form.reason,
        })
      }}
      className="space-y-3"
    >
      <Field label="Kis cheez ka adjustment?">
        <Select value={form.mode} onChange={(e) => set('mode', e.target.value)}>
          {MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </Select>
      </Field>
      {isCustomer && (
        <Field label="Customer">
          <Select value={form.party_id} onChange={(e) => set('party_id', e.target.value)} required>
            <option value="">Select…</option>
            {customers.data?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      )}
      {isSupplier && (
        <Field label="Supplier">
          <Select value={form.party_id} onChange={(e) => set('party_id', e.target.value)} required>
            <option value="">Select…</option>
            {suppliers.data?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={form.adjustment_date} onChange={(e) => set('adjustment_date', e.target.value)} required /></Field>
        <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
      </div>
      {isCash && <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />}
      <Field label="Reason (wajah)"><Input value={form.reason} onChange={(e) => set('reason', e.target.value)} required placeholder="e.g. bill zyada bana tha" /></Field>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save Adjustment'}</Button>
    </form>
  )
}
