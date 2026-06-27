import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Coins, HandCoins, Wallet } from 'lucide-react'
import { AdvanceForm, Badge, Button, type Column, DataTable, Field, IconButton, Input, MethodField, Modal, MoneyInput, OutstandingNote, PageHeader, Pagination, RowActions, Select, Spinner, Table } from '../components/ui'

interface Payment {
  id: string
  reference: string
  direction: string
  party_name?: string
  payment_date: string
  amount: number
  method: string
  bank_ref?: string
}

interface Party { id: string; name: string; balance: number }
type PayableType = 'supplier' | 'driver' | 'labourer' | 'salary'
interface Payable { type: PayableType; id: string; name: string; balance: number }
interface Advance { type: PayableType; id: string; name: string; advance: number }

// Only labour & driver advances can be topped up (they have an advance endpoint).
const advanceUrl = (row: Advance) =>
  row.type === 'driver' ? `/drivers/${row.id}/advance`
    : row.type === 'labourer' ? `/labourers/${row.id}/advance`
    : null

const payUrl = (row: Payable) =>
  row.type === 'driver' ? `/drivers/${row.id}/pay`
    : row.type === 'labourer' ? `/labourers/${row.id}/pay`
    : row.type === 'salary' ? `/salaries/${row.id}/pay`
    : '/payments/supplier'

const typeLabel: Record<PayableType, string> = { supplier: 'Supplier', driver: 'Driver', labourer: 'Mazdoor', salary: 'Staff' }

