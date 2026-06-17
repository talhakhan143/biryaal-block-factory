import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { Badge, Button, Field, Input, Modal, PageHeader, Spinner, Table } from '../components/ui'

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
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<RawMaterial | null>(null)
  const { data, isLoading } = useList<RawMaterial>('raw-materials')
  const manage = can('materials.manage')

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
  const remove = (id: string, name: string) => { if (confirm(`Delete "${name}"?`)) del.mutate(id) }

  return (
    <div>
      <PageHeader
        title="Raw Materials"
        subtitle="Cement, Bajri, Rait, Pani waghera"
        actions={manage && <Button onClick={() => setCreating(true)}>+ Material</Button>}
      />
      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Material', 'Unit', 'On Hand', 'Low Alert', 'Status', '']}>
          {data?.data.map((m) => (
            <tr key={m.id}>
              <td className="px-4 py-3 font-medium">{m.name}</td>
              <td className="px-4 py-3">{m.unit}</td>
              <td className="px-4 py-3">{m.current_qty}</td>
              <td className="px-4 py-3">{m.low_stock_threshold}</td>
              <td className="px-4 py-3">
                {!m.is_active ? <Badge color="slate">Off</Badge> : m.is_low ? <Badge color="red">Low</Badge> : <Badge color="green">OK</Badge>}
              </td>
              <td className="px-4 py-3 text-right space-x-3">
                {manage && <button className="text-sm hover:underline" style={{ color: 'var(--primary)' }} onClick={() => setEditing(m)}>Edit</button>}
                {manage && <button className="text-sm hover:underline" style={{ color: 'var(--red)' }} onClick={() => remove(m.id, m.name)}>Delete</button>}
              </td>
            </tr>
          ))}
        </Table>
      )}
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
