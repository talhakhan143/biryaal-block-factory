import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Badge, Button, Field, Input, MethodField, Modal, MoneyInput, OutstandingNote, PageHeader, Pagination, Select, Spinner, Table } from '../components/ui'

interface Labourer {
  id: string
  name: string
  phone?: string
  daily_wage: number
  balance: number
}

export default function Labour() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [marking, setMarking] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [payId, setPayId] = useState<string | null>(null)
  const { data, isLoading } = useList<Labourer>('labourers', { search, page })
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['labourers'] }) }

  const create = useMutation({ mutationFn: (p: Record<string, unknown>) => api.post('/labourers', p), onSuccess: () => { invalidate(); setCreating(false) } })
  const mark = useMutation({ mutationFn: (p: Record<string, unknown>) => api.post('/attendances', p), onSuccess: () => { invalidate(); setMarking(false) } })
  const pay = useMutation({ mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.post(`/labourers/${id}/pay`, payload), onSuccess: () => { invalidate(); setPayId(null) } })
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/labourers/${id}`), onSuccess: invalidate, onError: (e) => alert(apiError(e)) })

  return (
    <div>
      <PageHeader
        title="Labour"
        subtitle="Dihari mazdoor, haazri aur baqi mazdoori"
        actions={can('labour.manage') && (
          <>
            <Button variant="ghost" onClick={() => setMarking(true)}>Mark Attendance</Button>
            <Button onClick={() => setCreating(true)}>+ Labourer</Button>
          </>
        )}
      />
      <div className="mb-4">
        <Input placeholder="Search labourer name…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="max-w-xs" />
      </div>
      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Name', 'Phone', 'Daily Wage', 'Dues', '']}>
          {data?.data.map((l) => (
            <tr key={l.id}>
              <td className="px-4 py-3 font-medium">{l.name}</td>
              <td className="px-4 py-3">{l.phone ?? '—'}</td>
              <td className="px-4 py-3">{formatPaisa(l.daily_wage)}</td>
              <td className="px-4 py-3">{l.balance > 0 ? <Badge color="red">{formatPaisa(l.balance)}</Badge> : <Badge color="green">Settled</Badge>}</td>
              <td className="px-4 py-3 text-right space-x-3">
                {can('payments.manage') && <button className="text-sm text-blue-600 hover:underline" onClick={() => setPayId(l.id)}>Pay</button>}
                {can('labour.manage') && <button className="text-sm hover:underline" style={{ color: 'var(--red)' }} onClick={() => { if (confirm(`Delete ${l.name}?`)) del.mutate(l.id) }}>Delete</button>}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pagination meta={data?.meta} page={page} onPage={setPage} />
      {creating && (
        <Modal title="New Labourer" onClose={() => setCreating(false)}>
          <LabourerForm onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error ? apiError(create.error) : ''} />
        </Modal>
      )}
      {marking && (
        <Modal title="Mark Attendance" onClose={() => setMarking(false)}>
          <AttendanceForm labourers={data?.data ?? []} onSubmit={(p) => mark.mutate(p)} busy={mark.isPending} error={mark.error ? apiError(mark.error) : ''} />
        </Modal>
      )}
      {payId && (
        <Modal title="Pay Labourer" onClose={() => setPayId(null)}>
          <PayForm
            outstanding={data?.data.find((l) => l.id === payId)?.balance ?? 0}
            onSubmit={(payload) => pay.mutate({ id: payId, payload })}
            busy={pay.isPending}
            error={pay.error ? apiError(pay.error) : ''}
          />
        </Modal>
      )}
    </div>
  )
}

function LabourerForm({ onSubmit, busy, error }: { onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ name: '', phone: '', daily_wage: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, daily_wage: Number(form.daily_wage) }) }} className="space-y-3">
      <Field label="Name"><Input value={form.name} onChange={(e) => set('name', e.target.value)} required /></Field>
      <Field label="Phone"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
      <Field label="Daily wage (Rs)"><MoneyInput value={form.daily_wage} onChange={(v) => set('daily_wage', v)} required /></Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save'}</Button>
    </form>
  )
}

function AttendanceForm({ labourers, onSubmit, busy, error }: { labourers: Labourer[]; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ labourer_id: '', work_date: new Date().toISOString().slice(0, 10), status: 'present' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form) }} className="space-y-3">
      <Field label="Labourer">
        <Select value={form.labourer_id} onChange={(e) => set('labourer_id', e.target.value)} required>
          <option value="">Select…</option>
          {labourers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={form.work_date} onChange={(e) => set('work_date', e.target.value)} required /></Field>
        <Field label="Status">
          <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="present">Present</option>
            <option value="half">Half day</option>
            <option value="absent">Absent</option>
          </Select>
        </Field>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Mark'}</Button>
    </form>
  )
}

function PayForm({ outstanding, onSubmit, busy, error }: { outstanding: number; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ payment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  const settled = outstanding <= 0
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, amount: Number(form.amount) }) }} className="space-y-3">
      <OutstandingNote label="Mazdoor ko dene hain (baqi)" amount={outstanding} onFill={(rs) => set('amount', String(rs))} />
      {settled ? (
        <p className="text-sm" style={{ color: 'var(--green)' }}>Sab clear — koi mazdoori baqi nahi.</p>
      ) : (
        <>
          <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required /></Field>
          <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
          <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
        </>
      )}
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy || settled} className="w-full">{busy ? 'Saving…' : 'Pay'}</Button>
    </form>
  )
}
