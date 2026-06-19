import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { BookText, HandCoins } from 'lucide-react'
import { Badge, Button, type Column, DataTable, Field, IconButton, Input, MethodField, Modal, MoneyInput, OutstandingNote, PageHeader, RowActions, Spinner, Table } from '../components/ui'

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
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('name')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [creating, setCreating] = useState(false)
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const [receiveFor, setReceiveFor] = useState<Customer | null>(null)
  const { data, isLoading } = useList<Customer>('customers', { search, page, sort, dir })

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('asc') }
    setPage(1)
  }

  const create = useMutation({
    mutationFn: (payload: Record<string, string>) => api.post('/customers', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      setCreating(false)
    },
  })

  const receive = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/payments/receipt', payload),
    onSuccess: () => {
      ['customers', 'sales', 'payments', 'payables', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      setReceiveFor(null)
    },
  })

  const columns: Column<Customer>[] = [
    { key: 'name', label: 'Name', sortable: true, render: (c) => <span className="font-medium">{c.name}</span> },
    { key: 'phone', label: 'Phone', sortable: true, render: (c) => c.phone ?? '—' },
    { key: 'balance', label: 'Balance (owes us)', sortable: true, align: 'right', render: (c) => (c.balance > 0 ? <Badge color="amber">{formatPaisa(c.balance)}</Badge> : <Badge color="green">Settled</Badge>) },
    {
      key: 'actions', label: '', align: 'right', render: (c) => (
        <RowActions>
          {can('payments.manage') && c.balance > 0 && <IconButton icon={HandCoins} label="Receive" tone="green" onClick={() => setReceiveFor(c)} />}
          <IconButton icon={BookText} label="Ledger" onClick={() => setLedgerId(c.id)} />
        </RowActions>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Grahak — jo humse maal lete hain"
        actions={can('customers.manage') && <Button onClick={() => setCreating(true)}>+ Customer</Button>}
      />

      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading}
        emptyText="No customers yet."
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Name ya phone se search…"
        sort={sort}
        dir={dir}
        onSort={onSort}
        meta={data?.meta}
        page={page}
        onPage={setPage}
      />

      {creating && (
        <Modal title="New Customer" onClose={() => setCreating(false)}>
          <CustomerForm onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error ? apiError(create.error) : ''} />
        </Modal>
      )}

      {ledgerId && <LedgerModal id={ledgerId} onClose={() => setLedgerId(null)} />}

      {receiveFor && (
        <Modal title={`Receive — ${receiveFor.name}`} onClose={() => setReceiveFor(null)}>
          <ReceiveForm
            outstanding={receiveFor.balance}
            onSubmit={(payload) => receive.mutate({ ...payload, customer_id: receiveFor.id })}
            busy={receive.isPending}
            error={receive.error ? apiError(receive.error) : ''}
          />
        </Modal>
      )}
    </div>
  )
}

function ReceiveForm({ outstanding, onSubmit, busy, error }: { outstanding: number; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ payment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, amount: Number(form.amount) }) }} className="space-y-3">
      <OutstandingNote label="Customer se lena (total baqi)" amount={outstanding} onFill={(rs) => set('amount', String(rs))} />
      <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required /></Field>
      <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Receive'}</Button>
    </form>
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
