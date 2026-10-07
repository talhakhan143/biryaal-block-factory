import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Car, Phone, Wallet } from 'lucide-react'
import { api, apiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatPaisa } from '../lib/money'
import {
  Badge, Button, Card, Field, Input, MethodField, Modal, MoneyInput, Note,
  OutstandingNote, Spinner, StatTile, Table, Tabs,
} from '../components/ui'
import { MONEY_KEYS } from '../lib/queryKeys'

interface LedgerRow {
  date: string
  type: 'trip' | 'payment' | 'other'
  reference: string
  journal_ref: string
  debit: number
  credit: number
  running: number
}
interface Trip {
  id: string; reference: string; kind: string; trip_date: string
  vehicle_label?: string; notes?: string
  rate: number; paid: number; balance: number; status: string
}
interface PaymentRow { id: string; reference: string; payment_date: string; amount: number; method: string; bank_ref?: string; notes?: string }
interface History {
  driver: { id: string; name: string; phone?: string; vehicle_name?: string; vehicle_plate?: string; balance: number }
  summary: {
    trips_count: number; kiraya_total: number
    inbound_count: number; inbound_total: number
    outbound_count: number; outbound_total: number
    paid: number; outstanding: number; advance: number; balance: number
    first_activity?: string; last_activity?: string; ledger_balance: number; reconciled: boolean
  }
  ledger: LedgerRow[]
  trips: Trip[]
  payments: PaymentRow[]
}

type TabKey = 'statement' | 'in' | 'out' | 'payments'

const statusColor: Record<string, string> = { paid: 'green', partial: 'amber', unpaid: 'red' }

/**
 * Driver ki poori history. Wahi banda dono taraf kaam karta hai: maal laata
 * bhi hai aur customer tak pohanchata bhi hai, is liye dono yahan aik sath
 * hain, bas alag alag tab me.
 */
