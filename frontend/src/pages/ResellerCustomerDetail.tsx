import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FileText, HandCoins, MapPin, Phone } from 'lucide-react'
import { api, apiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatPaisa } from '../lib/money'
import {
  Badge, Button, Card, Field, IconButton, Input, MethodField, Modal, MoneyInput, Note,
  OutstandingNote, RowActions, Spinner, StatTile, Table, Tabs,
} from '../components/ui'
import SaleInvoiceModal from '../components/SaleInvoiceModal'
import { RESELLER_MONEY_KEYS } from '../lib/queryKeys'

interface SaleItem { item_name?: string; unit?: string; quantity: number; unit_price: number; line_total: number }
interface Sale {
  id: string; invoice_no: string; sale_date: string; type: string; status: string
  subtotal: number; discount: number; transport_fare: number; total: number; paid: number; balance: number
  items?: SaleItem[]
}
interface Receipt { id: string; reference: string; payment_date: string; amount: number; method: string; bank_ref?: string }
interface Return { id: string; reference: string; return_date: string; return_value: number; deduction: number; refund_amount: number; refund_mode: string }
interface Rental {
  id: string; reference: string; item_name: string; unit: string; quantity: number
  per_day_rate: number; start_date: string; return_date?: string | null
  days: number; accrued: number; paid_amount: number; due: number; status: string
}
interface History {
  customer: { id: string; name: string; phone?: string; address?: string; balance: number }
  summary: {
    sales_count: number; sales_total: number; sale_due: number; received: number; returned: number
    rental_count: number; rental_accrued: number; rental_paid: number; rental_due: number
    outstanding: number; first_activity?: string; last_activity?: string
  }
  sales: Sale[]
  receipts: Receipt[]
  returns: Return[]
  rentals: Rental[]
}

type TabKey = 'sales' | 'receipts' | 'rentals' | 'returns'

/**
 * Resellers Point ka customer record. Naam aur phone block factory se shared
 * hai, baqi kuch nahi: yahan ke saare figures sirf reseller sales, kiraya aur
 * reseller payments se bante hain.
 */
export default function ResellerCustomerDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { can } = useAuth()
  const [tab, setTab] = useState<TabKey>('sales')
  const [receiving, setReceiving] = useState(false)
  const [invoiceId, setInvoiceId] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['reseller/customers', id],
    queryFn: async () => (await api.get<History>(`/reseller/customers/${id}`)).data,
  })

  const receive = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/reseller/payments/receive', { ...payload, customer_id: id }),
    onSuccess: () => {
      RESELLER_MONEY_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      setReceiving(false)
    },
  })

  if (isLoading) return <Spinner />
  if (isError || !data) {
    return (
      <div className="space-y-4">
        <BackLink onClick={() => navigate('/reseller/customers')} />
        <Note tone="red">Customer khul nahi saka. {apiError(error)}</Note>
      </div>
    )
  }

  const { customer: c, summary: s } = data
  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'sales', label: 'Maal jo becha', count: data.sales.length },
    { key: 'receipts', label: 'Paisa aaya', count: data.receipts.length },
    { key: 'rentals', label: 'Kiraya', count: data.rentals.length },
    { key: 'returns', label: 'Wapsi', count: data.returns.length },
  ]

  return (
    <div>
      <BackLink onClick={() => navigate('/reseller/customers')} />

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{c.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" style={{ color: 'var(--muted)' }}>
            {c.phone && <span className="inline-flex items-center gap-1"><Phone size={13} /> {c.phone}</span>}
            {c.address && <span className="inline-flex items-center gap-1"><MapPin size={13} /> {c.address}</span>}
            {s.first_activity && <span>Pehla kaam {s.first_activity}</span>}
            {s.last_activity && <span>Aakhri kaam {s.last_activity}</span>}
          </div>
        </div>
        {can('reseller.manage') && s.outstanding > 0 && (
          <Button onClick={() => setReceiving(true)}>
            <HandCoins size={15} className="mr-1.5 inline" />Paisa jama karein
          </Button>
        )}
      </div>

      <div className="mb-4">
        <Note>Ye sirf Resellers Point ka hisaab hai. Block factory ka baqi is me shaamil nahi.</Note>
      </div>

      <div className="bf-stagger mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Kitna lena hai" value={formatPaisa(s.outstanding)} hint="Maal + kiraya, dono ka baqi" tone={s.outstanding > 0 ? 'red' : 'green'} />
        <StatTile label="Ab tak ka kaam" value={formatPaisa(s.sales_total)} hint={`${s.sales_count} bill`} tone="primary" />
        <StatTile label="Paisa mila" value={formatPaisa(s.received)} hint="Cash aur bank, dono" tone="green" />
        <StatTile label="Kiraya ka baqi" value={formatPaisa(s.rental_due)} hint={`${s.rental_count} cheezein kiraye par`} tone={s.rental_due > 0 ? 'amber' : 'text'} />
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'sales' && <Sales rows={data.sales} onInvoice={setInvoiceId} />}
      {tab === 'receipts' && <Receipts rows={data.receipts} />}
      {tab === 'rentals' && <Rentals rows={data.rentals} />}
      {tab === 'returns' && <Returns rows={data.returns} />}

      {invoiceId && <SaleInvoiceModal id={invoiceId} source="reseller" onClose={() => setInvoiceId(null)} />}

      {receiving && (
        <Modal title={`Paisa jama karein: ${c.name}`} onClose={() => setReceiving(false)}>
          <ReceiveForm
            outstanding={s.outstanding}
            onSubmit={(p) => receive.mutate(p)}
            busy={receive.isPending}
            error={receive.error ? apiError(receive.error) : ''}
          />
        </Modal>
      )}
    </div>
  )
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium transition hover:underline" style={{ color: 'var(--primary)' }}>
      <ArrowLeft size={15} /> Customers
    </button>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <Card><p className="text-sm" style={{ color: 'var(--muted)' }}>{children}</p></Card>
}

