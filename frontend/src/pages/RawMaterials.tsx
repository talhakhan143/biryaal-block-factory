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
}

export default function RawMaterials() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const { data, isLoading } = useList<RawMaterial>('raw-materials')

  const create = useMutation({
    mutationFn: (p: Record<string, string>) => api.post('/raw-materials', p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['raw-materials'] })
      setCreating(false)
    },
  })

  return (
    <div>
      <PageHeader
        title="Raw Materials"
        subtitle="Cement, Bajri, Rait, Pani waghera"
        actions={can('materials.manage') && <Button onClick={() => setCreating(true)}>+ Material</Button>}
      />
      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Material', 'Unit', 'On Hand', 'Status']}>
          {data?.data.map((m) => (
            <tr key={m.id}>
              <td className="px-4 py-3 font-medium">{m.name}</td>
              <td className="px-4 py-3">{m.unit}</td>
              <td className="px-4 py-3">{m.current_qty}</td>
              <td className="px-4 py-3">{m.is_low ? <Badge color="red">Low</Badge> : <Badge color="green">OK</Badge>}</td>
            </tr>
          ))}
        </Table>
      )}
      {creating && (
        <Modal title="New Raw Material" onClose={() => setCreating(false)}>
          <MaterialForm onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error ? apiError(create.error) : ''} />
        </Modal>
      )}
    </div>
  )
}

function MaterialForm({ onSubmit, busy, error }: { onSubmit: (p: Record<string, string>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ name: '', unit: 'bag', low_stock_threshold: '0' })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form) }} className="space-y-3">
      <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
      <Field label="Unit"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required /></Field>
      <Field label="Low stock threshold"><Input type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} /></Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save'}</Button>
    </form>
  )
}
