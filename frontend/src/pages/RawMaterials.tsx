import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { SquarePen, Trash2 } from 'lucide-react'
import { Badge, Button, type Column, DataTable, Field, IconButton, Input, Modal, PageHeader, RowActions, useConfirm } from '../components/ui'

interface RawMaterial {
  id: string
  name: string
  unit: string
  current_qty: number
  low_stock_threshold: number
  is_low: boolean
  is_active: boolean
}

export default function RawMaterials() {
  const { can } = useAuth()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<RawMaterial | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('name')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const { data, isLoading } = useList<RawMaterial>('raw-materials', { page, search, sort, dir })
  const manage = can('materials.manage')

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('asc') }
    setPage(1)
  }

  const save = useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: Record<string, unknown> }) =>
      id ? api.put(`/raw-materials/${id}`, payload) : api.post('/raw-materials', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['raw-materials'] })
      setCreating(false)
      setEditing(null)
    },
  })

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/raw-materials/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['raw-materials'] }),
    onError: (e) => alert(apiError(e)),
  })
  const remove = async (id: string, name: string) => { if (await confirm({ title: 'Delete karein?', message: `"${name}" delete ho jayega. Wapas nahi aayega.`, confirmText: 'Delete' })) del.mutate(id) }

  const columns: Column<RawMaterial>[] = [
    { key: 'name', label: 'Material', sortable: true, render: (m) => <span className="font-medium">{m.name}</span> },
    { key: 'unit', label: 'Unit', sortable: true, render: (m) => m.unit },
    { key: 'current_qty', label: 'On Hand', sortable: true, align: 'right', render: (m) => m.current_qty },
    { key: 'low_stock_threshold', label: 'Low Alert', align: 'right', render: (m) => m.low_stock_threshold },
    { key: 'status', label: 'Status', render: (m) => (!m.is_active ? <Badge color="slate">Off</Badge> : m.is_low ? <Badge color="red">Low</Badge> : <Badge color="green">OK</Badge>) },
    {
      key: 'actions', label: '', align: 'right', render: (m) => (
        manage ? (
          <RowActions>
            <IconButton icon={SquarePen} label="Edit" tone="primary" onClick={() => setEditing(m)} />
            <IconButton icon={Trash2} label="Delete" tone="red" onClick={() => remove(m.id, m.name)} />
          </RowActions>
        ) : null
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Raw Materials"
        subtitle="Cement, Bajri, Rait, Pani waghera"
        actions={manage && <Button onClick={() => setCreating(true)}>+ Material</Button>}
      />
      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading}
        emptyText="Koi material nahi."
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Material naam se search…"
        sort={sort}
        dir={dir}
        onSort={onSort}
        meta={data?.meta}
        page={page}
        onPage={setPage}
      />
      {(creating || editing) && (
        <Modal title={editing ? 'Edit Material' : 'New Raw Material'} onClose={() => { setCreating(false); setEditing(null) }}>
          <MaterialForm
            material={editing}
            onSubmit={(payload) => save.mutate({ id: editing?.id, payload })}
            busy={save.isPending}
            error={save.error ? apiError(save.error) : ''}
          />
        </Modal>
      )}
    </div>
  )
}

function MaterialForm({ material, onSubmit, busy, error }: { material: RawMaterial | null; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({
    name: material?.name ?? '',
    unit: material?.unit ?? 'bag',
    low_stock_threshold: String(material?.low_stock_threshold ?? 0),
    is_active: material?.is_active ?? true,
  })
  const set = (k: string, v: string | boolean) => setForm({ ...form, [k]: v })
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, low_stock_threshold: Number(form.low_stock_threshold) }) }}
      className="space-y-3"
    >
      <Field label="Name (material ka naam)"><Input value={form.name} onChange={(e) => set('name', e.target.value)} required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Unit (bag / cft / litre)"><Input value={form.unit} onChange={(e) => set('unit', e.target.value)} required /></Field>
        <Field label="Low stock alert"><Input type="number" value={form.low_stock_threshold} onChange={(e) => set('low_stock_threshold', e.target.value)} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
        <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
        Active
      </label>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>Stock (on-hand) purchase se barhta hai — yahan manually nahi.</p>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save'}</Button>
    </form>
  )
}