function Sales({ rows, onInvoice }: { rows: Sale[]; onInvoice: (id: string) => void }) {
  if (rows.length === 0) return <Empty>Is customer ne yahan se abhi kuch nahi khareeda.</Empty>
  return (
    <Table head={['Bill no', 'Date', 'Kaise', { label: 'Bill ka total', align: 'right' }, { label: 'Paisa mila', align: 'right' }, { label: 'Baqi', align: 'right' }, 'Haal', '']}>
      {rows.map((s) => (
        <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
          <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{s.invoice_no}</td>
          <td className="whitespace-nowrap px-4 py-2">{s.sale_date}</td>
          <td className="px-4 py-2"><Badge color={s.type === 'credit' ? 'amber' : 'green'}>{s.type === 'credit' ? 'Udhaar' : 'Cash'}</Badge></td>
          <td className="px-4 py-2 text-right">{formatPaisa(s.total)}</td>
          <td className="px-4 py-2 text-right" style={{ color: 'var(--green)' }}>{formatPaisa(s.paid)}</td>
          <td className="px-4 py-2 text-right" style={{ color: s.balance > 0 ? 'var(--amber)' : undefined }}>{s.balance ? formatPaisa(s.balance) : '·'}</td>
          <td className="px-4 py-2"><Badge color={s.status === 'paid' ? 'green' : s.status === 'partial' ? 'amber' : 'red'}>{s.status}</Badge></td>
          <td className="px-4 py-2 text-right">
            <RowActions><IconButton icon={FileText} label="Invoice" tone="primary" onClick={() => onInvoice(s.id)} /></RowActions>
          </td>
        </tr>
      ))}
    </Table>
  )
}

