import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Spinner, Table } from '../components/ui'

interface Trip {
  id: string
  reference: string
  vehicle?: { name: string }
  driver?: { name: string }
  trip_date: string
  to_location?: string
  rate: number
  paid: number
  balance: number
  status: string
}

const statusColor: Record<string, string> = { paid: 'green', partial: 'amber', unpaid: 'red' }

export default function Transport() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const { data, isLoading } = useList<Trip>('transport-trips')

  const create = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/transport-trips', p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transport-trips'] }); qc.invalidateQueries({ queryKey: ['drivers'] }); setCreating(false) },
  })

  return (
    <div>
      <PageHeader title="Transport Trips" subtitle="Gaari ke trip aur driver ka hisaab" actions={can('transport.manage') && <Button onClick={() => setCreating(true)}>+ Trip</Button>} />
      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Ref', 'Date', 'Vehicle', 'Driver', 'To', 'Rate', 'Paid', 'Balance', 'Status']}>
          {data?.data.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-3 font-mono text-xs">{t.reference}</td>
              <td className="px-4 py-3">{t.trip_date}</td>
              <td className="px-4 py-3">{t.vehicle?.name ?? '—'}</td>
              <td className="px-4 py-3">{t.driver?.name ?? '—'}</td>
              <td className="px-4 py-3">{t.to_location ?? '—'}</td>
              <td className="px-4 py-3">{formatPaisa(t.rate)}</td>
              <td className="px-4 py-3">{formatPaisa(t.paid)}</td>
              <td className="px-4 py-3">{formatPaisa(t.balance)}</td>
              <td className="px-4 py-3"><Badge color={statusColor[t.status]}>{t.status}</Badge></td>
            </tr>
          ))}
        </Table>
      )}
      {creating && (
        <Modal title="New Trip" onClose={() => setCreating(false)}>
          <TripForm onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error ? apiError(create.error) : ''} />
        </Modal>
      )}
    </div>
  )
}

function TripForm({ onSubmit, busy, error }: { onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const vehicles = useList<{ id: string; name: string; default_trip_rate: number }>('vehicles', { per_page: 100 })
  const drivers = useList<{ id: string; name: string }>('drivers', { per_page: 100 })
  const [form, setForm] = useState({ vehicle_id: '', driver_id: '', trip_date: new Date().toISOString().slice(0, 10), to_location: '', rate: '', paid: '0' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, rate: Number(form.rate), paid: Number(form.paid) }) }} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vehicle">
          <Select value={form.vehicle_id} onChange={(e) => {
            const v = vehicles.data?.data.find((x) => x.id === e.target.value)
            setForm({ ...form, vehicle_id: e.target.value, rate: v && v.default_trip_rate ? String(v.default_trip_rate / 100) : form.rate })
          }}>
            <option value="">—</option>
            {vehicles.data?.data.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
        </Field>
        <Field label="Driver">
          <Select value={form.driver_id} onChange={(e) => set('driver_id', e.target.value)}>
            <option value="">—</option>
            {drivers.data?.data.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Date"><Input type="date" value={form.trip_date} onChange={(e) => set('trip_date', e.target.value)} required /></Field>
        <Field label="To"><Input value={form.to_location} onChange={(e) => set('to_location', e.target.value)} /></Field>
        <Field label="Rate (Rs)"><Input type="number" value={form.rate} onChange={(e) => set('rate', e.target.value)} required /></Field>
        <Field label="Paid now (Rs)"><Input type="number" value={form.paid} onChange={(e) => set('paid', e.target.value)} /></Field>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Record Trip'}</Button>
    </form>
  )
}
