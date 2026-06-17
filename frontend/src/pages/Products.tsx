import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Badge, Button, Field, Input, Modal, MoneyInput, PageHeader, Spinner, Table } from '../components/ui'

interface Product {
  id: string
  name: string
  sku: string
  size?: string
  unit: string
  default_curing_days: number
  sale_price: number
  low_stock_threshold: number
  is_active: boolean
}

export default function Products() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Product | null>(null)
  const [creating, setCreating] = useState(false)
  const { data, isLoading } = useList<Product>('products', { per_page: 100 })
  const manage = can('inventory.manage')

  const save = useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: Record<string, unknown> }) =>
      id ? api.put(`/products/${id}`, payload) : api.post('/products', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      setEditing(null)
      setCreating(false)
    },
  })

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
    onError: (e) => alert(apiError(e)),
  })
  const remove = (id: string, name: string) => { if (confirm(`Delete "${name}"? Wapas nahi aayega.`)) del.mutate(id) }

  return (
    <div>
      <PageHeader
        title="Products / Rates"
        subtitle="Block categories — naam, rate, curing din set karo"
        actions={manage && <Button onClick={() => setCreating(true)}>+ Product</Button>}
      />
      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Name', 'SKU', 'Unit', 'Curing Days', 'Sale Rate', 'Status', '']}>
          {data?.data.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-3 font-medium">{p.name}</td>
              <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
              <td className="px-4 py-3">{p.unit}</td>
              <td className="px-4 py-3">{p.default_curing_days} din</td>
              <td className="px-4 py-3">{formatPaisa(p.sale_price)}</td>
              <td className="px-4 py-3">{p.is_active ? <Badge color="green">Active</Badge> : <Badge color="slate">Off</Badge>}</td>
              <td className="px-4 py-3 text-right space-x-3">
                {manage && <button className="text-sm hover:underline" style={{ color: 'var(--primary)' }} onClick={() => setEditing(p)}>Edit</button>}
                {manage && <button className="text-sm hover:underline" style={{ color: 'var(--red)' }} onClick={() => remove(p.id, p.name)}>Delete</button>}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {(creating || editing) && (
        <Modal title={editing ? 'Edit Product' : 'New Product'} onClose={() => { setCreating(false); setEditing(null) }}>
          <ProductForm
            product={editing}
            onSubmit={(payload) => save.mutate({ id: editing?.id, payload })}
            busy={save.isPending}
            error={save.error ? apiError(save.error) : ''}
          />
        </Modal>
      )}
    </div>
  )
}

function ProductForm({ product, onSubmit, busy, error }: { product: Product | null; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({
    name: product?.name ?? '',
    sku: product?.sku ?? '',
    size: product?.size ?? '',
    unit: product?.unit ?? 'piece',
    default_curing_days: String(product?.default_curing_days ?? 7),
    sale_price: product ? String(product.sale_price / 100) : '',
    low_stock_threshold: String(product?.low_stock_threshold ?? 0),
    is_active: product?.is_active ?? true,
  })
  const set = (k: string, v: string | boolean) => setForm({ ...form, [k]: v })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({
          name: form.name,
          sku: form.sku,
          size: form.size,
          unit: form.unit,
          default_curing_days: Number(form.default_curing_days),
          sale_price: Number(form.sale_price),
          low_stock_threshold: Number(form.low_stock_threshold),
          is_active: form.is_active,
        })
      }}
      className="space-y-3"
    >
      <Field label="Name (block ka naam)"><Input value={form.name} onChange={(e) => set('name', e.target.value)} required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="SKU (code)"><Input value={form.sku} onChange={(e) => set('sku', e.target.value)} required /></Field>
        <Field label="Size"><Input value={form.size} onChange={(e) => set('size', e.target.value)} placeholder="4 inch" /></Field>
        <Field label="Unit"><Input value={form.unit} onChange={(e) => set('unit', e.target.value)} /></Field>
        <Field label="Curing days"><Input type="number" value={form.default_curing_days} onChange={(e) => set('default_curing_days', e.target.value)} /></Field>
        <Field label="Sale rate (Rs)"><MoneyInput value={form.sale_price} onChange={(v) => set('sale_price', v)} required /></Field>
        <Field label="Low stock alert (pcs)"><Input type="number" value={form.low_stock_threshold} onChange={(e) => set('low_stock_threshold', e.target.value)} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
        <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
        Active (POS me dikhe)
      </label>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save'}</Button>
    </form>
  )
}
