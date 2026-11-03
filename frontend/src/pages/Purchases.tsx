import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Printer, SquarePen, Wallet } from 'lucide-react'
import { Badge, Button, type Column, DataTable, EntityLink, Field, IconButton, Input, MethodField, Modal, MoneyInput, OutstandingNote, PageHeader, RowActions, Select } from '../components/ui'
import { PaymentReceipt, PurchaseBill, type PaymentDoc, type PurchaseDoc } from '../components/receipts'
import { MONEY_KEYS } from '../lib/queryKeys'

interface FreightDriver {
  trip_reference: string
  /** Driver ka khata kholne ke liye. Purani rows me na bhi ho to page chalta rahe. */
  driver_id?: string | null
  driver_name?: string
  vehicle?: string | null
  rate: number
  paid: number
  balance: number
  status: string
}
/** List se jo row aati hai wo poora bill chhapne ke liye kaafi hai. */
interface Purchase extends PurchaseDoc {
  id: string
  /** Supplier ka khata kholne ke liye, naam par click karne par. */
  supplier_id?: string | null
  /** Theek karne wale form me wahi maal pehle se chuna hua aa jaye. */
  raw_material_id?: string | null
  /** Supplier ko kitna dena. Kiraya driver ko gaya ho to wo is me nahi. */
  supplier_bill: number
  payment_status: string
  freight_driver?: FreightDriver | null
}

/** Khareed ka form, nayi likhne aur purani theek karne, dono ke liye aik hi. */
interface PurchaseValues {
  supplier_id: string
  raw_material_id: string
  purchase_date: string
  quantity: string
  unit_cost: string
  loading_cost: string
  paid_amount: string
  method: string
  bank_ref: string
}

/** Row se form, paisa se rupay. Yahan galti ho to rakam 100 guna galat hoti hai. */
const toValues = (p: Purchase): PurchaseValues => ({
  supplier_id: p.supplier_id ?? '',
  raw_material_id: p.raw_material_id ?? '',
  purchase_date: p.purchase_date,
  quantity: String(p.quantity),
  unit_cost: String((p.unit_cost ?? 0) / 100),
  loading_cost: String((p.loading_cost ?? 0) / 100),
  paid_amount: String((p.paid_amount ?? 0) / 100),
  method: p.bank_ref ? 'bank' : 'cash',
  bank_ref: p.bank_ref ?? '',
})

const statusColor: Record<string, string> = { paid: 'green', partial: 'amber', unpaid: 'red' }

