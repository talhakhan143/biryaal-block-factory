import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Wallet, HandCoins, Printer } from 'lucide-react'
import { Badge, Button, type Column, DataTable, Field, IconButton, Input, MethodField, Modal, MoneyInput, OutstandingNote, PageHeader, PagedTable, RowActions, Spinner } from '../components/ui'
import { PaymentReceipt, type PaymentDoc } from '../components/receipts'

interface Payable { type: string; id: string; name: string; balance: number }
interface Receivable { customer_id: string; name: string; sale_due: number; kiraya_due: number; total: number }
interface PayRow extends PaymentDoc { id: string; party: string }

/**
 * Reseller ki books me paise ka rukh 'in' / 'out' likha hota hai, aur parchi
 * 'receipt' / 'payment' samajhti hai. Yahan sirf wahi naam badalta hai, rakam
 * ya hisaab ko haath nahi lagta.
 */
const asParchi = (p: PaymentDoc): PaymentDoc => ({
  ...p,
  direction: p.direction === 'in' || p.direction === 'receipt' ? 'receipt' : 'payment',
})

export default function ResellerPayments() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const manage = can('reseller.manage')
  const [payFor, setPayFor] = useState<Payable | null>(null)
  const [receiveFor, setReceiveFor] = useState<Receivable | null>(null)
  const [receipt, setReceipt] = useState<PaymentDoc | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('payment_date')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')

  const payables = useQuery({ queryKey: ['reseller/payables'], queryFn: async () => (await api.get<{ data: Payable[] }>('/reseller/payables')).data.data })
  const receivables = useQuery({ queryKey: ['reseller/receivables'], queryFn: async () => (await api.get<{ data: Receivable[] }>('/reseller/receivables')).data.data })
  const history = useList<PayRow>('reseller/payments', { search, page, sort, dir })

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }

  const refresh = () => ['reseller/payables', 'reseller/receivables', 'reseller/payments', 'reseller/suppliers', 'reseller/sales', 'reseller/dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))

  const pay = useMutation({
    mutationFn: ({ p, payload }: { p: Payable; payload: Record<string, unknown> }) =>
      p.type === 'supplier' ? api.post(`/reseller/suppliers/${p.id}/pay`, payload) : api.post(`/reseller/payments/driver/${p.id}/pay`, payload),
    // Supplier wala endpoint supplier wapas deta hai aur parchi alag se
    // (res.data.payment); driver wala seedhi parchi deta hai (res.data.data).
    onSuccess: (res, vars) => {
      const doc = res.data.payment ?? res.data.data
      refresh()
      setPayFor(null)
      // Driver ke kiraye me API party ka naam nahi deti, is liye yahan se de rahe hain.
      if (doc) setReceipt(asParchi({ ...doc, party_name: doc.party_name ?? vars.p.name }))
    },
  })
  const receive = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/reseller/payments/receive', payload),
    onSuccess: (res) => {
      const doc = res.data.data
      refresh()
      if (doc) setReceipt(asParchi({ ...doc, party_name: doc.party_name ?? receiveFor?.name }))
      setReceiveFor(null)
    },
  })

  const recvRows = receivables.data ?? []
  const payRows = payables.data ?? []
  // Jama poori list ka, taake page badalne par kul hisaab chhupe na.
  const recvTotal = recvRows.reduce((t, r) => t + r.total, 0)
  const payTotal = payRows.reduce((t, p) => t + p.balance, 0)

  const histColumns: Column<PayRow>[] = [
    { key: 'reference', label: 'Ref', sortable: true, render: (h) => <span className="font-mono text-xs">{h.reference}</span> },
    { key: 'payment_date', label: 'Date', sortable: true, render: (h) => h.payment_date },
    { key: 'party', label: 'Party', render: (h) => h.party },
    { key: 'direction', label: 'Type', sortable: true, render: (h) => <Badge color={h.direction === 'in' ? 'green' : 'red'}>{h.direction === 'in' ? 'IN' : 'OUT'}</Badge> },
    { key: 'amount', label: 'Amount', sortable: true, align: 'right', render: (h) => <span className="font-medium">{formatPaisa(h.amount)}</span> },
    {
      key: 'actions', label: '', align: 'right',
      render: (h) => (
        <RowActions>
          <IconButton
            icon={Printer}
            label="Parchi dekhein / print karein"
            tone="primary"
            onClick={() => setReceipt(asParchi({ ...h, party_name: h.party_name ?? h.party }))}
          />
        </RowActions>
      ),
    },
  ]

  return (
    <div className="space-y-8">
      <PageHeader title="Resellers Point, Payments" subtitle="Sab lena-dena ek jagah, jise dena hai, jis se lena hai" />

      {/* Receivable, jis se lena hai */}
      <div>
        <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--text)' }}>Receivable, Customers se lena</h2>
        {receivables.isLoading ? <Spinner /> : (
          <PagedTable
            head={['Customer', { label: 'Sale udhaar', align: 'right' }, { label: 'Kiraya baqi', align: 'right' }, { label: 'Total', align: 'right' }, '']}
            rows={recvRows}
            searchText={(r) => r.name}
            searchPlaceholder="Customer ke naam se dhoondein…"
            emptyText="Kisi ka koi baqi nahi."
            footer={(
              <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
                <td className="px-4 py-2.5 font-bold" colSpan={3}>Kul lena hai</td>
                <td className="px-4 py-2.5 text-right font-bold" style={{ color: 'var(--amber)' }}>{formatPaisa(recvTotal)}</td>
                <td />
              </tr>
            )}
            row={(r) => (
              <tr key={r.customer_id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 text-right">{formatPaisa(r.sale_due)}</td>
                <td className="px-4 py-3 text-right">{formatPaisa(r.kiraya_due)}</td>
                <td className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--amber)' }}>{formatPaisa(r.total)}</td>
                <td className="px-4 py-3 text-right">{manage && <RowActions><IconButton icon={HandCoins} label="Receive" tone="green" onClick={() => setReceiveFor(r)} /></RowActions>}</td>
              </tr>
            )}
          />
        )}
      </div>

      {/* Payable, jise dena hai */}
      <div>
        <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--text)' }}>Payable, Jise dena hai</h2>
        {payables.isLoading ? <Spinner /> : (
          <PagedTable
            head={['Party', 'Type', { label: 'Dena', align: 'right' }, '']}
            rows={payRows}
            searchText={(p) => `${p.name} ${p.type}`}
            searchPlaceholder="Naam ya type se dhoondein…"
            emptyText="Kisi ko kuch dena nahi."
            footer={(
              <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
                <td className="px-4 py-2.5 font-bold" colSpan={2}>Kul dena hai</td>
                <td className="px-4 py-2.5 text-right font-bold" style={{ color: 'var(--red)' }}>{formatPaisa(payTotal)}</td>
                <td />
              </tr>
            )}
            row={(p) => (
              <tr key={`${p.type}-${p.id}`} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3"><Badge color={p.type === 'supplier' ? 'blue' : 'amber'}>{p.type}</Badge></td>
                <td className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--red)' }}>{formatPaisa(p.balance)}</td>
                <td className="px-4 py-3 text-right">{manage && <RowActions><IconButton icon={Wallet} label="Pay" tone="primary" onClick={() => setPayFor(p)} /></RowActions>}</td>
              </tr>
            )}
          />
        )}
      </div>

      {/* History */}
      <div>
        <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--text)' }}>Cash Log (lain-den)</h2>
        <DataTable
          columns={histColumns}
          rows={history.data?.data}
          loading={history.isLoading}
          emptyText="Abhi koi lain-den nahi."
          search={search}
          onSearch={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder="Ref ya party ke naam se dhoondein…"
          sort={sort}
          dir={dir}
          onSort={onSort}
          meta={history.data?.meta}
          page={page}
          onPage={setPage}
        />
      </div>

      {payFor && (
        <Modal title={`Pay · ${payFor.name}`} onClose={() => setPayFor(null)}>
          <SettleForm label="Dena (total baqi)" outstanding={payFor.balance} busy={pay.isPending} error={pay.error ? apiError(pay.error) : ''}
            onSubmit={(payload) => pay.mutate({ p: payFor, payload })} action="Pay" />
        </Modal>
      )}
      {receiveFor && (
        <Modal title={`Receive · ${receiveFor.name}`} onClose={() => setReceiveFor(null)}>
          <SettleForm label="Lena (total baqi)" outstanding={receiveFor.total} busy={receive.isPending} error={receive.error ? apiError(receive.error) : ''}
            onSubmit={(payload) => receive.mutate({ ...payload, customer_id: receiveFor.customer_id })} action="Receive" />
        </Modal>
      )}
      {receipt && <PaymentReceipt payment={receipt} subtitle="Resellers Point" onClose={() => setReceipt(null)} />}
    </div>
  )
}

function SettleForm({ label, outstanding, onSubmit, busy, error, action }: { label: string; outstanding: number; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string; action: string }) {
  const [form, setForm] = useState({ payment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, amount: Number(form.amount) }) }} className="space-y-3">
      <OutstandingNote label={label} amount={outstanding} onFill={(rs) => set('amount', String(rs))} />
      <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required /></Field>
      <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : action}</Button>
    </form>
  )
}
