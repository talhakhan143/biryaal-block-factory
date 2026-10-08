import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Button, type Column, DataTable, Field, Input, Modal, MoneyInput, PageHeader } from '../components/ui'

interface Vehicle {
  id: string
  name: string
  plate?: string
  type?: string
  default_trip_rate: number
  created_at?: string
}

export default function Vehicles() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('created_at')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const { data, isLoading } = useList<Vehicle>('vehicles', { search, page, sort, dir })

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir(key === 'created_at' ? 'desc' : 'asc') }
    setPage(1)
  }

  const create = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/vehicles', p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] })
      setCreating(false)
    },
  })

  const columns: Column<Vehicle>[] = [
    { key: 'name', label: 'Name', sortable: true, render: (v) => <span className="font-medium">{v.name}</span> },
    { key: 'plate', label: 'Plate', sortable: true, render: (v) => v.plate ?? '·' },
    { key: 'type', label: 'Type', sortable: true, render: (v) => v.type ?? '·' },
    { key: 'default_trip_rate', label: 'Default Rate', sortable: true, align: 'right', render: (v) => formatPaisa(v.default_trip_rate) },
    { key: 'created_at', label: 'Kab bana', sortable: true, render: (r) => (r.created_at ? String(r.created_at).slice(0, 10) : '·') },
  ]

  return (
    <div>
      <PageHeader title="Vehicles" subtitle="Gaariyan aur trip rate" actions={can('transport.manage') && <Button onClick={() => setCreating(true)}>+ Vehicle</Button>} />
      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading}
        emptyText="Koi gaari nahi."
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Naam, plate ya type se dhoondein…"
        sort={sort}
        dir={dir}
        onSort={onSort}
        meta={data?.meta}
        page={page}
        onPage={setPage}
      />
      {creating && (
        <Modal title="New Vehicle" onClose={() => setCreating(false)}>
          <VehicleForm onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error ? apiError(create.error) : ''} />
        </Modal>
      )}
    </div>
  )
}

function VehicleForm({ onSubmit, busy, error }: { onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ name: '', plate: '', type: '', default_trip_rate: '0' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, default_trip_rate: Number(form.default_trip_rate) }) }} className="space-y-3">
      <Field label="Name"><Input value={form.name} onChange={(e) => set('name', e.target.value)} required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Plate"><Input value={form.plate} onChange={(e) => set('plate', e.target.value)} /></Field>
        <Field label="Type"><Input value={form.type} onChange={(e) => set('type', e.target.value)} placeholder="truck / mazda" /></Field>
      </div>
      <Field label="Default trip rate (Rs)"><MoneyInput value={form.default_trip_rate} onChange={(v) => set('default_trip_rate', v)} /></Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save'}</Button>
    </form>
  )
}
