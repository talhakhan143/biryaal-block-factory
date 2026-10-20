import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Eye, HandCoins, Undo2 } from 'lucide-react'
import { Badge, Button, type Column, DataTable, EntityLink, Field, IconButton, Input, MethodField, Modal, MoneyInput, OutstandingNote, PageHeader, RowActions, useConfirm } from '../components/ui'
import SaleInvoiceModal from '../components/SaleInvoiceModal'
import { MONEY_KEYS } from '../lib/queryKeys'
import { PaymentReceipt, type PaymentDoc } from '../components/receipts'

/** Is bill ka maal kis challan par, kis driver ke hath gaya. */
interface Delivery {
  id: string
  reference: string
  dispatch_date: string | null
  status: string
  driver_id: string | null
  driver_name: string | null
}

interface Sale {
  id: string
  invoice_no: string
  customer?: { id: string; name: string }
  customer_id?: string | null
  sale_date: string
  type: string
  total: number
  paid: number
  balance: number
  status: string
  /** Khali list ka matlab: bill ban gaya hai par maal abhi gaya hi nahi. */
  delivery?: Delivery[]
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
      // Rollback se customer ka khata, stock aur dashboard sab badalte hain.
      ;[...MONEY_KEYS, 'customer-history', 'dispatches-pending'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
    },
    onError: (e) => alert(apiError(e)),
  })

  const columns: Column<Sale>[] = [
    { key: 'invoice_no', label: 'Invoice', sortable: true, render: (s) => <span className="font-mono text-xs">{s.invoice_no}</span> },
    { key: 'sale_date', label: 'Date', sortable: true, render: (s) => s.sale_date },
    {
      key: 'customer', label: 'Customer', render: (s) => {
        const cid = s.customer_id ?? s.customer?.id
        if (!s.customer?.name) return 'Walk-in'
        return cid
          ? <EntityLink to={`/customers/${cid}`} title="Is grahak ka poora khata kholein">{s.customer.name}</EntityLink>
          : s.customer.name
      },
    },
    { key: 'type', label: 'Type', sortable: true, render: (s) => <span className="capitalize">{s.type}</span> },
    { key: 'total', label: 'Total', sortable: true, align: 'right', render: (s) => formatPaisa(s.total) },
    { key: 'paid', label: 'Paid', sortable: true, align: 'right', render: (s) => formatPaisa(s.paid) },
    { key: 'balance', label: 'Balance', sortable: true, align: 'right', render: (s) => formatPaisa(s.balance) },
    { key: 'status', label: 'Status', sortable: true, render: (s) => <Badge color={statusColor[s.status]}>{s.status}</Badge> },
    {
      key: 'delivery', label: 'Delivery', render: (s) => {
        const trips = s.delivery ?? []
        if (trips.length === 0) return <Badge color="amber">Baqi hai</Badge>
        return (
          <div className="space-y-1">
            {trips.map((d) => (
              <div key={d.id}>
                <div className="font-mono text-xs" title={`${d.dispatch_date ?? ''} ${d.status}`.trim()}>{d.reference}</div>
                <div className="text-xs">
                  {d.driver_id && d.driver_name
                    ? <EntityLink to={`/drivers/${d.driver_id}`} title="Kis ke hath gaya, us driver ka khata">{d.driver_name}</EntityLink>
                    : <span style={{ color: 'var(--muted)' }}>{d.driver_name ?? '·'}</span>}
                </div>
              </div>
            ))}
          </div>
        )
      },
    },
    {
      key: 'actions', label: '', align: 'right', render: (s) => (
        <RowActions>
          {can('payments.receive') && s.balance > 0 && (
            <IconButton icon={HandCoins} label="Receive" tone="green" onClick={() => setReceiveFor(s)} />
          )}
          <IconButton icon={Eye} label="View" tone="primary" onClick={() => setViewId(s.id)} />
          {can('sales.delete') && (
            <IconButton icon={Undo2} label="Rollback (ye bill wapas lein)" tone="red" onClick={async () => {
              const ok = await confirm({
                title: `Rollback: ${s.invoice_no}`,
                message: (
                  <>
                    Ye bill poora wapas le liya jayega aur sab kuch pehle wali haalat par aa jayega:
                    <br />block wapas ready stock me, customer ke khate se ye rakam wapas, aur khate me
                    is bill ka hisaab khatam.
                    <br /><br />
                    Agar is bill par paisa mil chuka hai, challan ban chuka hai ya maal wapas aaya hai
                    to system khud mana kar dega.
                  </>
                ),
                confirmText: 'Rollback karein',
                requireText: 'rollback',
              })
              if (ok) del.mutate(s.id)
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