function Receipts({ rows }: { rows: Receipt[] }) {
  if (rows.length === 0) return <Empty>Is customer se abhi koi paisa nahi aaya.</Empty>
  const total = rows.reduce((a, r) => a + r.amount, 0)
  return (
    <Table head={['Ref', 'Date', 'Cash ya bank', 'Bank detail', { label: 'Kitna mila', align: 'right' }]}>
      {rows.map((r) => (
        <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
          <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{r.reference}</td>
          <td className="whitespace-nowrap px-4 py-2">{r.payment_date}</td>
          <td className="px-4 py-2 capitalize">{r.method}</td>
          <td className="px-4 py-2" style={{ color: 'var(--muted)' }}>{r.bank_ref || '·'}</td>
          <td className="px-4 py-2 text-right font-medium" style={{ color: 'var(--green)' }}>{formatPaisa(r.amount)}</td>
        </tr>
      ))}
      <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
        <td className="px-4 py-2.5 font-bold" colSpan={4}>Kul paisa mila</td>
        <td className="px-4 py-2.5 text-right font-bold" style={{ color: 'var(--green)' }}>{formatPaisa(total)}</td>
      </tr>
    </Table>
  )
}

function Rentals({ rows }: { rows: Rental[] }) {
  if (rows.length === 0) return <Empty>Is customer ne kuch kiraye par nahi liya.</Empty>
  return (
    <Table head={['Ref', 'Cheez', { label: 'Kitni', align: 'right' }, { label: 'Ek din ka', align: 'right' }, 'Kab se', { label: 'Din', align: 'right' }, { label: 'Kul bana', align: 'right' }, { label: 'Paisa mila', align: 'right' }, { label: 'Baqi', align: 'right' }, 'Haal']}>
      {rows.map((r) => (
        <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
          <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{r.reference}</td>
          <td className="px-4 py-2">{r.item_name}</td>
          <td className="px-4 py-2 text-right">{r.quantity} {r.unit}</td>
          <td className="px-4 py-2 text-right">{formatPaisa(r.per_day_rate)}</td>
          <td className="whitespace-nowrap px-4 py-2">{r.start_date}</td>
          <td className="px-4 py-2 text-right">{r.days}</td>
          <td className="px-4 py-2 text-right">{formatPaisa(r.accrued)}</td>
          <td className="px-4 py-2 text-right" style={{ color: 'var(--green)' }}>{formatPaisa(r.paid_amount)}</td>
          <td className="px-4 py-2 text-right font-medium" style={{ color: r.due > 0 ? 'var(--amber)' : undefined }}>{formatPaisa(r.due)}</td>
          <td className="px-4 py-2"><Badge color={r.status === 'returned' ? 'green' : 'amber'}>{r.status === 'returned' ? 'Wapas aa gaya' : 'Abhi uske paas'}</Badge></td>
        </tr>
      ))}
    </Table>
  )
}

function Returns({ rows }: { rows: Return[] }) {
  if (rows.length === 0) return <Empty>Koi maal wapas nahi aaya.</Empty>
  return (
    <Table head={['Ref', 'Date', { label: 'Maal ki qeemat', align: 'right' }, { label: 'Kaata', align: 'right' }, { label: 'Wapas kiya', align: 'right' }, 'Kaise']}>
      {rows.map((r) => (
        <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
          <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{r.reference}</td>
          <td className="whitespace-nowrap px-4 py-2">{r.return_date}</td>
          <td className="px-4 py-2 text-right">{formatPaisa(r.return_value)}</td>
          <td className="px-4 py-2 text-right">{r.deduction ? formatPaisa(r.deduction) : '·'}</td>
          <td className="px-4 py-2 text-right font-medium">{formatPaisa(r.refund_amount)}</td>
          <td className="px-4 py-2">
            <Badge color={r.refund_mode === 'account' ? 'blue' : 'green'}>
              {r.refund_mode === 'account' ? 'Khate me' : r.refund_mode === 'cash' ? 'Cash diya' : 'Bank se diya'}
            </Badge>
          </td>
        </tr>
      ))}
    </Table>
  )
}

function ReceiveForm({ outstanding, onSubmit, busy, error }: { outstanding: number; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ payment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, amount: Number(form.amount) }) }} className="space-y-3">
      <OutstandingNote label="Is customer se kitna lena hai" amount={outstanding} onFill={(rs) => set('amount', String(rs))} />
      <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required /></Field>
      <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Receive'}</Button>
    </form>
  )
}
