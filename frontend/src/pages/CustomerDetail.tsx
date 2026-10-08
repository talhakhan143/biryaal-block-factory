import { Fragment, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FileText, HandCoins, Phone, MapPin, Printer, SquarePen, Undo2 } from 'lucide-react'
import { api, apiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatPaisa } from '../lib/money'
import {
  Badge, Button, Card, Field, IconButton, Input, MethodField, Modal, MoneyInput, Note,
  OutstandingNote, PagedTable, RowActions, Spinner, StatTile, Tabs, useConfirm,
} from '../components/ui'
import SaleInvoiceModal from '../components/SaleInvoiceModal'
import { AdjustmentVoucher, PaymentReceipt, ReturnNote, type AdjustmentDoc, type PaymentDoc, type ReturnDoc } from '../components/receipts'
import PaymentEditForm from '../components/PaymentEditForm'
import { MONEY_KEYS } from '../lib/queryKeys'

interface LedgerRow {
  date: string
  type: 'sale' | 'receipt' | 'return' | 'adjustment' | 'other'
  reference: string
  journal_ref: string
  description: string
  debit: number
  credit: number
  running: number
}
interface SaleItem { product_name?: string; quantity: number; unit_price: number; line_total: number }
interface Sale {
  id: string; invoice_no: string; sale_date: string; type: string; status: string
  subtotal: number; discount: number; transport_fare: number; total: number; paid: number; balance: number
  payment_method?: string; items?: SaleItem[]
}
interface Receipt {
  id: string; reference: string; payment_date: string; amount: number; method: string; bank_ref?: string
  direction?: string; notes?: string | null; against?: { type: string; reference?: string | null } | null
  /** Bhara hua ho to ye paisa kisi aik bill se juda hai aur yahan se nahi badalta. */
  allocatable_id?: string | null
}
interface Return {
  id: string; reference: string; return_date: string; return_value: number
  deduction: number; refund_amount: number; refund_mode: string; notes?: string | null
  items?: { product_name?: string; quantity: number; unit_price: number; line_total: number }[]
}
interface Adjustment { id: string; reference: string; mode: string; adjustment_date: string; amount: number; reason: string; notes?: string | null }
interface Dispatch {
  id: string; reference: string; dispatch_date: string; status: string
  driver?: { name: string } | null; vehicle?: { name?: string; plate?: string } | null
  items?: { product_name?: string; quantity: number }[]
}
interface History {
  customer: { id: string; name: string; phone?: string; address?: string; notes?: string; balance: number; advance: number }
  summary: {
    factory: {
      sales_count: number; sales_total: number; advance: number; blocks: number
      blocks_on_credit: number; credit_sales_count: number; credit_total: number
      received: number; returned: number; adjustments: number; dispatch_count: number
      outstanding: number; balance: number
    }
    first_activity?: string
    last_activity?: string
    ledger_balance: number
    reconciled: boolean
  }
  ledger: LedgerRow[]
  sales: Sale[]
  receipts: Receipt[]
  returns: Return[]
  adjustments: Adjustment[]
  dispatches: Dispatch[]
}

type TabKey = 'statement' | 'sales' | 'receipts' | 'returns' | 'dispatches'

const TYPE_COLOR: Record<LedgerRow['type'], string> = {
  sale: 'blue', receipt: 'green', return: 'amber', adjustment: 'slate', other: 'slate',
}
const TYPE_LABEL: Record<LedgerRow['type'], string> = {
  sale: 'Maal diya', receipt: 'Paisa aaya', return: 'Maal wapas', adjustment: 'Hath se theek kiya', other: 'Aur',
}

