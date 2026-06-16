import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Badge, Button, Field, Input, Modal, OutstandingNote, PageHeader, Select, Spinner, Table } from '../components/ui'

interface Payment {
  id: string
  reference: string
  direction: string
  party_name?: string
  payment_date: string
  amount: number
  method: string
}

export default function Payments() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [modal, setModal] = useState<'receipt' | 'supplier' | null>(null)
  const { data, isLoading } = useList<Payment>('payments')

  const mutate = useMutation({
    mutationFn: ({ kind, payload }: { kind: string; payload: Record<string, unknown> }) =>
      api.post(kind === 'receipt' ? '/payments/receipt' : '/payments/supplier', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] })
      setModal(null)
    },
  })

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Paisa aana (receipt) aur paisa jana (payment)"
        actions={
          can('payments.manage') && (
            <>
              <Button variant="ghost" onClick={() => setModal('supplier')}>Pay Supplier</Button>
              <Button onClick={() => setModal('receipt')}>Receive Payment</Button>
            </>
          )
        }
      />
      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Ref', 'Date', 'Direction', 'Party', 'Amount', 'Method']}>
          {data?.data.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-3 font-mono text-xs">{p.reference}</td>
              <td className="px-4 py-3">{p.payment_date}</td>
              <td className="px-4 py-3">
                <Badge color={p.direction === 'receipt' ? 'green' : 'red'}>{p.direction === 'receipt' ? 'IN' : 'OUT'}</Badge>
              </td>
              <td className="px-4 py-3">{p.party_name}</td>
              <td className="px-4 py-3">{formatPaisa(p.amount)}</td>
              <td className="px-4 py-3 capitalize">{p.method}</td>
            </tr>
          ))}
        </Table>
      )}
      {modal && (
        <Modal title={modal === 'receipt' ? 'Receive from Customer' : 'Pay Supplier'} onClose={() => setModal(null)}>
          <PaymentForm
            kind={modal}
            onSubmit={(payload) => mutate.mutate({ kind: modal, payload })}
            busy={mutate.isPending}
            error={mutate.error ? apiError(mutate.error) : ''}
          />
        </Modal>
      )}
    </div>
  )
}

function PaymentForm({ kind, onSubmit, busy, error }: { kind: string; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const partyResource = kind === 'receipt' ? 'customers' : 'suppliers'
  const parties = useList<{ id: string; name: string; balance: number }>(partyResource, { per_page: 100 })
  const [form, setForm] = useState({ party: '', payment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })

  const selected = parties.data?.data.find((p) => p.id === form.party)
  const outstandingLabel = kind === 'receipt' ? 'Customer ne dene hain (baqi)' : 'Humne dene hain (baqi)'

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const idKey = kind === 'receipt' ? 'customer_id' : 'supplier_id'
        onSubmit({ [idKey]: form.party, payment_date: form.payment_date, amount: Number(form.amount), method: form.method })
      }}
      className="space-y-3"
    >
      <Field label={kind === 'receipt' ? 'Customer (Grahak)' : 'Supplier (Maal wala)'}>
        <Select value={form.party} onChange={(e) => set('party', e.target.value)} required>
          <option value="">Select…</option>
          {parties.data?.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      {selected && <OutstandingNote label={outstandingLabel} amount={selected.balance} onFill={(rs) => set('amount', String(rs))} />}
      {selected && selected.balance <= 0 ? (
        <p className="text-sm" style={{ color: 'var(--green)' }}>Sab clear — koi baqi nahi.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required /></Field>
            <Field label="Amount (Rs)"><Input type="number" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} required /></Field>
          </div>
          <Field label="Method">
            <Select value={form.method} onChange={(e) => set('method', e.target.value)}>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
            </Select>
          </Field>
        </>
      )}
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy || !form.party || (!!selected && selected.balance <= 0)} className="w-full">{busy ? 'Saving…' : 'Save'}</Button>
    </form>
  )
}
