import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { FileText, HandCoins, Trash2 } from 'lucide-react'
import { Badge, Button, type Column, DataTable, Field, IconButton, Input, MethodField, Modal, MoneyInput, OutstandingNote, PageHeader, RowActions, Spinner, useConfirm } from '../components/ui'
import InvoiceSheet from '../components/InvoiceSheet'

interface Sale {
  id: string
  invoice_no: string
  customer?: { name: string }
  sale_date: string
  type: string
  total: number
  paid: number
  balance: number
  status: string
}

const statusColor: Record<string, string> = { paid: 'green', partial: 'amber', unpaid: 'red' }

export default function ResellerSales() {
  const { can } = useAuth()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('sale_date')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [payFor, setPayFor] = useState<Sale | null>(null)
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const { data, isLoading } = useList<Sale>('reseller/sales', { page, search, sort, dir })
  const manage = can('reseller.manage')

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }

  const invalidate = () => ['reseller/sales', 'reseller/items', 'reseller/dashboard', 'reseller/receivables', 'reseller/payables', 'reseller/payments'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
  const pay = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.post(`/reseller/sales/${id}/receive`, payload),
    onSuccess: () => { invalidate(); setPayFor(null) },
  })
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/reseller/sales/${id}`),
    onSuccess: invalidate,
    onError: (e) => alert(apiError(e)),
  })
  const remove = async (s: Sale) => {
    if (await confirm({ title: 'Bikri delete karein?', message: `${s.invoice_no} delete hogi, stock wapas aayega.`, confirmText: 'Delete' })) del.mutate(s.id)
  }

  const columns: Column<Sale>[] = [
    { key: 'invoice_no', label: 'Invoice', sortable: true, render: (s) => <span className="font-mono text-xs">{s.invoice_no}</span> },
    { key: 'sale_date', label: 'Date', sortable: true, render: (s) => s.sale_date },
    { key: 'customer', label: 'Customer', render: (s) => s.customer?.name ?? 'Walk-in' },
    { key: 'type', label: 'Type', render: (s) => s.type },
    { key: 'total', label: 'Total', sortable: true, align: 'right', render: (s) => formatPaisa(s.total) },
    { key: 'balance', label: 'Baqi', sortable: true, align: 'right', render: (s) => <span style={{ color: s.balance > 0 ? 'var(--amber)' : 'var(--green)' }}>{formatPaisa(s.balance)}</span> },
    { key: 'status', label: 'Status', sortable: true, render: (s) => <Badge color={statusColor[s.status]}>{s.status}</Badge> },
    {
      key: 'actions', label: '', align: 'right', render: (s) => (
        <RowActions>
          <IconButton icon={FileText} label="Invoice" tone="primary" onClick={() => setInvoiceId(s.id)} />
          {manage && s.balance > 0 && <IconButton icon={HandCoins} label="Receive" tone="green" onClick={() => setPayFor(s)} />}
          {manage && <IconButton icon={Trash2} label="Delete" tone="red" onClick={() => remove(s)} />}
        </RowActions>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title="Reseller Sales" subtitle="Bikri record, udhaar wasooli — sab alag hisab" />
      <DataTable
        columns={columns} rows={data?.data} loading={isLoading} emptyText="Koi bikri nahi."
        search={search} onSearch={(v) => { setSearch(v); setPage(1) }} searchPlaceholder="Invoice ya customer se search…"
        sort={sort} dir={dir} onSort={onSort} meta={data?.meta} page={page} onPage={setPage}
      />
      {payFor && (
        <Modal title={`Receive — ${payFor.invoice_no}`} onClose={() => setPayFor(null)}>
          <ReceiveForm outstanding={payFor.balance} onSubmit={(payload) => pay.mutate({ id: payFor.id, payload })} busy={pay.isPending} error={pay.error ? apiError(pay.error) : ''} />
        </Modal>
      )}
      {invoiceId && <InvoiceModal id={invoiceId} onClose={() => setInvoiceId(null)} />}
    </div>
  )
}

interface SaleDetail extends Sale {
  discount: number
  subtotal: number
  transport_fare: number
  payment_method?: string
  items: { item_name: string; unit: string; quantity: number; unit_price: number; line_total: number }[]
}

function InvoiceModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['reseller/sales', id],
    queryFn: async () => (await api.get<{ data: SaleDetail }>(`/reseller/sales/${id}`)).data.data,
  })
  if (isLoading || !data) {
    return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}><Spinner /></div>
  }
  return (
    <InvoiceSheet
      subtitle="Resellers Point"
      docType="Sales Invoice"
      number={data.invoice_no}
      date={data.sale_date}
      customer={data.customer?.name ?? 'Walk-in'}
      meta={data.payment_method ? `Paid via ${String(data.payment_method).toUpperCase()}` : String(data.type).toUpperCase()}
      lines={data.items.map((it) => ({ name: it.item_name, qty: `${it.quantity} ${it.unit}`, rate: it.unit_price, total: it.line_total }))}
      totals={[
        { label: 'Subtotal', value: data.subtotal },
        ...(data.discount > 0 ? [{ label: 'Discount', value: data.discount, sign: '−' }] : []),
        ...(data.transport_fare > 0 ? [{ label: 'Transport', value: data.transport_fare }] : []),
        { label: 'Total', value: data.total, strong: true },
        { label: 'Paid', value: data.paid },
        { label: 'Balance', value: data.balance },
      ]}
      onClose={onClose}
    />
  )
}

function ReceiveForm({ outstanding, onSubmit, busy, error }: { outstanding: number; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ payment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, amount: Number(form.amount) }) }} className="space-y-3">
      <OutstandingNote label="Is invoice ka baqi (customer se lena)" amount={outstanding} onFill={(rs) => set('amount', String(rs))} />
      <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required /></Field>
      <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Receive'}</Button>
    </form>
  )
}