export default function CustomerDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { can } = useAuth()
  const [tab, setTab] = useState<TabKey>('statement')
  const [receiving, setReceiving] = useState(false)
  // Paisa jama hote hi parchi khul jaye, phir list se bhi dobara nikal aaye.
  const [receipt, setReceipt] = useState<PaymentDoc | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['customer-history', id],
    queryFn: async () => (await api.get<History>(`/customers/${id}/history`)).data,
  })

  const receive = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/payments/receipt', { ...payload, customer_id: id }),
    onSuccess: (res) => {
      MONEY_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      setReceiving(false)
      setReceipt(res.data.data)
    },
  })

  if (isLoading) return <Spinner />
  if (isError || !data) {
    return (
      <div className="space-y-4">
        <BackLink onClick={() => navigate('/customers')} />
        <Note tone="red">Customer khul nahi saka. {apiError(error)}</Note>
      </div>
    )
  }

  const { customer: c, summary: s } = data
  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'statement', label: 'Khata', count: data.ledger.length },
    { key: 'sales', label: 'Sales', count: data.sales.length },
    { key: 'receipts', label: 'Paisa aaya', count: data.receipts.length },
    { key: 'returns', label: 'Wapsi', count: data.returns.length + data.adjustments.length },
    { key: 'dispatches', label: 'Delivery', count: data.dispatches.length },
  ]

  return (
    <div>
      <BackLink onClick={() => navigate('/customers')} />

      {/* Identity + the one number that matters */}
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
        {can('payments.receive') && s.factory.outstanding > 0 && (
          <Button onClick={() => setReceiving(true)}>
            <HandCoins size={15} className="mr-1.5 inline" />Paisa jama karein
          </Button>
        )}
      </div>

      <div className="bf-stagger mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Kitna lena hai" value={formatPaisa(s.factory.outstanding)} hint="Abhi tak ka baqi paisa" tone={s.factory.outstanding > 0 ? 'red' : 'green'} />
        <StatTile
          label="Advance jama"
          value={formatPaisa(s.factory.advance)}
          hint={s.factory.advance > 0 ? 'Iska paisa hamare paas, agla bill isi me se katega' : 'Koi advance nahi diya'}
          tone={s.factory.advance > 0 ? 'green' : 'text'}
        />
        <StatTile
          label="Udhaar pe liye blocks"
          value={`${s.factory.blocks_on_credit.toLocaleString('en-PK')} pcs`}
          hint={`${s.factory.credit_sales_count} udhaar bill, ${formatPaisa(s.factory.credit_total)}`}
          tone={s.factory.blocks_on_credit > 0 ? 'amber' : 'text'}
        />
        <StatTile label="Ab tak ka kaam" value={formatPaisa(s.factory.sales_total)} hint={`${s.factory.sales_count} bill, ${s.factory.blocks.toLocaleString('en-PK')} pcs`} tone="primary" />
        <StatTile label="Paisa mila" value={formatPaisa(s.factory.received)} hint="Cash aur bank, dono" tone="green" />
        <StatTile label="Maal wapas aaya" value={formatPaisa(s.factory.returned)} hint="Return ki gayi qeemat" tone={s.factory.returned > 0 ? 'amber' : 'text'} />
      </div>

      {!s.reconciled && (
        <div className="mb-4">
          <Note tone="red">
            Khate ka jorh (<strong>{formatPaisa(s.ledger_balance)}</strong>) aur customer ka apna hisaab
            (<strong>{formatPaisa(s.factory.balance)}</strong>) aapas me match nahi kar rahe. Munshi ko dikhayein.
          </Note>
        </div>
      )}

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'statement' && <Statement rows={data.ledger} balance={s.factory.balance} />}
      {tab === 'sales' && <Sales rows={data.sales} />}
      {tab === 'receipts' && <Receipts rows={data.receipts} party={c.name} canManage={can('payments.manage')} />}
      {tab === 'returns' && <Returns returns={data.returns} adjustments={data.adjustments} party={c.name} />}
      {tab === 'dispatches' && <Dispatches rows={data.dispatches} />}

      {receipt && <PaymentReceipt payment={receipt} party={c.name} onClose={() => setReceipt(null)} />}

      {receiving && (
        <Modal title={`Paisa jama karein: ${c.name}`} onClose={() => setReceiving(false)}>
          <ReceiveForm
            outstanding={s.factory.outstanding}
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

/** Running khata. Every row here moved the customer's balance. */
function Statement({ rows, balance }: { rows: LedgerRow[]; balance: number }) {
  if (rows.length === 0) {
    return (
      <Note>
        Is customer ka koi udhaar nahi chala.
      </Note>
    )
  }
  return (
    <div className="space-y-3">
      <PagedTable
        head={['Date', 'Kya hua', 'Bill no', { label: 'Charge hua', align: 'right' }, { label: 'Paisa mila', align: 'right' }, { label: 'Baqi raha', align: 'right' }]}
        rows={rows}
        searchText={(r) => `${r.date} ${r.reference} ${TYPE_LABEL[r.type]}`}
        searchPlaceholder="Date ya bill no se dhoondein…"
        footer={(
          <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
            <td className="px-4 py-2.5 font-bold" colSpan={5}>
              {balance < 0 ? 'Advance jama (iska paisa hamare paas)' : 'Ab kitna lena hai'}
            </td>
            <td className="px-4 py-2.5 text-right font-bold" style={{ color: balance > 0 ? 'var(--amber)' : 'var(--green)' }}>
              {formatPaisa(Math.abs(balance))}
            </td>
          </tr>
        )}
        row={(r) => (
          <tr key={r.journal_ref} style={{ borderTop: '1px solid var(--border)' }}>
            <td className="whitespace-nowrap px-4 py-2">{r.date}</td>
            <td className="px-4 py-2"><Badge color={TYPE_COLOR[r.type]}>{TYPE_LABEL[r.type]}</Badge></td>
            <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{r.reference}</td>
            <td className="px-4 py-2 text-right">{r.debit ? formatPaisa(r.debit) : '·'}</td>
            <td className="px-4 py-2 text-right" style={{ color: r.credit ? 'var(--green)' : undefined }}>{r.credit ? formatPaisa(r.credit) : '·'}</td>
            <td className="px-4 py-2 text-right font-semibold">{formatPaisa(r.running)}</td>
          </tr>
        )}
      />
    </div>
  )
}

function Sales({ rows }: { rows: Sale[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  if (rows.length === 0) return <Empty>Is customer ne abhi tak kuch nahi khareeda.</Empty>
  return (
    <>
    <PagedTable
      head={['Bill no', 'Date', 'Kaise', { label: 'Bill ka total', align: 'right' }, { label: 'Paisa mila', align: 'right' }, { label: 'Baqi', align: 'right' }, 'Haal', '']}
      rows={rows}
      searchText={(s) => `${s.invoice_no} ${s.sale_date} ${s.type} ${s.status} ${(s.items ?? []).map((i) => i.product_name ?? '').join(' ')}`}
      searchPlaceholder="Bill no, date ya maal se dhoondein…"
      row={(s) => (
        <Fragment key={s.id}>
          <tr style={{ borderTop: '1px solid var(--border)' }}>
            <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{s.invoice_no}</td>
            <td className="whitespace-nowrap px-4 py-2">{s.sale_date}</td>
            <td className="px-4 py-2"><Badge color={s.type === 'credit' ? 'amber' : 'green'}>{s.type === 'credit' ? 'Udhaar' : 'Cash'}</Badge></td>
            <td className="px-4 py-2 text-right">{formatPaisa(s.total)}</td>
            <td className="px-4 py-2 text-right" style={{ color: 'var(--green)' }}>{formatPaisa(s.paid)}</td>
            <td className="px-4 py-2 text-right" style={{ color: s.balance > 0 ? 'var(--amber)' : undefined }}>{s.balance ? formatPaisa(s.balance) : '·'}</td>
            <td className="px-4 py-2"><Badge color={s.status === 'paid' ? 'green' : s.status === 'partial' ? 'amber' : 'red'}>{s.status}</Badge></td>
            <td className="px-4 py-2 text-right">
              <RowActions>
                <button onClick={() => setOpen(open === s.id ? null : s.id)} className="text-xs font-medium" style={{ color: 'var(--primary)' }}>
                  {open === s.id ? 'Band karein' : 'Maal dekhein'}
                </button>
                <IconButton icon={FileText} label="Invoice" tone="primary" onClick={() => setInvoiceId(s.id)} />
              </RowActions>
            </td>
          </tr>
          {open === s.id && (
            <tr>
              <td colSpan={8} className="px-4 py-3" style={{ background: 'var(--surface-2)' }}>
                <div className="space-y-1 text-xs">
                  {(s.items ?? []).map((it, i) => (
                    <div key={i} className="flex justify-between gap-4">
                      <span>{it.product_name ?? 'Item'} × {it.quantity}</span>
                      <span style={{ color: 'var(--muted)' }}>{formatPaisa(it.unit_price)} each</span>
                      <span className="font-medium">{formatPaisa(it.line_total)}</span>
                    </div>
                  ))}
                  <div className="mt-2 flex justify-between border-t pt-1.5" style={{ borderColor: 'var(--border)' }}>
                    <span style={{ color: 'var(--muted)' }}>Subtotal {formatPaisa(s.subtotal)}
                      {s.discount > 0 && <> · Discount −{formatPaisa(s.discount)}</>}
                      {s.transport_fare > 0 && <> · Kiraya {formatPaisa(s.transport_fare)}</>}
                    </span>
                    <span className="font-semibold">Total {formatPaisa(s.total)}</span>
                  </div>
                </div>
              </td>
            </tr>
          )}
        </Fragment>
      )}
    />
    {invoiceId && <SaleInvoiceModal id={invoiceId} onClose={() => setInvoiceId(null)} />}
    </>
  )
}

function Receipts({ rows, party, canManage }: { rows: Receipt[]; party: string; canManage: boolean }) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [slip, setSlip] = useState<PaymentDoc | null>(null)
  const [editing, setEditing] = useState<Receipt | null>(null)

  const refresh = () => [...MONEY_KEYS, 'customer-history'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))

  const rollback = useMutation({
    mutationFn: (id: string) => api.delete(`/payments/${id}`),
    onSuccess: refresh,
    onError: (e) => alert(apiError(e)),
  })
  const edit = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.patch(`/payments/${id}`, payload),
    onSuccess: () => { refresh(); setEditing(null) },
  })

  if (rows.length === 0) return <Empty>Is customer se abhi koi paisa nahi aaya.</Empty>
  const total = rows.reduce((a, r) => a + r.amount, 0)
  return (
    <>
    <PagedTable
      head={['Ref', 'Date', 'Cash ya bank', 'Bank detail', { label: 'Kitna mila', align: 'right' }, '']}
      rows={rows}
      searchText={(r) => `${r.reference} ${r.payment_date} ${r.method} ${r.bank_ref ?? ''}`}
      searchPlaceholder="Ref ya date se dhoondein…"
      footer={(
        <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
          <td className="px-4 py-2.5 font-bold" colSpan={4}>Kul paisa mila</td>
          <td className="px-4 py-2.5 text-right font-bold" style={{ color: 'var(--green)' }}>{formatPaisa(total)}</td>
          <td />
        </tr>
      )}
      row={(r) => (
        <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
          <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{r.reference}</td>
          <td className="whitespace-nowrap px-4 py-2">{r.payment_date}</td>
          <td className="px-4 py-2 capitalize">{r.method}</td>
          <td className="px-4 py-2" style={{ color: 'var(--muted)' }}>{r.bank_ref || '·'}</td>
          <td className="px-4 py-2 text-right font-medium" style={{ color: 'var(--green)' }}>{formatPaisa(r.amount)}</td>
          <td className="px-4 py-2 text-right">
            <RowActions>
              <IconButton
                icon={Printer}
                label="Parchi dekhein / print karein"
                tone="primary"
                onClick={() => setSlip({ ...r, direction: r.direction ?? 'receipt' })}
              />
              {/* Jo paisa kisi aik bill se juda hai wo yahan se nahi badalta,
                  usay usi bill ki jagah se handle kiya jata hai. */}
              {canManage && !r.allocatable_id && (
                <IconButton icon={SquarePen} label="Rakam ya tareekh theek karein" tone="primary" onClick={() => setEditing(r)} />
              )}
              {canManage && !r.allocatable_id && (
                <IconButton icon={Undo2} label="Rollback (ye entry wapas lein)" tone="red" onClick={async () => {
                  const ok = await confirm({
                    title: `Rollback: ${r.reference}`,
                    message: (
                      <>
                        Ye entry poori wapas le li jayegi aur sab kuch pehle wali haalat par aa jayega:
                        cash, is bande ka khata, aur jo bill is paise se chuke the wo dobara khul jayenge.
                      </>
                    ),
                    confirmText: 'Rollback karein',
                    requireText: 'rollback',
                  })
                  if (ok) rollback.mutate(r.id)
                }} />
              )}
            </RowActions>
          </td>
        </tr>
      )}
    />
    {slip && <PaymentReceipt payment={slip} party={party} onClose={() => setSlip(null)} />}
    {editing && (
      <Modal title={`Theek karein: ${editing.reference}`} onClose={() => setEditing(null)}>
        <PaymentEditForm
          payment={editing}
          party={party}
          onSubmit={(payload) => edit.mutate({ id: editing.id, payload })}
          busy={edit.isPending}
          error={edit.error ? apiError(edit.error) : ''}
        />
      </Modal>
    )}
    </>
  )
}

