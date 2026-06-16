import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Button, Field, Input, Modal, MoneyInput, PageHeader, Spinner, Table } from '../components/ui'

interface Vehicle {
  id: string
  name: string
  plate?: string
  type?: string
  default_trip_rate: number
}

export default function Vehicles() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const { data, isLoading } = useList<Vehicle>('vehicles')

  const create = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/vehicles', p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] })
      setCreating(false)
    },
  })

  return (
    <div>
      <PageHeader title="Vehicles" subtitle="Gaariyan aur trip rate" actions={can('transport.manage') && <Button onClick={() => setCreating(true)}>+ Vehicle</Button>} />
      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Name', 'Plate', 'Type', 'Default Rate']}>
          {data?.data.map((v) => (
            <tr key={v.id}>
              <td className="px-4 py-3 font-medium">{v.name}</td>
              <td className="px-4 py-3">{v.plate ?? '—'}</td>
              <td className="px-4 py-3">{v.type ?? '—'}</td>
              <td className="px-4 py-3">{formatPaisa(v.default_trip_rate)}</td>
            </tr>
          ))}
        </Table>
      )}
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
