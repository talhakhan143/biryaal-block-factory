import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, MapPin, Phone, Printer, Wallet } from 'lucide-react'
import { api, apiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatPaisa } from '../lib/money'
import {
  Badge, Button, Card, Field, IconButton, Input, MethodField, Modal, MoneyInput, Note,
  OutstandingNote, PagedTable, Spinner, StatTile, Tabs,
} from '../components/ui'
import { PaymentReceipt, PurchaseBill, type PaymentDoc, type PurchaseDoc } from '../components/receipts'
import { MONEY_KEYS } from '../lib/queryKeys'

interface LedgerRow {
  date: string
  type: 'purchase' | 'payment' | 'adjustment' | 'other'
  reference: string
  journal_ref: string
  debit: number
  credit: number
  running: number
}
/** Dono rows me poora bill/rasid chhapne ke liye sab kuch mojood hai. */
interface Purchase extends PurchaseDoc {
  id: string
  raw_material?: { name: string; unit?: string } | null
  unit_cost: number; loading_cost: number; unloading_cost: number
  supplier_bill: number; payment_status: string
  freight_driver?: { driver_name?: string; rate: number; balance: number } | null
}
interface PaymentRow extends PaymentDoc { id: string; method: string; bank_ref?: string }
interface AdjRow { id: string; reference: string; mode: string; adjustment_date: string; amount: number; reason: string }
interface History {
  supplier: { id: string; name: string; phone?: string; address?: string; balance: number }
  summary: {
    purchases_count: number; landed_total: number; billed_total: number; freight_to_drivers: number
    paid: number; adjustments: number; outstanding: number; advance: number; balance: number
    first_activity?: string; last_activity?: string; ledger_balance: number; reconciled: boolean
  }
  ledger: LedgerRow[]
  purchases: Purchase[]
  payments: PaymentRow[]
  adjustments: AdjRow[]
}

type TabKey = 'statement' | 'purchases' | 'payments' | 'adjustments'

const TYPE_LABEL: Record<LedgerRow['type'], string> = {
  purchase: 'Maal liya', payment: 'Paisa diya', adjustment: 'Hath se theek kiya', other: 'Aur',
}
const TYPE_COLOR: Record<LedgerRow['type'], string> = {
  purchase: 'blue', payment: 'green', adjustment: 'slate', other: 'slate',
}
const statusColor: Record<string, string> = { paid: 'green', partial: 'amber', unpaid: 'red' }

