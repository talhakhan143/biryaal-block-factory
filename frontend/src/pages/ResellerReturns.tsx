import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Badge, Button, type Column, DataTable, Field, Input, Modal, MoneyInput, PageHeader, Select } from '../components/ui'
import type { ResellerItem } from './ResellerItems'

interface Return {
  id: string
  reference: string
  customer?: { name: string }
  return_date: string
  return_value: number
  deduction: number
  refund_amount: number
  refund_mode: string
}

export default function ResellerReturns() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('return_date')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const { data, isLoading } = useList<Return>('reseller/returns', { page, search, sort, dir })
  const manage = can('reseller.manage')

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }

  const create = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/reseller/returns', p),
    onSuccess: () => {
      ['reseller/returns', 'reseller/items', 'reseller/sales', 'reseller/dashboard', 'reseller/receivables', 'reseller/payables', 'reseller/payments'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      setCreating(false)
    },
  })

  const columns: Column<Return>[] = [
    { key: 'reference', label: 'Ref', sortable: true, render: (r) => <span className="font-mono text-xs">{r.reference}</span> },
    { key: 'return_date', label: 'Date', sortable: true, render: (r) => r.return_date },
    { key: 'customer', label: 'Customer', render: (r) => r.customer?.name ?? '—' },
    { key: 'return_value', label: 'Value', align: 'right', render: (r) => formatPaisa(r.return_value) },
    { key: 'deduction', label: 'Deduction', align: 'right', render: (r) => formatPaisa(r.deduction) },
    { key: 'refund_amount', label: 'Refund', sortable: true, align: 'right', render: (r) => formatPaisa(r.refund_amount) },
    { key: 'refund_mode', label: 'Mode', render: (r) => <Badge color={r.refund_mode === 'cash' ? 'amber' : 'blue'}>{r.refund_mode}</Badge> },
  ]

  return (
    <div>
      <PageHeader
        title="Reseller Returns"
        subtitle="Maal wapas — stock wapas, udhaar/cash adjust"
        actions={manage && <Button onClick={() => setCreating(true)}>+ Return</Button>}
      />
      <DataTable
        columns={columns} rows={data?.data} loading={isLoading} emptyText="Koi return nahi."
        search={search} onSearch={(v) => { setSearch(v); setPage(1) }} searchPlaceholder="Ref se search…"
        sort={sort} dir={dir} onSort={onSort} meta={data?.meta} page={page} onPage={setPage}
      />
      {creating && (
        <Modal title="Maal Wapas (Return)" onClose={() => setCreating(false)}>
          <ReturnForm onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error ? apiError(create.error) : ''} />
        </Modal>
      )}
    </div>
  )
}

function ReturnForm({ onSubmit, busy, error }: { onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const customers = useList<{ id: string; name: string }>('customers', { per_page: 100 })
  const items = useList<ResellerItem>('reseller/items', { per_page: 100 })
  const [form, setForm] = useState({ customer_id: '', return_date: new Date().toISOString().slice(0, 10), deduction: '0', refund_mode: 'account', notes: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  const [lines, setLines] = useState<{ reseller_item_id: string; quantity: string; unit_price: string }[]>([{ reseller_item_id: '', quantity: '', unit_price: '' }])
  const setLine = (i: number, k: string, v: string) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)))
  const addLine = () => setLines((ls) => [...ls, { reseller_item_id: '', quantity: '', unit_price: '' }])
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i))

  const value = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0)
  const refund = Math.max(0, value - (Number(form.deduction) || 0))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const valid = lines.filter((l) => l.reseller_item_id && Number(l.quantity) > 0 && l.unit_price !== '')
        if (valid.length === 0) return
        onSubmit({
          customer_id: form.customer_id || null,
          return_date: form.return_date,
          deduction: Number(form.deduction),
          refund_mode: form.refund_mode,
          notes: form.notes,
          items: valid.map((l) => ({ reseller_item_id: l.reseller_item_id, quantity: Number(l.quantity), unit_price: Number(l.unit_price) })),
        })
      }}
      className="space-y-3"
    >
      <Field label="Customer">
        <Select value={form.customer_id} onChange={(e) => {
          const cid = e.target.value
          setForm((f) => ({ ...f, customer_id: cid, refund_mode: cid ? f.refund_mode : 'cash' }))
        }}>
          <option value="">Walk-in (cash refund)</option>
          {customers.data?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>

      <div className="space-y-2">
        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>Items wapas</div>
        {lines.map((l, i) => {
          const selItem = items.data?.data.find((x) => x.id === l.reseller_item_id)
          const lineTotal = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0)
          return (
            <div key={i} className="rounded-lg border p-2" style={{ borderColor: 'var(--border)' }}>
              <div className="flex gap-2">
                <Select value={l.reseller_item_id} onChange={(e) => {
                  const it = items.data?.data.find((x) => x.id === e.target.value)
                  // Item chunte hi uska rate auto-fill (editable)
                  setLines((ls) => ls.map((x, idx) => idx === i ? { ...x, reseller_item_id: e.target.value, unit_price: it && it.sale_price > 0 ? String(it.sale_price / 100) : x.unit_price } : x))
                }} className="flex-1">
                  <option value="">Item chunein…</option>
                  {items.data?.data.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                </Select>
                {lines.length > 1 && <button type="button" onClick={() => removeLine(i)} className="px-1 text-red-500">✕</button>}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <label className="text-xs" style={{ color: 'var(--muted)' }}>Qty {selItem ? `(${selItem.unit})` : ''}
                  <Input type="number" step="0.001" min="0" value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} />
                </label>
                <label className="text-xs" style={{ color: 'var(--muted)' }}>Rate / unit
                  <MoneyInput value={l.unit_price} onChange={(v) => setLine(i, 'unit_price', v)} />
                </label>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>Line total
                  <div className="mt-1 py-2 font-semibold" style={{ color: 'var(--text)' }}>{formatPaisa(lineTotal * 100)}</div>
                </div>
              </div>
            </div>
          )
        })}
        <button type="button" onClick={addLine} className="text-sm" style={{ color: 'var(--primary)' }}>+ Item add</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Deduction (Rs)"><MoneyInput value={form.deduction} onChange={(v) => set('deduction', v)} /></Field>
        <Field label="Refund mode">
          <Select value={form.refund_mode} onChange={(e) => set('refund_mode', e.target.value)} disabled={!form.customer_id}>
            <option value="account">Udhaar kam karo (account)</option>
            <option value="cash">Cash wapas</option>
          </Select>
        </Field>
      </div>

      <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Return value</span><span>{formatPaisa(value * 100)}</span></div>
        <div className="flex justify-between font-bold"><span>Refund</span><span style={{ color: 'var(--primary)' }}>{formatPaisa(refund * 100)}</span></div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Record Return'}</Button>
    </form>
  )
}