export default function Purchases() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('purchase_date')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [payFor, setPayFor] = useState<Purchase | null>(null)
  const [editing, setEditing] = useState<Purchase | null>(null)
  // Khareed ka bill aur paise ki rasid, dono chhapne ke liye.
  const [bill, setBill] = useState<PurchaseDoc | null>(null)
  const [receipt, setReceipt] = useState<PaymentDoc | null>(null)
  const { data, isLoading } = useList<Purchase>('purchases', { page, search, sort, dir })

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }

  const columns: Column<Purchase>[] = [
    { key: 'reference', label: 'Ref', sortable: true, render: (p) => <span className="font-mono text-xs">{p.reference}</span> },
    { key: 'purchase_date', label: 'Date', sortable: true, render: (p) => p.purchase_date },
    {
      key: 'supplier', label: 'Supplier',
      render: (p) => {
        if (!p.supplier?.name) return <span style={{ color: 'var(--muted)' }}>·</span>
        if (!p.supplier_id) return p.supplier.name
        return <EntityLink to={`/suppliers/${p.supplier_id}`} title="Is supplier ka poora khata kholein">{p.supplier.name}</EntityLink>
      },
    },
    { key: 'material', label: 'Material', render: (p) => p.raw_material?.name ?? '·' },
    { key: 'quantity', label: 'Qty', sortable: true, align: 'right', render: (p) => p.quantity },
    { key: 'total_cost', label: 'Maal ki lagat', sortable: true, align: 'right', render: (p) => formatPaisa(p.total_cost) },
    {
      key: 'freight', label: 'Laane wala driver',
      render: (p) => (p.freight_driver
        ? <span className="text-xs">
            {p.freight_driver.driver_id
              ? <EntityLink
                  to={`/drivers/${p.freight_driver.driver_id}`}
                  title={`Trip ${p.freight_driver.trip_reference}${p.freight_driver.vehicle ? `, ${p.freight_driver.vehicle}` : ''}. Driver ka khata kholein`}
                >
                  {p.freight_driver.driver_name}
                </EntityLink>
              : p.freight_driver.driver_name}
            <span style={{ color: 'var(--muted)' }}> · kiraya {formatPaisa(p.freight_driver.rate)}</span>
            {p.freight_driver.balance > 0 && <Badge color="amber">baqi {formatPaisa(p.freight_driver.balance)}</Badge>}
          </span>
        // Khali cell dekh kar banda samajhta hai feature toota hua hai. Kiraya
        // ab bhi sirf "Maal ka Kiraya" par likha jata hai, is liye yahan se
        // seedha wahin bhej dete hain.
        : <EntityLink to="/material-transport" title="Maal ka Kiraya par is khareed ka driver aur kiraya likhein">lagayen</EntityLink>),
    },
    { key: 'payment_status', label: 'Status', sortable: true, render: (p) => <Badge color={statusColor[p.payment_status]}>{p.payment_status}</Badge> },
    {
      key: 'actions', label: '', align: 'right', render: (p) => (
        <RowActions>
          <IconButton icon={Printer} label="Print" tone="primary" onClick={() => setBill(p)} />
          {can('purchases.manage') && (
            <IconButton icon={SquarePen} label="Edit" tone="primary" onClick={() => setEditing(p)} />
          )}
          {can('payments.manage') && p.payment_status !== 'paid' && (
            <IconButton icon={Wallet} label="Pay" tone="primary" onClick={() => setPayFor(p)} />
          )}
        </RowActions>
      ),
    },
  ]

  const create = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/purchases', p),
    onSuccess: (res) => {
      MONEY_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      setCreating(false)
      setBill(res.data.data)
    },
  })

  // Galti sudharna. Backend andar se purana asar hata kar naya lagata hai, is
  // liye stock, supplier ka udhaar aur khata khud nayi values par aa jate hain.
  // Yahan se bas har mutalliqa screen refresh karni hai, aur theek hui parchi
  // dikha deni hai taake nayi chhap ke di ja sake.
  const edit = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.patch(`/purchases/${id}`, payload),
    onSuccess: (res) => {
      MONEY_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      setEditing(null)
      setBill(res.data.data)
    },
  })

  const pay = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.post(`/purchases/${id}/pay`, payload),
    onSuccess: (res) => {
      MONEY_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      setPayFor(null)
      setReceipt(res.data.data)
    },
  })

  return (
    <div>
      <PageHeader
        title="Material Purchases"
        subtitle="Kacha maal khareedna, kharcha aur udhaar"
        actions={can('purchases.manage') && <Button onClick={() => setCreating(true)}>+ Purchase</Button>}
      />
      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading}
        emptyText="Koi purchase nahi."
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Ref, supplier ya material se search…"
        sort={sort}
        dir={dir}
        onSort={onSort}
        meta={data?.meta}
        page={page}
        onPage={setPage}
      />
      {bill && <PurchaseBill purchase={bill} onClose={() => setBill(null)} />}
      {receipt && <PaymentReceipt payment={receipt} onClose={() => setReceipt(null)} />}
      {payFor && (
        <Modal title={`Pay, ${payFor.reference}`} onClose={() => setPayFor(null)}>
          <PayBillForm
            outstanding={payFor.supplier_bill - payFor.paid_amount}
            onSubmit={(payload) => pay.mutate({ id: payFor.id, payload })}
            busy={pay.isPending}
            error={pay.error ? apiError(pay.error) : ''}
          />
        </Modal>
      )}
      {editing && (
        <Modal title={`Theek karein: ${editing.reference}`} onClose={() => setEditing(null)}>
          <PurchaseForm
            initial={toValues(editing)}
            freight={(editing.transport_cost ?? 0) / 100}
            attached={editing.freight_driver}
            submitLabel="Save karein"
            onSubmit={(payload) => edit.mutate({ id: editing.id, payload })}
            busy={edit.isPending}
            error={edit.error ? apiError(edit.error) : ''}
          />
        </Modal>
      )}
      {creating && (
        <Modal title="New Purchase" onClose={() => setCreating(false)}>
          <PurchaseForm onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error ? apiError(create.error) : ''} />
        </Modal>
      )}
    </div>
  )
}

