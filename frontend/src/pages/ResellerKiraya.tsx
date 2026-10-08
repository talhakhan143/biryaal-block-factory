import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Undo2, HandCoins, Printer } from 'lucide-react'
import { Badge, Button, type Column, DataTable, Field, Input, MethodField, Modal, MoneyInput, OutstandingNote, PageHeader, RowActions, IconButton, Select } from '../components/ui'
import { UNITS } from './ResellerItems'
import { PaymentReceipt, RentalVoucher, type PaymentDoc, type RentalDoc } from '../components/receipts'

interface Rental {
  id: string
  reference: string
  customer?: { name: string }
  item_name: string
  unit: string
  quantity: number
  per_day_rate: number
  start_date: string
  return_date?: string
  days: number
  accrued_total: number
  paid_amount: number
  outstanding: number
  status: string
  notes?: string | null
}

export default function ResellerKiraya() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [returning, setReturning] = useState<Rental | null>(null)
  const [collecting, setCollecting] = useState<Rental | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusF, setStatusF] = useState('')
  const [sort, setSort] = useState('start_date')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  // Kiraya bill ki parchiyan qatar me: ek submit se kai rentals ban sakte hain,
  // is liye ek ke baad doosri khulti hai, koi parchi reh na jaye.
  const [bills, setBills] = useState<RentalDoc[]>([])
  const [receipt, setReceipt] = useState<PaymentDoc | null>(null)
  const { data, isLoading } = useList<Rental>('reseller/rentals', { page, search, sort, dir, status: statusF || undefined })
  const manage = can('reseller.manage')

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }

  // Kiraya bhi money hub (receivable/dashboard) ko affect karta, sab refresh
  const invalidate = () => ['reseller/rentals', 'reseller/receivables', 'reseller/payments', 'reseller/dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
  // Naya kiraya: har item ka apna rental banta hai, is liye jawab me poori list aati hai.
  const create = useMutation({ mutationFn: (p: Record<string, unknown>) => api.post('/reseller/rentals', p), onSuccess: (res) => { invalidate(); setCreating(false); setBills(res.data.data ?? []) } })
  const doReturn = useMutation({ mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.post(`/reseller/rentals/${id}/return`, payload), onSuccess: (res) => { invalidate(); setReturning(null); setBills([res.data.data]) } })
  // Yahan parent rental wapas aata hai, parchi alag se `payment` me.
  const collect = useMutation({ mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.post(`/reseller/rentals/${id}/collect`, payload), onSuccess: (res) => { invalidate(); setCollecting(null); setReceipt(res.data.payment) } })

  const columns: Column<Rental>[] = [
    { key: 'reference', label: 'Ref', sortable: true, render: (r) => <span className="font-mono text-xs">{r.reference}</span> },
    { key: 'customer', label: 'Customer', render: (r) => r.customer?.name ?? '·' },
    { key: 'item_name', label: 'Item', render: (r) => <span>{r.item_name} <span style={{ color: 'var(--muted)' }}>× {r.quantity} {r.unit}</span></span> },
    { key: 'per_day_rate', label: 'Rate/day', align: 'right', render: (r) => formatPaisa(r.per_day_rate) },
    { key: 'start_date', label: 'Start', sortable: true, render: (r) => r.start_date },
    { key: 'days', label: 'Din', align: 'right', render: (r) => r.days },
    { key: 'accrued_total', label: 'Kiraya', align: 'right', render: (r) => <span className="font-semibold">{formatPaisa(r.accrued_total)}</span> },
    { key: 'outstanding', label: 'Baqi', align: 'right', render: (r) => <span style={{ color: r.outstanding > 0 ? 'var(--amber)' : 'var(--green)' }}>{formatPaisa(r.outstanding)}</span> },
    { key: 'status', label: 'Status', render: (r) => r.status === 'active' ? <Badge color="blue">Active</Badge> : <Badge color="slate">Returned</Badge> },
    {
      key: 'actions', label: '', align: 'right', render: (r) => (
        <RowActions>
          <IconButton icon={Printer} label="Parchi dekhein / print karein" tone="primary" onClick={() => setBills([r])} />
          {manage && r.status === 'active' && <IconButton icon={Undo2} label="Return" tone="primary" onClick={() => setReturning(r)} />}
          {manage && r.outstanding > 0 && <IconButton icon={HandCoins} label="Collect" tone="green" onClick={() => setCollecting(r)} />}
        </RowActions>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Kiraya (Rental)"
        subtitle="Customer ne items le jayin, har din charge jama, return pe band"
        actions={manage && <Button onClick={() => setCreating(true)}>+ Naya Kiraya</Button>}
      />
      <div className="mb-3 flex gap-2">
        {([['', 'Sab'], ['active', 'Active'], ['returned', 'Returned']] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => { setStatusF(v); setPage(1) }}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium"
            style={statusF === v ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : { borderColor: 'var(--border)', color: 'var(--muted)' }}
          >{label}</button>
        ))}
      </div>
      <DataTable
        columns={columns} rows={data?.data} loading={isLoading} emptyText="Koi kiraya nahi."
        search={search} onSearch={(v) => { setSearch(v); setPage(1) }} searchPlaceholder="Ref ya item se search…"
        sort={sort} dir={dir} onSort={onSort} meta={data?.meta} page={page} onPage={setPage}
      />
      {bills.length > 0 && <RentalVoucher rental={bills[0]} onClose={() => setBills((b) => b.slice(1))} />}
      {receipt && <PaymentReceipt payment={receipt} subtitle="Resellers Point" onClose={() => setReceipt(null)} />}
      {creating && (
        <Modal title="Naya Kiraya" onClose={() => setCreating(false)}>
          <RentalForm onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error ? apiError(create.error) : ''} />
        </Modal>
      )}
      {returning && (
        <Modal title={`Return, ${returning.reference}`} onClose={() => setReturning(null)}>
          <ReturnForm rental={returning} onSubmit={(payload) => doReturn.mutate({ id: returning.id, payload })} busy={doReturn.isPending} error={doReturn.error ? apiError(doReturn.error) : ''} />
        </Modal>
      )}
      {collecting && (
        <Modal title={`Kiraya Collect, ${collecting.reference}`} onClose={() => setCollecting(null)}>
          <CollectForm rental={collecting} onSubmit={(payload) => collect.mutate({ id: collecting.id, payload })} busy={collect.isPending} error={collect.error ? apiError(collect.error) : ''} />
        </Modal>
      )}
    </div>
  )
}

