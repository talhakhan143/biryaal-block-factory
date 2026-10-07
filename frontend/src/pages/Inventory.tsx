import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { Button, type Column, DataTable, Field, Input, Modal, PageHeader, Select, StatTile } from '../components/ui'

interface Product {
  id: string
  name: string
  stock?: { curing_qty: number; ready_qty: number; damaged_qty: number }
}

interface FinishedGoods {
  data: Product[]
  meta?: { current_page: number; last_page: number; total: number }
  /** Poori list ka jama, sirf is page ka nahi. */
  totals: { curing_qty: number; ready_qty: number; damaged_qty: number }
}

const qty = (n: number) => n.toLocaleString('en-PK')

export default function Inventory() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [adjusting, setAdjusting] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('name')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const { data, isLoading } = useQuery({
    queryKey: ['finished-goods', { search, page, sort, dir }],
    queryFn: async () => (await api.get<FinishedGoods>('/finished-goods', { params: { search, page, sort, dir } })).data,
  })

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('asc') }
    setPage(1)
  }

  const adjust = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/finished-goods/adjust', p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finished-goods'] })
      setAdjusting(false)
    },
  })

  const totalsHint = search ? 'jo maal mila, sab mila kar' : 'sab maal mila kar'

  // Damaged column hidden, data safe, re-enable anytime
  const columns: Column<Product>[] = [
    { key: 'name', label: 'Product', sortable: true, render: (p) => <span className="font-medium">{p.name}</span> },
    { key: 'curing', label: 'Curing', align: 'right', render: (p) => <span style={{ color: 'var(--amber)' }}>{qty(p.stock?.curing_qty ?? 0)}</span> },
    { key: 'ready', label: 'Ready', align: 'right', render: (p) => <span className="font-semibold" style={{ color: 'var(--green)' }}>{qty(p.stock?.ready_qty ?? 0)}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="Finished Goods"
        subtitle="Curing → Tayar"
        actions={can('inventory.manage') && <Button onClick={() => setAdjusting(true)}>Stock Adjustment</Button>}
      />
      {data && (
        // Jama poori list ka hai, page badalne par badalta nahi. Search lagi ho
        // to sirf milne wale maal ka hota hai, is liye hint bhi badal jati hai.
        <div className="mb-4 grid grid-cols-2 gap-4">
          <StatTile label="Curing me" value={qty(data.totals.curing_qty)} hint={totalsHint} tone="amber" />
          <StatTile label="Tayar" value={qty(data.totals.ready_qty)} hint={totalsHint} tone="green" />
        </div>
      )}
      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading}
        emptyText="Koi maal nahi."
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Maal ka naam ya size se dhoondein…"
        sort={sort}
        dir={dir}
        onSort={onSort}
        meta={data?.meta}
        page={page}
        onPage={setPage}
      />
      {adjusting && (
        <Modal title="Stock Adjustment" onClose={() => setAdjusting(false)}>
          <AdjustForm onSubmit={(p) => adjust.mutate(p)} busy={adjust.isPending} error={adjust.error ? apiError(adjust.error) : ''} />
        </Modal>
      )}
    </div>
  )
}

function AdjustForm({ onSubmit, busy, error }: { onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ product_id: '', bucket: 'ready', delta: '', note: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  // List page by page aati hai, is liye dropdown apni poori list khud mangwata hai.
  const products = useList<Product>('finished-goods', { per_page: 100 })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, delta: Number(form.delta) }) }} className="space-y-3">
      <Field label="Product">
        <Select value={form.product_id} onChange={(e) => set('product_id', e.target.value)} required>
          <option value="">Select…</option>
          {products.data?.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bucket">
          <Select value={form.bucket} onChange={(e) => set('bucket', e.target.value)}>
            <option value="curing">Curing</option>
            <option value="ready">Ready</option>
            {/* Damaged option hidden */}
          </Select>
        </Field>
        <Field label="Delta (+/-)"><Input type="number" value={form.delta} onChange={(e) => set('delta', e.target.value)} required /></Field>
      </div>
      <Field label="Note"><Input value={form.note} onChange={(e) => set('note', e.target.value)} /></Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Apply'}</Button>
    </form>
  )
}