export default function DriverDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { can } = useAuth()
  const [tab, setTab] = useState<TabKey>('statement')
  const [paying, setPaying] = useState(false)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['driver-history', id],
    queryFn: async () => (await api.get<History>(`/drivers/${id}/history`)).data,
  })

  const pay = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post(`/drivers/${id}/pay`, payload),
    onSuccess: () => {
      ;[...MONEY_KEYS, 'driver-history'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      setPaying(false)
    },
  })

  if (isLoading) return <Spinner />
  if (isError || !data) {
    return (
      <div className="space-y-4">
        <Back onClick={() => navigate('/drivers')} />
        <Note tone="red">Driver khul nahi saka. {apiError(error)}</Note>
      </div>
    )
  }

  const { driver: d, summary: s } = data
  const inbound = data.trips.filter((t) => t.kind === 'in')
  const outbound = data.trips.filter((t) => t.kind !== 'in')
  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'statement', label: 'Khata', count: data.ledger.length },
    { key: 'in', label: 'Maal laaya', count: inbound.length },
    { key: 'out', label: 'Maal bheja', count: outbound.length },
    { key: 'payments', label: 'Paisa mila', count: data.payments.length },
  ]

  return (
    <div>
      <Back onClick={() => navigate('/drivers')} />

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{d.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" style={{ color: 'var(--muted)' }}>
            {d.phone && <span className="inline-flex items-center gap-1"><Phone size={13} /> {d.phone}</span>}
            {d.vehicle_name && <span className="inline-flex items-center gap-1"><Car size={13} /> {d.vehicle_name} {d.vehicle_plate}</span>}
            {s.first_activity && <span>Pehla kaam {s.first_activity}</span>}
            {s.last_activity && <span>Aakhri kaam {s.last_activity}</span>}
          </div>
        </div>
        {can('payments.manage') && s.outstanding > 0 && (
          <Button onClick={() => setPaying(true)}><Wallet size={15} className="mr-1.5 inline" />Paisa dein</Button>
        )}
      </div>

      <div className="bf-stagger mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Kitna dena hai" value={formatPaisa(s.outstanding)} hint="Saare kiraye ka baqi" tone={s.outstanding > 0 ? 'red' : 'green'} />
        <StatTile label="Advance diya hua" value={formatPaisa(s.advance)} hint={s.advance > 0 ? 'Agle kiraye me se katega' : 'Koi advance nahi'} tone={s.advance > 0 ? 'amber' : 'text'} />
        <StatTile label="Maal laane ka kiraya" value={formatPaisa(s.inbound_total)} hint={`${s.inbound_count} trip, supplier se factory`} tone="primary" />
        <StatTile label="Maal bhejne ka kiraya" value={formatPaisa(s.outbound_total)} hint={`${s.outbound_count} trip, customer tak`} tone="primary" />
        <StatTile label="Paisa mila" value={formatPaisa(s.paid)} hint="Cash aur bank, dono" tone="green" />
      </div>

      {!s.reconciled && (
        <div className="mb-4">
          <Note tone="red">
            Khate ka jorh (<strong>{formatPaisa(s.ledger_balance)}</strong>) aur driver ka apna hisaab
            (<strong>{formatPaisa(s.balance)}</strong>) match nahi kar rahe. Munshi ko dikhayein.
          </Note>
        </div>
      )}

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'statement' && <Statement rows={data.ledger} balance={s.balance} settledAtOnce={data.trips.filter((t) => t.paid >= t.rate).length} />}
      {tab === 'in' && <Trips rows={inbound} empty="Is driver ne abhi koi maal laaya nahi." />}
      {tab === 'out' && <Trips rows={outbound} empty="Is driver ne abhi koi maal bheja nahi." />}
      {tab === 'payments' && <Payments rows={data.payments} />}

      {paying && (
        <Modal title={`Paisa dein: ${d.name}`} onClose={() => setPaying(false)}>
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
      <ArrowLeft size={15} /> Drivers
    </button>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <Card><p className="text-sm" style={{ color: 'var(--muted)' }}>{children}</p></Card>
}

function Statement({ rows, balance, settledAtOnce }: { rows: LedgerRow[]; balance: number; settledAtOnce: number }) {
  if (rows.length === 0) {
    return (
      <Note>
        Is driver ka koi udhaar nahi chala.
        {settledAtOnce > 0 && <> {settledAtOnce} trip ka kiraya usi waqt poora de diya gaya tha, is liye khate me nahi aata. "Maal laaya" aur "Maal bheja" me saari trips mojood hain.</>}
      </Note>
    )
  }
  return (
    <>
    <Table head={['Date', 'Kya hua', 'Ref', { label: 'Kiraya bana', align: 'right' }, { label: 'Paisa diya', align: 'right' }, { label: 'Baqi raha', align: 'right' }]}>
      {rows.map((r) => (
        <tr key={r.journal_ref} style={{ borderTop: '1px solid var(--border)' }}>
          <td className="whitespace-nowrap px-4 py-2">{r.date}</td>
          <td className="px-4 py-2"><Badge color={r.type === 'trip' ? 'blue' : 'green'}>{r.type === 'trip' ? 'Trip ka kiraya' : 'Paisa diya'}</Badge></td>
          <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{r.reference}</td>
          <td className="px-4 py-2 text-right">{r.credit ? formatPaisa(r.credit) : '·'}</td>
          <td className="px-4 py-2 text-right" style={{ color: r.debit ? 'var(--green)' : undefined }}>{r.debit ? formatPaisa(r.debit) : '·'}</td>
          <td className="px-4 py-2 text-right font-semibold">{formatPaisa(r.running)}</td>
        </tr>
      ))}
      <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
        <td className="px-4 py-2.5 font-bold" colSpan={5}>{balance < 0 ? 'Advance diya hua' : 'Ab kitna dena hai'}</td>
        <td className="px-4 py-2.5 text-right font-bold" style={{ color: balance > 0 ? 'var(--amber)' : 'var(--green)' }}>{formatPaisa(Math.abs(balance))}</td>
      </tr>
    </Table>
    {settledAtOnce > 0 && (
      <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
        {settledAtOnce} trip khate me nahi aayi kyunki uska kiraya usi waqt poora de diya gaya tha.
      </p>
    )}
    </>
  )
}

function Trips({ rows, empty }: { rows: Trip[]; empty: string }) {
  if (rows.length === 0) return <Empty>{empty}</Empty>
  return (
    <Table head={['Ref', 'Date', 'Gaari', 'Tafseel', { label: 'Kiraya', align: 'right' }, { label: 'Diya', align: 'right' }, { label: 'Baqi', align: 'right' }, 'Haal']}>
      {rows.map((t) => (
        <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
          <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{t.reference}</td>
          <td className="whitespace-nowrap px-4 py-2">{t.trip_date}</td>
          <td className="px-4 py-2">{t.vehicle_label ?? '·'}</td>
          <td className="px-4 py-2" style={{ color: 'var(--muted)' }}>{t.notes || '·'}</td>
          <td className="px-4 py-2 text-right">{formatPaisa(t.rate)}</td>
          <td className="px-4 py-2 text-right" style={{ color: 'var(--green)' }}>{formatPaisa(t.paid)}</td>
          <td className="px-4 py-2 text-right" style={{ color: t.balance > 0 ? 'var(--amber)' : undefined }}>{t.balance ? formatPaisa(t.balance) : '·'}</td>
          <td className="px-4 py-2"><Badge color={statusColor[t.status]}>{t.status}</Badge></td>
        </tr>
      ))}
    </Table>
  )
}

function Payments({ rows }: { rows: PaymentRow[] }) {
  if (rows.length === 0) return <Empty>Is driver ko abhi koi paisa nahi diya.</Empty>
  const total = rows.reduce((a, r) => a + r.amount, 0)
  return (
    <Table head={['Ref', 'Date', 'Cash ya bank', 'Tafseel', { label: 'Kitna diya', align: 'right' }]}>
      {rows.map((r) => (
        <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
          <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{r.reference}</td>
          <td className="whitespace-nowrap px-4 py-2">{r.payment_date}</td>
          <td className="px-4 py-2 capitalize">{r.method}</td>
          <td className="px-4 py-2" style={{ color: 'var(--muted)' }}>{r.notes || r.bank_ref || '·'}</td>
          <td className="px-4 py-2 text-right font-medium" style={{ color: 'var(--green)' }}>{formatPaisa(r.amount)}</td>
        </tr>
      ))}
      <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
        <td className="px-4 py-2.5 font-bold" colSpan={4}>Kul paisa diya</td>
        <td className="px-4 py-2.5 text-right font-bold" style={{ color: 'var(--green)' }}>{formatPaisa(total)}</td>
      </tr>
    </Table>
  )
}

function PayForm({ outstanding, onSubmit, busy, error }: { outstanding: number; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ payment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, amount: Number(form.amount) }) }} className="space-y-3">
      <OutstandingNote label="Is driver ko kitna dena hai" amount={outstanding} onFill={(rs) => set('amount', String(rs))} />
      <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required /></Field>
      <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Paisa dein'}</Button>
    </form>
  )
}
