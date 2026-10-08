import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { ArrowRight, BookText, HandCoins } from 'lucide-react'
import { Badge, Button, type Column, DataTable, Field, IconButton, Input, MethodField, Modal, MoneyInput, OutstandingNote, PageHeader, RowActions, Spinner, Table } from '../components/ui'
import CustomerForm from '../components/CustomerForm'
import { MONEY_KEYS } from '../lib/queryKeys'

interface Customer {
  id: string
  name: string
  phone?: string
  balance: number
  /** Minus balance = customer ka paisa hamare paas pada hai. */
  advance: number
  created_at?: string
}

export default function Customers() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const onlyAdvance = params.get('advance') === '1'
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('created_at')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [creating, setCreating] = useState(false)
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const [receiveFor, setReceiveFor] = useState<Customer | null>(null)
  const { data, isLoading } = useList<Customer>('customers', { search, page, sort, dir, has_advance: onlyAdvance ? 1 : undefined })

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir(key === 'created_at' ? 'desc' : 'asc') }
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
      MONEY_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      setReceiveFor(null)
    },
  })

  const columns: Column<Customer>[] = [
    { key: 'name', label: 'Name', sortable: true, render: (c) => <span className="font-medium">{c.name}</span> },
    { key: 'phone', label: 'Phone', sortable: true, render: (c) => c.phone ?? '—' },
    {
      key: 'balance', label: 'Haal', sortable: true, align: 'right',
      render: (c) => (
        c.balance > 0 ? <Badge color="amber">Lena hai {formatPaisa(c.balance)}</Badge>
          : c.advance > 0 ? <Badge color="green">Advance jama {formatPaisa(c.advance)}</Badge>
            : <Badge color="green">Sab clear</Badge>
      ),
    },
    { key: 'created_at', label: 'Kab bana', sortable: true, render: (r) => (r.created_at ? String(r.created_at).slice(0, 10) : '·') },
    {
      key: 'actions', label: '', align: 'right', render: (c) => (
        // Apna click rakhte hain, warna row wala click bhi chal jata hai.
        <div onClick={(e) => e.stopPropagation()}>
          <RowActions>
            {can('payments.receive') && c.balance > 0 && <IconButton icon={HandCoins} label="Receive" tone="green" onClick={() => setReceiveFor(c)} />}
            <IconButton icon={BookText} label="Khata (quick)" onClick={() => setLedgerId(c.id)} />
            <IconButton icon={ArrowRight} label="Poori history" tone="primary" onClick={() => navigate(`/customers/${c.id}`)} />
          </RowActions>
        </div>
      ),
    },
  ]

  return (
    <div>
      {onlyAdvance && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ background: 'color-mix(in srgb, var(--amber) 14%, transparent)', color: 'var(--amber)' }}
          >
            Sirf wo jinhon ne advance diya hai
          </span>
          <button
            onClick={() => { setParams(new URLSearchParams(), { replace: true }); setPage(1) }}
            className="text-xs font-medium underline"
            style={{ color: 'var(--primary)' }}
          >
            Saare customers
          </button>
        </div>
      )}

      <PageHeader
        title="Customers"
        subtitle="Grahak. Kisi bhi naam par click karein, uski poori history khul jayegi"
        actions={can('customers.manage') && <Button onClick={() => setCreating(true)}>+ Customer</Button>}
      />

      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading}
        emptyText={onlyAdvance ? 'Kisi customer ka advance jama nahi.' : 'Abhi koi customer nahi.'}
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Name ya phone se search…"
        sort={sort}
        dir={dir}
        onSort={onSort}
        meta={data?.meta}
        page={page}
        onPage={setPage}
        onRowClick={(c) => navigate(`/customers/${c.id}`)}
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
          <Table head={['Date', 'Ref', 'Desc', { label: 'Debit', align: 'right' }, { label: 'Credit', align: 'right' }]}>
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