/** Supplier ki poori history. Customer wale page ka aaina, doosri taraf se. */
export default function SupplierDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { can } = useAuth()
  const [tab, setTab] = useState<TabKey>('statement')
  const [paying, setPaying] = useState(false)
  // Paise ki rasid aur maal ka bill, dono chhapne ke liye.
  const [receipt, setReceipt] = useState<PaymentDoc | null>(null)
  const [bill, setBill] = useState<PurchaseDoc | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['supplier-history', id],
    queryFn: async () => (await api.get<History>(`/suppliers/${id}/history`)).data,
  })

  const pay = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/payments/supplier', { ...payload, supplier_id: id }),
    onSuccess: (res) => {
      ;[...MONEY_KEYS, 'supplier-history'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      setPaying(false)
      setReceipt(res.data.data)
    },
  })

  if (isLoading) return <Spinner />
  if (isError || !data) {
    return (
      <div className="space-y-4">
        <Back onClick={() => navigate('/suppliers')} />
        <Note tone="red">Supplier khul nahi saka. {apiError(error)}</Note>
      </div>
    )
  }

  const { supplier: sp, summary: s } = data
  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'statement', label: 'Khata', count: data.ledger.length },
    { key: 'purchases', label: 'Maal jo liya', count: data.purchases.length },
    { key: 'payments', label: 'Paisa jo diya', count: data.payments.length },
    { key: 'adjustments', label: 'Adjustments', count: data.adjustments.length },
  ]

  return (
    <div>
      <Back onClick={() => navigate('/suppliers')} />

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{sp.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" style={{ color: 'var(--muted)' }}>
            {sp.phone && <span className="inline-flex items-center gap-1"><Phone size={13} /> {sp.phone}</span>}
            {sp.address && <span className="inline-flex items-center gap-1"><MapPin size={13} /> {sp.address}</span>}
            {s.first_activity && <span>Pehla kaam {s.first_activity}</span>}
            {s.last_activity && <span>Aakhri kaam {s.last_activity}</span>}
          </div>
        </div>
        {can('payments.manage') && s.outstanding > 0 && (
          <Button onClick={() => setPaying(true)}><Wallet size={15} className="mr-1.5 inline" />Paisa dein</Button>
        )}
      </div>

      <div className="bf-stagger mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Kitna dena hai" value={formatPaisa(s.outstanding)} hint="Abhi tak ka baqi" tone={s.outstanding > 0 ? 'red' : 'green'} />
        <StatTile label="Advance diya hua" value={formatPaisa(s.advance)} hint={s.advance > 0 ? 'Agle bill me se katega' : 'Koi advance nahi'} tone={s.advance > 0 ? 'amber' : 'text'} />
        <StatTile label="Ab tak ka maal" value={formatPaisa(s.billed_total)} hint={`${s.purchases_count} bill`} tone="primary" />
        <StatTile label="Paisa diya" value={formatPaisa(s.paid)} hint="Cash aur bank, dono" tone="green" />
        <StatTile
          label="Kiraya driver ko"
          value={formatPaisa(s.freight_to_drivers)}
          hint={s.freight_to_drivers > 0 ? 'Is supplier ke bill me nahi' : 'Koi nahi'}
          tone={s.freight_to_drivers > 0 ? 'amber' : 'text'}
        />
      </div>

      {!s.reconciled && (
        <div className="mb-4">
          <Note tone="red">
            Khate ka jorh (<strong>{formatPaisa(s.ledger_balance)}</strong>) aur supplier ka apna hisaab
            (<strong>{formatPaisa(s.balance)}</strong>) match nahi kar rahe. Munshi ko dikhayein.
          </Note>
        </div>
      )}

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'statement' && <Statement rows={data.ledger} balance={s.balance} />}
      {tab === 'purchases' && <Purchases rows={data.purchases} onPrint={(p) => setBill({ ...p, supplier: { name: sp.name } })} />}
      {tab === 'payments' && <Payments rows={data.payments} onPrint={setReceipt} />}
      {tab === 'adjustments' && <Adjustments rows={data.adjustments} />}

      {receipt && <PaymentReceipt payment={receipt} party={sp.name} onClose={() => setReceipt(null)} />}
      {bill && <PurchaseBill purchase={bill} onClose={() => setBill(null)} />}

      {paying && (
        <Modal title={`Paisa dein: ${sp.name}`} onClose={() => setPaying(false)}>
          <PayForm
            outstanding={s.outstanding}
            onSubmit={(p) => pay.mutate(p)}
            busy={pay.isPending}
            error={pay.error ? apiError(pay.error) : ''}
          />
        </Modal>
      )}
    </div>
  )
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium transition hover:underline" style={{ color: 'var(--primary)' }}>
      <ArrowLeft size={15} /> Suppliers
    </button>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <Card><p className="text-sm" style={{ color: 'var(--muted)' }}>{children}</p></Card>
}

function Statement({ rows, balance }: { rows: LedgerRow[]; balance: number }) {
  if (rows.length === 0) return <Note>Is supplier ke sath abhi koi lein dein nahi hua.</Note>
  return (
    <PagedTable
      head={['Date', 'Kya hua', 'Ref', { label: 'Dena barha', align: 'right' }, { label: 'Paisa diya', align: 'right' }, { label: 'Baqi raha', align: 'right' }]}
      rows={rows}
      searchText={(r) => `${r.date} ${r.reference} ${TYPE_LABEL[r.type]}`}
      searchPlaceholder="Date ya ref se dhoondein…"
      footer={(
        <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
          <td className="px-4 py-2.5 font-bold" colSpan={5}>{balance < 0 ? 'Advance diya hua' : 'Ab kitna dena hai'}</td>
          <td className="px-4 py-2.5 text-right font-bold" style={{ color: balance > 0 ? 'var(--amber)' : 'var(--green)' }}>{formatPaisa(Math.abs(balance))}</td>
        </tr>
      )}
      row={(r) => (
        <tr key={r.journal_ref} style={{ borderTop: '1px solid var(--border)' }}>
          <td className="whitespace-nowrap px-4 py-2">{r.date}</td>
          <td className="px-4 py-2"><Badge color={TYPE_COLOR[r.type]}>{TYPE_LABEL[r.type]}</Badge></td>
          <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{r.reference}</td>
          <td className="px-4 py-2 text-right">{r.credit ? formatPaisa(r.credit) : '·'}</td>
          <td className="px-4 py-2 text-right" style={{ color: r.debit ? 'var(--green)' : undefined }}>{r.debit ? formatPaisa(r.debit) : '·'}</td>
          <td className="px-4 py-2 text-right font-semibold">{formatPaisa(r.running)}</td>
        </tr>
      )}
    />
  )
}