function Returns({ returns, adjustments, party }: { returns: Return[]; adjustments: Adjustment[]; party: string }) {
  const [ret, setRet] = useState<ReturnDoc | null>(null)
  const [adj, setAdj] = useState<AdjustmentDoc | null>(null)
  if (returns.length === 0 && adjustments.length === 0) return <Empty>Na koi maal wapas aaya, na koi hath se theek ki gayi entry.</Empty>
  return (
    <div className="space-y-5">
      {returns.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold" style={{ color: 'var(--text)' }}>Maal wapsi</h3>
          <PagedTable
            head={['Ref', 'Date', { label: 'Maal ki qeemat', align: 'right' }, { label: 'Kaata', align: 'right' }, { label: 'Wapas kiya', align: 'right' }, 'Kaise', '']}
            rows={returns}
            searchText={(r) => `${r.reference} ${r.return_date} ${(r.items ?? []).map((i) => i.product_name ?? '').join(' ')}`}
            searchPlaceholder="Ref, date ya maal se dhoondein…"
            row={(r) => (
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
                <td className="px-4 py-2 text-right">
                  <RowActions>
                    <IconButton
                      icon={Printer}
                      label="Parchi dekhein / print karein"
                      tone="primary"
                      onClick={() => setRet({ ...r, customer: { name: party } })}
                    />
                  </RowActions>
                </td>
              </tr>
            )}
          />
        </div>
      )}
      {adjustments.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold" style={{ color: 'var(--text)' }}>Hath se ki gayi theek</h3>
          <PagedTable
            head={['Ref', 'Date', 'Kya kiya', 'Wajah', { label: 'Kitna', align: 'right' }, '']}
            rows={adjustments}
            searchText={(a) => `${a.reference} ${a.adjustment_date} ${a.reason}`}
            searchPlaceholder="Ref, date ya wajah se dhoondein…"
            row={(a) => (
              <tr key={a.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{a.reference}</td>
                <td className="whitespace-nowrap px-4 py-2">{a.adjustment_date}</td>
                <td className="px-4 py-2">
                  <Badge color={a.mode === 'customer_charge' ? 'amber' : 'green'}>
                    {a.mode === 'customer_charge' ? 'Zyada charge kiya' : 'Chhoot di'}
                  </Badge>
                </td>
                <td className="px-4 py-2" style={{ color: 'var(--muted)' }}>{a.reason}</td>
                <td className="px-4 py-2 text-right font-medium">{formatPaisa(a.amount)}</td>
                <td className="px-4 py-2 text-right">
                  <RowActions>
                    <IconButton
                      icon={Printer}
                      label="Parchi dekhein / print karein"
                      tone="primary"
                      onClick={() => setAdj({ ...a, party_name: party })}
                    />
                  </RowActions>
                </td>
              </tr>
            )}
          />
        </div>
      )}
      {ret && <ReturnNote ret={ret} onClose={() => setRet(null)} />}
      {adj && <AdjustmentVoucher adjustment={adj} onClose={() => setAdj(null)} />}
    </div>
  )
}