function PayBillForm({ outstanding, onSubmit, busy, error }: { outstanding: number; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ payment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, amount: Number(form.amount) }) }} className="space-y-3">
      <OutstandingNote label="Is bill ka baqi (supplier ko dena)" amount={outstanding} onFill={(rs) => set('amount', String(rs))} />
      <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required /></Field>
      <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Pay'}</Button>
    </form>
  )
}

/**
 * Khareed likhne wala form. Nayi khareed aur purani theek karna, dono isi se
 * chalte hain, warna aik hi cheez do jagah alag dikhne lagti hai.
 */
function PurchaseForm({ initial, freight = 0, attached, submitLabel = 'Record Purchase', onSubmit, busy, error }: {
  initial?: PurchaseValues
  /** Purani entries ka wo kiraya jo bill ke andar chadha hua hai, rupay me. */
  freight?: number
  /** Pehle se laga hua driver, taake edit par wahi nazar aaye aur badla ja sake. */
  attached?: FreightDriver | null
  submitLabel?: string
  onSubmit: (p: Record<string, unknown>) => void
  busy: boolean
  error: string
}) {
  const suppliers = useList<{ id: string; name: string }>('suppliers', { per_page: 100 })
  const materials = useList<{ id: string; name: string; unit: string }>('raw-materials', { per_page: 100 })
  const drivers = useList<{ id: string; name: string; vehicle_name?: string }>('drivers', { per_page: 200 })
  const [form, setForm] = useState<PurchaseValues>(initial ?? {
    supplier_id: '', raw_material_id: '', purchase_date: new Date().toISOString().slice(0, 10),
    quantity: '', unit_cost: '', loading_cost: '0', paid_amount: '0', method: 'cash', bank_ref: '',
  })
  // Driver bill ka hissa nahi hai, is liye alag state me rehta hai: kiraya
  // driver ki apni trip banata hai, maal ki lagat me nahi chadhta.
  const [driverId, setDriverId] = useState(attached?.driver_id ?? '')
  const [freightRate, setFreightRate] = useState(attached ? String(attached.rate / 100) : '')
  const [freightPaid, setFreightPaid] = useState(attached ? String(attached.paid / 100) : '0')
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })

  // Live bill: maal (qty × unit) + loading.
  //
  // Kiraya yahan jaan bujh kar nahi hai. Maal laane wale driver ka kiraya
  // "Maal ka Kiraya" wale page par us driver ke naam likha jata hai. Dono
  // jagah likhne se wahi kiraya do dafa gin liya jata.
  const rs = (n: number) => 'Rs ' + n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const qty = Number(form.quantity) || 0
  const unit = Number(form.unit_cost) || 0
  const goods = qty * unit
  const extras = Number(form.loading_cost) || 0
  const total = goods + extras + freight
  const supplierBill = total
  const paid = Number(form.paid_amount) || 0
  const remaining = supplierBill - paid
  const overpaid = paid > supplierBill && supplierBill > 0

  // Driver aur kiraya aik doosre ke baghair adhoore hain. Aik likha aur doosra
  // chhoot gaya to entry chup chaap gir jati, is liye dono taraf rok lagai hai.
  const rate = Number(freightRate) || 0
  const freightBad = driverId && rate <= 0
    ? 'Driver chuna hai to uska kiraya bhi likhein.'
    : !driverId && rate > 0
      ? 'Kiraya likha hai to laane wala driver bhi chunein.'
      : (Number(freightPaid) || 0) > rate
        ? 'Driver ko kiraye se zyada paisa nahi diya ja sakta.'
        : ''

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (overpaid || freightBad) return
        onSubmit({
          ...form,
          quantity: Number(form.quantity),
          unit_cost: Number(form.unit_cost),
          loading_cost: Number(form.loading_cost),
          paid_amount: Number(form.paid_amount),
          // Theek karte waqt driver_id hamesha jata hai: khali bhejna hi wo
          // ishara hai ke pehle laga hua driver aur uska kiraya hata do. Nayi
          // khareed me khali ho to key bheji hi nahi jaati.
          ...(driverId && rate > 0
            ? { driver_id: driverId, freight_rate: rate, freight_paid: Number(freightPaid) || 0 }
            : initial ? { driver_id: null } : {}),
        })
      }}
      className="space-y-3"
    >
      <Field label="Supplier">
        <Select value={form.supplier_id} onChange={(e) => set('supplier_id', e.target.value)} required>
          <option value="">Select…</option>
          {suppliers.data?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
      <Field label="Material">
        <Select value={form.raw_material_id} onChange={(e) => set('raw_material_id', e.target.value)} required>
          <option value="">Select…</option>
          {materials.data?.data.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={form.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} required /></Field>
        <Field label="Quantity"><Input type="number" step="0.001" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} required /></Field>
        <Field label="Unit cost (Rs)"><MoneyInput value={form.unit_cost} onChange={(v) => set('unit_cost', v)} required /></Field>
        <Field label="Loading (Rs, total)"><MoneyInput value={form.loading_cost} onChange={(v) => set('loading_cost', v)} /></Field>
        <Field label="Paid now (Rs)"><MoneyInput value={form.paid_amount} onChange={(v) => set('paid_amount', v)} /></Field>
      </div>

      {/* Maal laane wala driver, nayi khareed par bhi aur theek karte waqt bhi.
          Galat driver chun liya ho to yahin se badalta hai, aur "Koi driver nahi"
          karne par uska kiraya poora hat jata hai. */}
      {(
        <div className="rounded-lg px-3 py-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <Field label="Laane wala driver (marzi se)">
            <Select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">Koi driver nahi</option>
              {drivers.data?.data.map((d) => (
                <option key={d.id} value={d.id}>{d.name}{d.vehicle_name ? ` (${d.vehicle_name})` : ''}</option>
              ))}
            </Select>
          </Field>
          {/* Kiraya ke khane hamesha nazar aate hain. Pehle driver chunne par
              khulte the aur banda samajhta tha yahan kiraya likha hi nahi ja sakta. */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Kiraya (Rs)"><MoneyInput value={freightRate} onChange={setFreightRate} /></Field>
            <Field label="Kiraya abhi diya (Rs)"><MoneyInput value={freightPaid} onChange={setFreightPaid} /></Field>
          </div>
          {freightBad && <p className="mt-2 text-sm" style={{ color: 'var(--red)' }}>{freightBad}</p>}
          <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
            Kiraya is bill me nahi chadhta. Driver ke naam alag likha jata hai, bilkul waise jaise "Maal ka Kiraya"
            page par, is liye wo aik hi dafa ginna jata hai.
          </p>
        </div>
      )}

      {/* Live bill total */}
      <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Maal ({qty || 0} × {rs(unit)})</span><span>{rs(goods)}</span></div>
        <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Loading</span><span>{rs(extras)}</span></div>
        {freight > 0 && (
          // Purani entry ka kiraya. Form me iska khana nahi, magar bill me
          // chadha hua hai, is liye dikhana zaroori hai warna total ghalat
          // lagta hai.
          <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Purana kiraya (bill me chadha hua)</span><span>{rs(freight)}</span></div>
        )}
        <div className="mt-1 flex justify-between border-t pt-1 text-base font-bold" style={{ borderColor: 'var(--border)' }}>
          <span>Maal ki kul lagat</span><span style={{ color: 'var(--primary)' }}>{rs(total)}</span>
        </div>
        {paid > 0 && (
          <>
            <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Abhi diya</span><span>{rs(paid)}</span></div>
            <div className="flex justify-between font-semibold"><span>Baqi (udhaar)</span><span style={{ color: remaining > 0 ? 'var(--amber)' : 'var(--green)' }}>{rs(Math.max(remaining, 0))}</span></div>
          </>
        )}
      </div>
      {overpaid && <p className="text-sm" style={{ color: 'var(--red)' }}>Supplier ko diya hua amount uske bill ({rs(supplierBill)}) se zyada hai. Kam karein.</p>}

      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy || overpaid || !!freightBad} className="w-full">{busy ? 'Saving…' : submitLabel}</Button>
    </form>
  )
}