export default function Payments() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [modal, setModal] = useState<'receipt' | 'supplier' | null>(null)
  const [preset, setPreset] = useState<string>('')
  const [settle, setSettle] = useState<Payable | null>(null)
  const [topUp, setTopUp] = useState<Advance | null>(null)
  const [page, setPage] = useState(1)
  const [recvPage, setRecvPage] = useState(1)
  const [payPage, setPayPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('payment_date')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const { data, isLoading } = useList<Payment>('payments', { page, search, sort, dir })

  const onSortHist = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }

  const histColumns: Column<Payment>[] = [
    { key: 'reference', label: 'Ref', sortable: true, render: (p) => <span className="font-mono text-xs">{p.reference}</span> },
    { key: 'payment_date', label: 'Date', sortable: true, render: (p) => p.payment_date },
    { key: 'direction', label: 'Direction', sortable: true, render: (p) => <Badge color={p.direction === 'receipt' ? 'green' : 'red'}>{p.direction === 'receipt' ? 'IN' : 'OUT'}</Badge> },
    { key: 'party', label: 'Party', render: (p) => p.party_name },
    { key: 'amount', label: 'Amount', sortable: true, align: 'right', render: (p) => formatPaisa(p.amount) },
    { key: 'method', label: 'Method', sortable: true, render: (p) => <Badge color={p.method === 'bank' ? 'blue' : 'slate'}>{p.method}</Badge> },
    { key: 'bank_ref', label: 'Bank / ref', render: (p) => <span className="text-xs" style={{ color: 'var(--muted)' }}>{p.bank_ref ?? '—'}</span> },
  ]
  const recv = useList<Party>('customers', { has_dues: 1, page: recvPage })
  const payables = useQuery({
    queryKey: ['payables'],
    queryFn: async () => (await api.get<{ data: Payable[] }>('/payments/payables')).data.data,
  })
  const advances = useQuery({
    queryKey: ['advances'],
    queryFn: async () => (await api.get<{ data: Advance[] }>('/payments/advances')).data.data,
  })

  const invalidateAll = () => {
    ['payments', 'payables', 'advances', 'customers', 'suppliers', 'drivers', 'labourers', 'salaries', 'dashboard', 'sales', 'purchases', 'transport-trips'].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }))
  }

  const mutate = useMutation({
    mutationFn: ({ kind, payload }: { kind: string; payload: Record<string, unknown> }) =>
      api.post(kind === 'receipt' ? '/payments/receipt' : '/payments/supplier', payload),
    onSuccess: () => { invalidateAll(); setModal(null); setPreset('') },
  })

  const settleMut = useMutation({
    mutationFn: ({ row, payload }: { row: Payable; payload: Record<string, unknown> }) =>
      api.post(payUrl(row), row.type === 'supplier' ? { supplier_id: row.id, ...payload } : payload),
    onSuccess: () => { invalidateAll(); setSettle(null) },
  })

  const topUpMut = useMutation({
    mutationFn: ({ row, payload }: { row: Advance; payload: Record<string, unknown> }) =>
      api.post(advanceUrl(row)!, payload),
    onSuccess: () => { invalidateAll(); setTopUp(null) },
  })

  const open = (kind: 'receipt' | 'supplier', partyId = '') => { setPreset(partyId); setModal(kind) }

  const advRows = advances.data ?? []

  // Payables come as one full list — paginate on the client so the page never grows endless.
  const PAY_PER = 10
  const payAll = payables.data ?? []
  const payMeta = { current_page: payPage, last_page: Math.max(1, Math.ceil(payAll.length / PAY_PER)), total: payAll.length }
  const payRows = payAll.slice((payPage - 1) * PAY_PER, payPage * PAY_PER)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        subtitle="Paisa aana (receipt) aur paisa jana (payment)"
        actions={
          <>
            {can('payments.manage') && <Button variant="ghost" onClick={() => open('supplier')}><Wallet size={16} /> Pay Supplier</Button>}
            {can('payments.receive') && <Button onClick={() => open('receipt')}><HandCoins size={16} /> Receive Payment</Button>}
          </>
        }
      />

      {/* Customers who owe us — collect here */}
      <div>
        <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--text)' }}>Lene baqi (Customers se) <span className="font-normal" style={{ color: 'var(--muted)' }}>— receivables</span></h2>
        <Table head={['Customer', 'Baqi (dene hain)', '']}>
          {recv.data?.data.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3 font-medium">{c.name}</td>
              <td className="px-4 py-3"><Badge color="amber">{formatPaisa(c.balance)}</Badge></td>
              <td className="px-4 py-3">
                {can('payments.receive') && (
                  <RowActions>
                    <IconButton icon={HandCoins} label="Receive" tone="green" onClick={() => open('receipt', c.id)} />
                  </RowActions>
                )}
              </td>
            </tr>
          ))}
          {recv.data?.data.length === 0 && <tr><td colSpan={3} className="px-4 py-4 text-center text-sm" style={{ color: 'var(--muted)' }}>Sab clear — kisi se lena baqi nahi.</td></tr>}
        </Table>
        <Pagination meta={recv.data?.meta} page={recvPage} onPage={setRecvPage} />
      </div>

      {/* Everyone we owe — suppliers, drivers, labourers, staff */}
      <div>
        <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--text)' }}>Dene baqi (sab ko) <span className="font-normal" style={{ color: 'var(--muted)' }}>— payables: suppliers, drivers, mazdoor, staff</span></h2>
        {payables.isLoading ? <Spinner /> : (
          <>
            <Table head={['Kis ko', 'Type', 'Baqi (dene hain)', '']}>
              {payRows.map((p) => (
                <tr key={`${p.type}-${p.id}`}>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3"><Badge color="slate">{typeLabel[p.type]}</Badge></td>
                  <td className="px-4 py-3"><Badge color="red">{formatPaisa(p.balance)}</Badge></td>
                  <td className="px-4 py-3">
                    {can('payments.manage') && (
                      <RowActions>
                        <IconButton icon={Wallet} label="Pay" tone="primary" onClick={() => setSettle(p)} />
                      </RowActions>
                    )}
                  </td>
                </tr>
              ))}
              {payAll.length === 0 && <tr><td colSpan={4} className="px-4 py-4 text-center text-sm" style={{ color: 'var(--muted)' }}>Sab clear — kisi ko dena baqi nahi.</td></tr>}
            </Table>
            <Pagination meta={payMeta} page={payPage} onPage={setPayPage} />
          </>
        )}
      </div>

      {/* Advances given — negative balances; work off against future dues */}
      <div>
        <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--text)' }}>Advance diye <span className="font-normal" style={{ color: 'var(--muted)' }}>— jo aage mazdoori / charge se khud adjust honge</span></h2>
        {advances.isLoading ? <Spinner /> : (
          <Table head={['Kis ko', 'Type', 'Advance jama', '']}>
            {advRows.map((a) => (
              <tr key={`${a.type}-${a.id}`}>
                <td className="px-4 py-3 font-medium">{a.name}</td>
                <td className="px-4 py-3"><Badge color="slate">{typeLabel[a.type]}</Badge></td>
                <td className="px-4 py-3"><Badge color="blue">{formatPaisa(a.advance)}</Badge></td>
                <td className="px-4 py-3">
                  {can('payments.manage') && advanceUrl(a) && (
                    <RowActions>
                      <IconButton icon={Coins} label="Aur advance dein" tone="amber" onClick={() => setTopUp(a)} />
                    </RowActions>
                  )}
                </td>
              </tr>
            ))}
            {advRows.length === 0 && <tr><td colSpan={4} className="px-4 py-4 text-center text-sm" style={{ color: 'var(--muted)' }}>Kisi ko advance nahi diya.</td></tr>}
          </Table>
        )}
      </div>

      {/* All payments history */}
      <div>
        <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--text)' }}>Saari payments (history)</h2>
        <DataTable
          columns={histColumns}
          rows={data?.data}
          loading={isLoading}
          emptyText="Koi payment record nahi."
          search={search}
          onSearch={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder="Ref ya party naam se search…"
          sort={sort}
          dir={dir}
          onSort={onSortHist}
          meta={data?.meta}
          page={page}
          onPage={setPage}
        />
      </div>

      {modal && (
        <Modal title={modal === 'receipt' ? 'Receive from Customer' : 'Pay Supplier'} onClose={() => { setModal(null); setPreset('') }}>
          <PaymentForm
            kind={modal}
            initialParty={preset}
            onSubmit={(payload) => mutate.mutate({ kind: modal, payload })}
            busy={mutate.isPending}
            error={mutate.error ? apiError(mutate.error) : ''}
          />
        </Modal>
      )}

      {settle && (
        <Modal title={`Pay — ${settle.name}`} onClose={() => setSettle(null)}>
          <SettleForm
            outstanding={settle.balance}
            onSubmit={(payload) => settleMut.mutate({ row: settle, payload })}
            busy={settleMut.isPending}
            error={settleMut.error ? apiError(settleMut.error) : ''}
          />
        </Modal>
      )}

      {topUp && (
        <Modal title={`Advance — ${topUp.name}`} onClose={() => setTopUp(null)}>
          <AdvanceForm
            who={typeLabel[topUp.type]}
            balance={-topUp.advance}
            onSubmit={(payload) => topUpMut.mutate({ row: topUp, payload })}
            busy={topUpMut.isPending}
            error={topUpMut.error ? apiError(topUpMut.error) : ''}
          />
        </Modal>
      )}
    </div>
  )
}