function Dispatches({ rows }: { rows: Dispatch[] }) {
  if (rows.length === 0) return <Empty>Abhi koi delivery nahi hui.</Empty>
  return (
    <PagedTable
      head={['Ref', 'Date', 'Driver', 'Gaari', 'Kya gaya', 'Haal']}
      rows={rows}
      searchText={(d) => `${d.reference} ${d.dispatch_date} ${d.driver?.name ?? ''} ${d.vehicle?.name ?? ''} ${d.vehicle?.plate ?? ''} ${(d.items ?? []).map((i) => i.product_name ?? '').join(' ')} ${d.status}`}
      searchPlaceholder="Ref, driver ya gaari se dhoondein…"
      row={(d) => (
        <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
          <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{d.reference}</td>
          <td className="whitespace-nowrap px-4 py-2">{d.dispatch_date}</td>
          <td className="px-4 py-2">{d.driver?.name ?? '·'}</td>
          <td className="px-4 py-2" style={{ color: 'var(--muted)' }}>{[d.vehicle?.name, d.vehicle?.plate].filter(Boolean).join(' ') || '·'}</td>
          <td className="px-4 py-2">{(d.items ?? []).map((i) => `${i.product_name ?? 'Item'} × ${i.quantity}`).join(', ') || '·'}</td>
          <td className="px-4 py-2"><Badge color={d.status === 'delivered' ? 'green' : 'amber'}>{d.status}</Badge></td>
        </tr>
      )}
    />
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
