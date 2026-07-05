import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Wallet } from 'lucide-react'
import { Badge, Button, type Column, DataTable, Field, IconButton, Input, MethodField, Modal, MoneyInput, OutstandingNote, PageHeader, RowActions, Select } from '../components/ui'
import type { RSupplier } from './ResellerSuppliers'
import type { ResellerItem } from './ResellerItems'

interface RPurchase {
  id: string
  reference: string
  supplier?: { name: string }
  item?: { name: string; unit: string }
  purchase_date: string
  quantity: number
  total_cost: number
  paid_amount: number
  payment_status: string
}

const statusColor: Record<string, string> = { paid: 'green', partial: 'amber', unpaid: 'red' }

export default function ResellerPurchases() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('purchase_date')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [payFor, setPayFor] = useState<RPurchase | null>(null)
  const { data, isLoading } = useList<RPurchase>('reseller/purchases', { page, search, sort, dir })
  const manage = can('reseller.manage')

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }

  const columns: Column<RPurchase>[] = [
    { key: 'reference', label: 'Ref', sortable: true, render: (p) => <span className="font-mono text-xs">{p.reference}</span> },
    { key: 'purchase_date', label: 'Date', sortable: true, render: (p) => p.purchase_date },
    { key: 'supplier', label: 'Supplier', render: (p) => p.supplier?.name ?? '—' },
    { key: 'item', label: 'Item', render: (p) => p.item?.name ?? '—' },
    { key: 'quantity', label: 'Qty', sortable: true, align: 'right', render: (p) => `${p.quantity} ${p.item?.unit ?? ''}` },
    { key: 'total_cost', label: 'Total', sortable: true, align: 'right', render: (p) => formatPaisa(p.total_cost) },
    { key: 'payment_status', label: 'Status', sortable: true, render: (p) => <Badge color={statusColor[p.payment_status]}>{p.payment_status}</Badge> },
    {
      key: 'actions', label: '', align: 'right', render: (p) => (
        manage && p.payment_status !== 'paid'
          ? <RowActions><IconButton icon={Wallet} label="Pay" tone="primary" onClick={() => setPayFor(p)} /></RowActions>
          : null
      ),
    },
  ]

  const create = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/reseller/purchases', p),
    onSuccess: () => {
      ['reseller/purchases', 'reseller/items', 'reseller/suppliers', 'reseller/payables', 'reseller/payments', 'reseller/dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      setCreating(false)
    },
  })
  const pay = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.post(`/reseller/purchases/${id}/pay`, payload),
    onSuccess: () => {
      ['reseller/purchases', 'reseller/suppliers', 'reseller/payables', 'reseller/payments', 'reseller/dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      setPayFor(null)
    },
  })

  return (
    <div>
      <PageHeader
        title="Reseller Purchases"
        subtitle="Maal khareedna — stock chadhega, udhaar bhi track hoga"
        actions={manage && <Button onClick={() => setCreating(true)}>+ Khareed</Button>}
      />
      <DataTable
        columns={columns} rows={data?.data} loading={isLoading} emptyText="Koi khareed nahi."
        search={search} onSearch={(v) => { setSearch(v); setPage(1) }} searchPlaceholder="Ref, supplier ya item se search…"
        sort={sort} dir={dir} onSort={onSort} meta={data?.meta} page={page} onPage={setPage}
      />
      {payFor && (
        <Modal title={`Pay — ${payFor.reference}`} onClose={() => setPayFor(null)}>
          <PayBillForm outstanding={payFor.total_cost - payFor.paid_amount} onSubmit={(payload) => pay.mutate({ id: payFor.id, payload })} busy={pay.isPending} error={pay.error ? apiError(pay.error) : ''} />
        </Modal>
      )}
      {creating && (
        <Modal title="Reseller Khareed" onClose={() => setCreating(false)}>
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

function PurchaseForm({ onSubmit, busy, error }: { onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const suppliers = useList<RSupplier>('reseller/suppliers', { per_page: 100, active_only: true })
  const items = useList<ResellerItem>('reseller/items', { per_page: 100, active_only: true })
  const [form, setForm] = useState({
    reseller_supplier_id: '', reseller_item_id: '', purchase_date: new Date().toISOString().slice(0, 10),
    quantity: '', unit_cost: '', sale_price: '', transport_cost: '0', loading_cost: '0', unloading_cost: '0', paid_amount: '0', method: 'cash', bank_ref: '',
  })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })

  const rs = (n: number) => 'Rs ' + n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const qty = Number(form.quantity) || 0
  const unit = Number(form.unit_cost) || 0
  const goods = qty * unit
  const extras = (Number(form.transport_cost) || 0) + (Number(form.loading_cost) || 0) + (Number(form.unloading_cost) || 0)
  const total = goods + extras
  const paid = Number(form.paid_amount) || 0
  const remaining = total - paid
  const overpaid = paid > total && total > 0
  const selItem = items.data?.data.find((i) => i.id === form.reseller_item_id)
  const landed = qty > 0 ? total / qty : unit // landed cost per unit (incl extras)
  const retail = Number(form.sale_price) || 0
  const marginUnit = retail - landed
  const marginTotal = marginUnit * qty

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (overpaid) return
        onSubmit({
          ...form,
          quantity: Number(form.quantity),
          unit_cost: Number(form.unit_cost),
          sale_price: Number(form.sale_price),
          transport_cost: Number(form.transport_cost),
          loading_cost: Number(form.loading_cost),
          unloading_cost: Number(form.unloading_cost),
          paid_amount: Number(form.paid_amount),
        })
      }}
      className="space-y-3"
    >
      <Field label="Supplier">
        <Select value={form.reseller_supplier_id} onChange={(e) => set('reseller_supplier_id', e.target.value)} required>
          <option value="">Select…</option>
          {suppliers.data?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
      <Field label="Item">
        <Select
          value={form.reseller_item_id}
          onChange={(e) => {
            const id = e.target.value
            const it = items.data?.data.find((i) => i.id === id)
            // Cost = item ka avg cost; Retail = item ka sale rate. Dono editable.
            setForm((f) => ({
              ...f,
              reseller_item_id: id,
              unit_cost: it && it.avg_cost > 0 ? String(it.avg_cost / 100) : f.unit_cost,
              sale_price: it && it.sale_price > 0 ? String(it.sale_price / 100) : f.sale_price,
            }))
          }}
          required
        >
          <option value="">Select…</option>
          {items.data?.data.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={form.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} required /></Field>
        <Field label={`Quantity${selItem ? ' (' + selItem.unit + ')' : ''}`}><Input type="number" step="0.001" min="0" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} required /></Field>
        <Field label="Cost / unit (supplier se)"><MoneyInput value={form.unit_cost} onChange={(v) => set('unit_cost', v)} required /></Field>
        <Field label="Retail / unit (customer ko)"><MoneyInput value={form.sale_price} onChange={(v) => set('sale_price', v)} /></Field>
        <Field label="Transport (Rs)"><MoneyInput value={form.transport_cost} onChange={(v) => set('transport_cost', v)} /></Field>
        <Field label="Loading (Rs)"><MoneyInput value={form.loading_cost} onChange={(v) => set('loading_cost', v)} /></Field>
        <Field label="Unloading (Rs)"><MoneyInput value={form.unloading_cost} onChange={(v) => set('unloading_cost', v)} /></Field>
        <Field label="Paid now (Rs)"><MoneyInput value={form.paid_amount} onChange={(v) => set('paid_amount', v)} /></Field>
      </div>

      <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Maal ({qty || 0} × {rs(unit)})</span><span>{rs(goods)}</span></div>
        <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Transport + loading + unloading</span><span>{rs(extras)}</span></div>
        <div className="mt-1 flex justify-between border-t pt-1 text-base font-bold" style={{ borderColor: 'var(--border)' }}>
          <span>Total bill</span><span style={{ color: 'var(--primary)' }}>{rs(total)}</span>
        </div>
        {/* Profit / margin — landed cost vs retail */}
        {retail > 0 && qty > 0 && (
          <div className="mt-1 border-t pt-1" style={{ borderColor: 'var(--border)' }}>
            <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Landed cost / unit</span><span>{rs(landed)}</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Retail / unit</span><span>{rs(retail)}</span></div>
            <div className="flex justify-between font-semibold"><span>Margin / unit</span><span style={{ color: marginUnit >= 0 ? 'var(--green)' : 'var(--red)' }}>{rs(marginUnit)}</span></div>
            <div className="flex justify-between font-bold"><span>Total munafa (is maal par)</span><span style={{ color: marginTotal >= 0 ? 'var(--green)' : 'var(--red)' }}>{rs(marginTotal)}</span></div>
          </div>
        )}
        {paid > 0 && (
          <>
            <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Abhi diya</span><span>{rs(paid)}</span></div>
            <div className="flex justify-between font-semibold"><span>Baqi (udhaar)</span><span style={{ color: remaining > 0 ? 'var(--amber)' : 'var(--green)' }}>{rs(Math.max(remaining, 0))}</span></div>
          </>
        )}
      </div>
      {overpaid && <p className="text-sm" style={{ color: 'var(--red)' }}>Diya hua amount bill ({rs(total)}) se zyada hai — kam karein.</p>}

      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy || overpaid} className="w-full">{busy ? 'Saving…' : 'Record Khareed'}</Button>
    </form>
  )
}