interface RentLine { item_name: string; unit: string; quantity: string; per_day_rate: string }

function RentalForm({ onSubmit, busy, error }: { onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const customers = useList<{ id: string; name: string }>('customers', { per_page: 100 })
  const [head, setHead] = useState({ customer_id: '', start_date: new Date().toISOString().slice(0, 10), notes: '' })
  const setH = (k: string, v: string) => setHead({ ...head, [k]: v })
  const [lines, setLines] = useState<RentLine[]>([{ item_name: '', unit: 'unit', quantity: '1', per_day_rate: '' }])
  const setLine = (i: number, k: keyof RentLine, v: string) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)))
  const addLine = () => setLines((ls) => [...ls, { item_name: '', unit: 'unit', quantity: '1', per_day_rate: '' }])
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i))

  const perDayTotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.per_day_rate) || 0), 0)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const valid = lines.filter((l) => l.item_name.trim() && Number(l.per_day_rate) > 0)
        if (valid.length === 0) return
        onSubmit({
          customer_id: head.customer_id,
          start_date: head.start_date,
          notes: head.notes,
          items: valid.map((l) => ({ item_name: l.item_name, unit: l.unit, quantity: Number(l.quantity) || 1, per_day_rate: Number(l.per_day_rate) })),
        })
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Customer">
          <Select value={head.customer_id} onChange={(e) => setH('customer_id', e.target.value)} required>
            <option value="">Select…</option>
            {customers.data?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Start date"><Input type="date" value={head.start_date} onChange={(e) => setH('start_date', e.target.value)} required /></Field>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>Items (jo kiraye par diye)</div>
        {lines.map((l, i) => (
          <div key={i} className="rounded-lg border p-2" style={{ borderColor: 'var(--border)' }}>
            <div className="flex gap-2">
              <Input value={l.item_name} onChange={(e) => setLine(i, 'item_name', e.target.value)} placeholder="Shuttering plate, pipe…" className="flex-1" />
              {lines.length > 1 && <button type="button" onClick={() => removeLine(i)} className="text-red-500">✕</button>}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Select value={l.unit} onChange={(e) => setLine(i, 'unit', e.target.value)}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </Select>
              <Input type="number" step="0.001" min="0" placeholder="Qty" value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} />
              <MoneyInput value={l.per_day_rate} onChange={(v) => setLine(i, 'per_day_rate', v)} />
            </div>
            <div className="mt-1 flex justify-between text-[10px]" style={{ color: 'var(--muted)' }}><span>qty × rate/day</span><span>Rs {((Number(l.quantity) || 0) * (Number(l.per_day_rate) || 0)).toLocaleString('en-PK')} / day</span></div>
          </div>
        ))}
        <button type="button" onClick={addLine} className="text-sm" style={{ color: 'var(--primary)' }}>+ Item add</button>
      </div>

      <div className="flex justify-between rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <span>Total / din</span><span style={{ color: 'var(--primary)' }}>Rs {perDayTotal.toLocaleString('en-PK')}</span>
      </div>
      <Field label="Notes"><Input value={head.notes} onChange={(e) => setH('notes', e.target.value)} /></Field>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Start Kiraya'}</Button>
    </form>
  )
}

function ReturnForm({ rental, onSubmit, busy, error }: { rental: Rental; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10))
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ return_date: returnDate }) }} className="space-y-3">
      <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Item</span><span>{rental.item_name} × {rental.quantity} {rental.unit}</span></div>
        <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Rate/day</span><span>{formatPaisa(rental.per_day_rate)}</span></div>
        <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Start</span><span>{rental.start_date}</span></div>
      </div>
      <Field label="Return date"><Input type="date" value={returnDate} min={rental.start_date} onChange={(e) => setReturnDate(e.target.value)} required /></Field>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>Return karne par din × rate × qty final kiraya ban ke freeze ho jayega.</p>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Return & Freeze'}</Button>
    </form>
  )
}

function CollectForm({ rental, onSubmit, busy, error }: { rental: Rental; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ payment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, amount: Number(form.amount) }) }} className="space-y-3">
      <OutstandingNote label="Kiraya baqi (customer se lena)" amount={rental.outstanding} onFill={(rs) => set('amount', String(rs))} />
      <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required /></Field>
      <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Collect'}</Button>
    </form>
  )
}
