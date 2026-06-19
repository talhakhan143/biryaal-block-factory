import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Badge, Button, type Column, DataTable, Field, Input, MethodField, Modal, MoneyInput, PageHeader, Select } from '../components/ui'

interface SalesReturn {
  id: string
  reference: string
  customer?: { name: string }
  return_date: string
  return_value: number
  deduction: number
  refund_amount: number
  refund_mode: string
}

export default function Returns() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('return_date')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const { data, isLoading } = useList<SalesReturn>('sales-returns', { page, search, sort, dir })

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }

  const create = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/sales-returns', p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales-returns'] }); setCreating(false) },
  })

  const columns: Column<SalesReturn>[] = [
    { key: 'reference', label: 'Ref', sortable: true, render: (r) => <span className="font-mono text-xs">{r.reference}</span> },
    { key: 'return_date', label: 'Date', sortable: true, render: (r) => r.return_date },
    { key: 'customer', label: 'Customer', render: (r) => r.customer?.name ?? 'Walk-in' },
    { key: 'return_value', label: 'Return Value', sortable: true, align: 'right', render: (r) => formatPaisa(r.return_value) },
    { key: 'deduction', label: 'Deduction', sortable: true, align: 'right', render: (r) => formatPaisa(r.deduction) },
    { key: 'refund_amount', label: 'Refund', sortable: true, align: 'right', render: (r) => <span className="font-semibold">{formatPaisa(r.refund_amount)}</span> },
    { key: 'refund_mode', label: 'Mode', sortable: true, render: (r) => <Badge color="blue">{r.refund_mode}</Badge> },
  ]

  return (
    <div>
      <PageHeader
        title="Block Return (Wapsi)"
        subtitle="Block wapas — stock me wapas, paisa refund (kiraya/cut ke baad)"
        actions={can('sales.manage') && <Button onClick={() => setCreating(true)}>+ Return</Button>}
      />
      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading}
        emptyText="Koi return nahi."
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Ref ya customer se search…"
        sort={sort}
        dir={dir}
        onSort={onSort}
        meta={data?.meta}
        page={page}
        onPage={setPage}
      />
      {creating && (
        <Modal title="New Block Return" onClose={() => setCreating(false)}>
          <ReturnForm onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error ? apiError(create.error) : ''} />
        </Modal>
      )}
    </div>
  )
}

function ReturnForm({ onSubmit, busy, error }: { onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const customers = useList<{ id: string; name: string }>('customers', { per_page: 100 })
  const products = useList<{ id: string; name: string; sale_price: number }>('products', { per_page: 100 })
  const [form, setForm] = useState({ customer_id: '', return_date: new Date().toISOString().slice(0, 10), deduction: '0', refund_mode: 'cash', bank_ref: '' })
  const [items, setItems] = useState<{ product_id: string; quantity: string; unit_price: string }[]>([{ product_id: '', quantity: '', unit_price: '' }])
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })

  const returnValue = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
  const refund = Math.max(0, returnValue - Number(form.deduction || 0))
  const validItems = items.filter((i) => i.product_id && Number(i.quantity) > 0 && Number(i.unit_price) > 0)
  const accountNoCustomer = form.refund_mode === 'account' && !form.customer_id
  const bankNoRef = form.refund_mode === 'bank' && !form.bank_ref.trim()
  const blockSubmit = validItems.length === 0 || accountNoCustomer || bankNoRef

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (blockSubmit) return
        onSubmit({
          customer_id: form.customer_id || null,
          return_date: form.return_date,
          deduction: Number(form.deduction || 0),
          refund_mode: form.refund_mode,
          bank_ref: form.refund_mode === 'bank' ? form.bank_ref : undefined,
          items: validItems.map((i) => ({
            product_id: i.product_id, quantity: Number(i.quantity), unit_price: Number(i.unit_price),
          })),
        })
      }}
      className="space-y-3"
    >
      <Field label="Customer (Grahak)">
        <Select value={form.customer_id} onChange={(e) => set('customer_id', e.target.value)}>
          <option value="">Walk-in</option>
          {customers.data?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>

      <div>
        <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }}>Wapas aaye blocks</span>
        {items.map((it, idx) => (
          <div key={idx} className="mb-2 flex gap-2">
            <Select value={it.product_id} onChange={(e) => {
              const p = products.data?.data.find((x) => x.id === e.target.value)
              setItems(items.map((x, i) => (i === idx ? { ...x, product_id: e.target.value, unit_price: x.unit_price || (p ? String(p.sale_price / 100) : '') } : x)))
            }}>
              <option value="">Product…</option>
              {products.data?.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Input type="number" placeholder="Qty" value={it.quantity} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))} className="w-20" />
            <Input type="number" placeholder="Rate" value={it.unit_price} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, unit_price: e.target.value } : x)))} className="w-24" />
            {items.length > 1 && <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} style={{ color: 'var(--red)' }}>✕</button>}
          </div>
        ))}
        <button type="button" className="text-sm" style={{ color: 'var(--primary)' }} onClick={() => setItems([...items, { product_id: '', quantity: '', unit_price: '' }])}>+ Add</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Deduction / cut (Rs)"><MoneyInput value={form.deduction} onChange={(v) => set('deduction', v)} /></Field>
        <Field label="Refund kaise">
          <Select value={form.refund_mode} onChange={(e) => set('refund_mode', e.target.value)}>
            <option value="cash">Cash wapas</option>
            <option value="bank">Bank wapas</option>
            <option value="account">Customer ke khaate me (dues kam)</option>
          </Select>
        </Field>
      </div>
      {form.refund_mode === 'bank' && <MethodField method="bank" bankRef={form.bank_ref} onChange={(_, b) => set('bank_ref', b)} />}

      <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface-2)' }}>
        <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Return value</span><span>{formatPaisa(returnValue * 100)}</span></div>
        <div className="flex justify-between font-bold"><span>Refund</span><span>{formatPaisa(refund * 100)}</span></div>
      </div>

      {validItems.length === 0 && <p className="text-sm" style={{ color: 'var(--red)' }}>Kam az kam aik block (product + qty + rate) daalein.</p>}
      {accountNoCustomer && <p className="text-sm" style={{ color: 'var(--red)' }}>Khaate (account) me refund ke liye customer chunna zaroori hai.</p>}
      {bankNoRef && <p className="text-sm" style={{ color: 'var(--red)' }}>Bank refund par bank/reference likhna zaroori hai.</p>}
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy || blockSubmit} className="w-full">{busy ? 'Saving…' : 'Save Return'}</Button>
    </form>
  )
}