function SettleForm({ outstanding, onSubmit, busy, error }: { outstanding: number; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ payment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit({ payment_date: form.payment_date, amount: Number(form.amount), method: form.method, bank_ref: form.method === 'bank' ? form.bank_ref : undefined }) }}
      className="space-y-3"
    >
      <OutstandingNote label="Inko dene hain (baqi)" amount={outstanding} onFill={(rs) => set('amount', String(rs))} />
      <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required /></Field>
      <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Pay'}</Button>
    </form>
  )
}

function PaymentForm({ kind, initialParty = '', onSubmit, busy, error }: { kind: string; initialParty?: string; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const partyResource = kind === 'receipt' ? 'customers' : 'suppliers'
  const parties = useList<{ id: string; name: string; balance: number }>(partyResource, { per_page: 100 })
  const [form, setForm] = useState({ party: initialParty, payment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })

  const selected = parties.data?.data.find((p) => p.id === form.party)
  const outstandingLabel = kind === 'receipt' ? 'Customer ne dene hain (baqi)' : 'Humne dene hain (baqi)'

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const idKey = kind === 'receipt' ? 'customer_id' : 'supplier_id'
        onSubmit({ [idKey]: form.party, payment_date: form.payment_date, amount: Number(form.amount), method: form.method, bank_ref: form.method === 'bank' ? form.bank_ref : undefined })
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
            <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
          </div>
          <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
        </>
      )}
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy || !form.party || (!!selected && selected.balance <= 0)} className="w-full">{busy ? 'Saving…' : 'Save'}</Button>
    </form>
  )
}
