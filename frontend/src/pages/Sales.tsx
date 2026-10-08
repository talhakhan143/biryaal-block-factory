import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Eye, HandCoins, Trash2 } from 'lucide-react'
import { Badge, Button, type Column, DataTable, Field, IconButton, Input, MethodField, Modal, MoneyInput, OutstandingNote, PageHeader, RowActions, useConfirm } from '../components/ui'
import SaleInvoiceModal from '../components/SaleInvoiceModal'
import { PaymentReceipt, type PaymentDoc } from '../components/receipts'

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

export default function Sales() {
  const { can } = useAuth()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('sale_date')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [viewId, setViewId] = useState<string | null>(null)
  const [receiveFor, setReceiveFor] = useState<Sale | null>(null)
  // Paisa lene ki apni parchi, bill ki parchi se alag.
  const [receipt, setReceipt] = useState<PaymentDoc | null>(null)
  const { data, isLoading } = useList<Sale>('sales', { search, page, sort, dir })

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }

  const receive = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.post(`/sales/${id}/receive`, payload),
    onSuccess: (res) => {
      ['sales', 'customers', 'payments', 'payables', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      setReceiveFor(null)
      setReceipt(res.data.data)
    },
  })

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/sales/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] })
      qc.invalidateQueries({ queryKey: ['dispatches-pending'] })
    },
    onError: (e) => alert(apiError(e)),
  })

  const columns: Column<Sale>[] = [
    { key: 'invoice_no', label: 'Invoice', sortable: true, render: (s) => <span className="font-mono text-xs">{s.invoice_no}</span> },
    { key: 'sale_date', label: 'Date', sortable: true, render: (s) => s.sale_date },
    { key: 'customer', label: 'Customer', render: (s) => s.customer?.name ?? 'Walk-in' },
    { key: 'type', label: 'Type', sortable: true, render: (s) => <span className="capitalize">{s.type}</span> },
    { key: 'total', label: 'Total', sortable: true, align: 'right', render: (s) => formatPaisa(s.total) },
    { key: 'paid', label: 'Paid', sortable: true, align: 'right', render: (s) => formatPaisa(s.paid) },
    { key: 'balance', label: 'Balance', sortable: true, align: 'right', render: (s) => formatPaisa(s.balance) },
    { key: 'status', label: 'Status', sortable: true, render: (s) => <Badge color={statusColor[s.status]}>{s.status}</Badge> },
    {
      key: 'actions', label: '', align: 'right', render: (s) => (
        <RowActions>
          {can('payments.receive') && s.balance > 0 && (
            <IconButton icon={HandCoins} label="Receive" tone="green" onClick={() => setReceiveFor(s)} />
          )}
          <IconButton icon={Eye} label="View" tone="primary" onClick={() => setViewId(s.id)} />
          {can('sales.delete') && (
            <IconButton icon={Trash2} label="Delete" tone="red" onClick={async () => {
              if (await confirm({ title: 'Invoice delete karein?', message: `Invoice ${s.invoice_no} delete ho jayega. Stock wapas ready me chala jayega.`, confirmText: 'Delete' })) del.mutate(s.id)
            }} />
          )}
        </RowActions>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title="Sales" subtitle="Saari farokht, cash aur udhaar" />
      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading}
        emptyText="Koi farokht nahi."
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Invoice no ya customer se search…"
        sort={sort}
        dir={dir}
        onSort={onSort}
        meta={data?.meta}
        page={page}
        onPage={setPage}
      />
      {receipt && <PaymentReceipt payment={receipt} onClose={() => setReceipt(null)} />}
      {viewId && <SaleInvoiceModal id={viewId} onClose={() => setViewId(null)} />}
      {receiveFor && (
        <Modal title={`Receive, ${receiveFor.invoice_no}`} onClose={() => setReceiveFor(null)}>
          <ReceiveForm
            outstanding={receiveFor.balance}
            onSubmit={(payload) => receive.mutate({ id: receiveFor.id, payload })}
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
      <OutstandingNote label="Is invoice ka baqi (customer se lena)" amount={outstanding} onFill={(rs) => set('amount', String(rs))} />
      <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required /></Field>
      <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Receive'}</Button>
    </form>
  )
}
