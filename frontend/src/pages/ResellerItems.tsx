import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { SquarePen, Trash2 } from 'lucide-react'
import { Badge, Button, type Column, DataTable, Field, IconButton, Input, Modal, MoneyInput, PageHeader, RowActions, Select, useConfirm } from '../components/ui'

export interface ResellerItem {
  id: string
  name: string
  unit: string
  sale_price: number
  avg_cost: number
  stock_qty: number
  stock_value: number
  low_stock_threshold: number
  is_active: boolean
  created_at?: string
}

// Possible units for resale/rental items.
export const UNITS = ['bag', 'unit', 'mann', 'ent', 'kg', 'cft', 'piece', 'trip', 'gari', 'bori', 'litre', 'foot']

export default function ResellerItems() {
  const { can } = useAuth()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<ResellerItem | null>(null)
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('created_at')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const { data, isLoading } = useList<ResellerItem>('reseller/items', { page, search, sort, dir })
  const manage = can('reseller.manage')

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir(key === 'created_at' ? 'desc' : 'asc') }
    setPage(1)
  }

  const save = useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: Record<string, unknown> }) =>
      id ? api.put(`/reseller/items/${id}`, payload) : api.post('/reseller/items', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reseller/items'] })
      setEditing(null); setCreating(false)
    },
  })

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/reseller/items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reseller/items'] }),
    onError: (e) => alert(apiError(e)),
  })
  const remove = async (it: ResellerItem) => {
    if (await confirm({ title: 'Item delete karein?', message: `"${it.name}" delete ho jayega.`, confirmText: 'Delete' })) del.mutate(it.id)
  }

  const columns: Column<ResellerItem>[] = [
    { key: 'name', label: 'Item', sortable: true, render: (p) => <span className="font-medium">{p.name}</span> },
    { key: 'unit', label: 'Unit', sortable: true, render: (p) => <Badge color="blue">{p.unit}</Badge> },
    { key: 'sale_price', label: 'Rate', sortable: true, align: 'right', render: (p) => `${formatPaisa(p.sale_price)} / ${p.unit}` },
    { key: 'stock_qty', label: 'Stock', sortable: true, align: 'right', render: (p) => <span className="font-semibold" style={{ color: 'var(--green)' }}>{p.stock_qty}</span> },
    { key: 'avg_cost', label: 'Cost (avg)', align: 'right', render: (p) => formatPaisa(p.avg_cost) },
    { key: 'margin', label: 'Margin', align: 'right', render: (p) => { const m = p.sale_price - p.avg_cost; return <span style={{ color: m >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatPaisa(m)}</span> } },
    { key: 'stock_value', label: 'Value', align: 'right', render: (p) => formatPaisa(p.stock_value) },
    { key: 'status', label: 'Status', render: (p) => (p.is_active ? <Badge color="green">Active</Badge> : <Badge color="slate">Off</Badge>) },
    { key: 'created_at', label: 'Kab bana', sortable: true, render: (r) => (r.created_at ? String(r.created_at).slice(0, 10) : '·') },
    {
      key: 'actions', label: '', align: 'right', render: (p) => (
        manage ? (
          <RowActions>
            <IconButton icon={SquarePen} label="Edit" tone="primary" onClick={() => setEditing(p)} />
            <IconButton icon={Trash2} label="Delete" tone="red" onClick={() => remove(p)} />
          </RowActions>
        ) : null
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Reseller Items"
        subtitle="Cement, Crush, Raiti, Sarya, Enten… naam, unit aur rate"
        actions={manage && <Button onClick={() => setCreating(true)}>+ Item</Button>}
      />
      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading}
        emptyText="Koi item nahi."
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Item naam se search…"
        sort={sort}
        dir={dir}
        onSort={onSort}
        meta={data?.meta}
        page={page}
        onPage={setPage}
      />
      {(creating || editing) && (
        <Modal title={editing ? 'Edit Item' : 'New Item'} onClose={() => { setCreating(false); setEditing(null) }}>
          <ItemForm
            item={editing}
            onSubmit={(payload) => save.mutate({ id: editing?.id, payload })}
            busy={save.isPending}
            error={save.error ? apiError(save.error) : ''}
          />
        </Modal>
      )}
    </div>
  )
}

function ItemForm({ item, onSubmit, busy, error }: { item: ResellerItem | null; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({
    name: item?.name ?? '',
    unit: item?.unit ?? 'bag',
    sale_price: item ? String(item.sale_price / 100) : '',
    low_stock_threshold: String(item?.low_stock_threshold ?? 0),
    is_active: item?.is_active ?? true,
  })
  const set = (k: string, v: string | boolean) => setForm({ ...form, [k]: v })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({
          name: form.name,
          unit: form.unit,
          sale_price: Number(form.sale_price),
          low_stock_threshold: Number(form.low_stock_threshold),
          is_active: form.is_active,
        })
      }}
      className="space-y-3"
    >
      <Field label="Name (item ka naam)"><Input value={form.name} onChange={(e) => set('name', e.target.value)} required autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Unit">
          <Select value={form.unit} onChange={(e) => set('unit', e.target.value)} required>
            {UNITS.map((u) => <option key={u} value={u}>{u}{u === 'mann' ? ' (50kg)' : ''}</option>)}
          </Select>
        </Field>
        <Field label="Rate per unit (Rs)"><MoneyInput value={form.sale_price} onChange={(v) => set('sale_price', v)} required /></Field>
        <Field label="Low stock alert"><Input type="number" value={form.low_stock_threshold} onChange={(e) => set('low_stock_threshold', e.target.value)} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
        <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
        Active
      </label>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save'}</Button>
    </form>
  )
}
