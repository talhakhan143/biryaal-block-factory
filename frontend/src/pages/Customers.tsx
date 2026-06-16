import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Badge, Button, Field, Input, Modal, PageHeader, Spinner, Table } from '../components/ui'

interface Customer {
  id: string
  name: string
  phone?: string
  balance: number
}

export default function Customers() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const { data, isLoading } = useList<Customer>('customers', { search })

  const create = useMutation({
    mutationFn: (payload: Record<string, string>) => api.post('/customers', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      setCreating(false)
    },
  })

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Grahak — jo humse maal lete hain"
        actions={can('customers.manage') && <Button onClick={() => setCreating(true)}>+ Customer</Button>}
      />

      <div className="mb-4">
        <Input placeholder="Search name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Name', 'Phone', 'Balance (owes us)', '']}>
          {data?.data.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3 font-medium">{c.name}</td>
              <td className="px-4 py-3">{c.phone ?? '—'}</td>
              <td className="px-4 py-3">
                {c.balance > 0 ? <Badge color="amber">{formatPaisa(c.balance)}</Badge> : <Badge color="green">Settled</Badge>}
              </td>
              <td className="px-4 py-3 text-right">
                <button className="text-sm text-blue-600 hover:underline" onClick={() => setLedgerId(c.id)}>
                  Ledger
                </button>
              </td>
            </tr>
          ))}
          {data?.data.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-slate-400">No customers yet.</td>
            </tr>
          )}
        </Table>
      )}

      {creating && (
        <Modal title="New Customer" onClose={() => setCreating(false)}>
          <CustomerForm onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error ? apiError(create.error) : ''} />
        </Modal>
      )}

      {ledgerId && <LedgerModal id={ledgerId} onClose={() => setLedgerId(null)} />}
    </div>
  )
}

function CustomerForm({ onSubmit, busy, error }: { onSubmit: (p: Record<string, string>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ name: '', phone: '', address: '' })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(form)
      }}
      className="space-y-3"
    >
      <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
      <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
      <Field label="Address"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save'}</Button>
    </form>
  )
}

function LedgerModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['customer-ledger', id],
    queryFn: async () => (await api.get(`/customers/${id}/ledger`)).data,
  })
  return (
    <Modal title="Customer Ledger" onClose={onClose}>
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <div>
          <div className="mb-3 text-sm">
            {data.customer.name} — Balance: <strong>{formatPaisa(data.balance)}</strong>
          </div>
          <Table head={['Date', 'Ref', 'Desc', 'Debit', 'Credit']}>
            {data.rows.map((r: Record<string, string | number>, i: number) => (
              <tr key={i}>
                <td className="px-4 py-2">{r.date}</td>
                <td className="px-4 py-2">{r.reference}</td>
                <td className="px-4 py-2">{r.description}</td>
                <td className="px-4 py-2">{r.debit ? formatPaisa(Number(r.debit)) : '—'}</td>
                <td className="px-4 py-2">{r.credit ? formatPaisa(Number(r.credit)) : '—'}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Modal>
  )
}