function Purchases({ rows, onPrint }: { rows: Purchase[]; onPrint: (p: Purchase) => void }) {
  if (rows.length === 0) return <Empty>Is supplier se abhi kuch nahi khareeda.</Empty>
  return (
    <PagedTable
      head={['Ref', 'Date', 'Maal', { label: 'Kitna', align: 'right' }, { label: 'Bill', align: 'right' }, { label: 'Diya', align: 'right' }, 'Laaya', 'Haal', { label: 'Parchi', align: 'right' }]}
      rows={rows}
      searchText={(p) => `${p.reference} ${p.purchase_date} ${p.raw_material?.name ?? ''} ${p.freight_driver?.driver_name ?? ''} ${p.payment_status}`}
      searchPlaceholder="Ref, date ya maal se dhoondein…"
      row={(p) => (
        <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
          <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{p.reference}</td>
          <td className="whitespace-nowrap px-4 py-2">{p.purchase_date}</td>
          <td className="px-4 py-2">{p.raw_material?.name ?? '·'}</td>
          <td className="px-4 py-2 text-right">{p.quantity} {p.raw_material?.unit ?? ''}</td>
          <td className="px-4 py-2 text-right">{formatPaisa(p.supplier_bill)}</td>
          <td className="px-4 py-2 text-right" style={{ color: 'var(--green)' }}>{formatPaisa(p.paid_amount)}</td>
          <td className="px-4 py-2" style={{ color: 'var(--muted)' }}>
            {p.freight_driver ? `${p.freight_driver.driver_name} (${formatPaisa(p.freight_driver.rate)})` : '·'}
          </td>
          <td className="px-4 py-2"><Badge color={statusColor[p.payment_status]}>{p.payment_status}</Badge></td>
          <td className="px-4 py-2 text-right">
            <IconButton icon={Printer} label="Parchi dekhein / print karein" tone="primary" onClick={() => onPrint(p)} />
          </td>
        </tr>
      )}
    />
  )
}

function Payments({ rows, onPrint }: { rows: PaymentRow[]; onPrint: (r: PaymentRow) => void }) {
  if (rows.length === 0) return <Empty>Is supplier ko abhi koi paisa nahi diya.</Empty>
  const total = rows.reduce((a, r) => a + r.amount, 0)
  return (
    <PagedTable
      head={['Ref', 'Date', 'Cash ya bank', 'Bank detail', { label: 'Kitna diya', align: 'right' }, { label: 'Parchi', align: 'right' }]}
      rows={rows}
      searchText={(r) => `${r.reference} ${r.payment_date} ${r.method} ${r.bank_ref ?? ''}`}
      searchPlaceholder="Ref ya date se dhoondein…"
      footer={(
        <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
          <td className="px-4 py-2.5 font-bold" colSpan={4}>Kul paisa diya</td>
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
            <IconButton icon={Printer} label="Parchi dekhein / print karein" tone="primary" onClick={() => onPrint(r)} />
          </td>
        </tr>
      )}
    />
  )
}

function Adjustments({ rows }: { rows: AdjRow[] }) {
  if (rows.length === 0) return <Empty>Koi hath se ki gayi entry nahi.</Empty>
  return (
    <PagedTable
      head={['Ref', 'Date', 'Kya kiya', 'Wajah', { label: 'Kitna', align: 'right' }]}
      rows={rows}
      searchText={(a) => `${a.reference} ${a.adjustment_date} ${a.reason}`}
      searchPlaceholder="Ref, date ya wajah se dhoondein…"
      row={(a) => (
        <tr key={a.id} style={{ borderTop: '1px solid var(--border)' }}>
          <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{a.reference}</td>
          <td className="whitespace-nowrap px-4 py-2">{a.adjustment_date}</td>
          <td className="px-4 py-2">
            <Badge color={a.mode === 'supplier_charge' ? 'amber' : 'green'}>
              {a.mode === 'supplier_charge' ? 'Dena barha' : 'Chhoot mili'}
            </Badge>
          </td>
          <td className="px-4 py-2" style={{ color: 'var(--muted)' }}>{a.reason}</td>
          <td className="px-4 py-2 text-right font-medium">{formatPaisa(a.amount)}</td>
        </tr>
      )}
    />
  )
}

function PayForm({ outstanding, onSubmit, busy, error }: { outstanding: number; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ payment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, amount: Number(form.amount) }) }} className="space-y-3">
      <OutstandingNote label="Is supplier ko kitna dena hai" amount={outstanding} onFill={(rs) => set('amount', String(rs))} />
      <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required /></Field>
      <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Paisa dein'}</Button>
    </form>
  )
}
