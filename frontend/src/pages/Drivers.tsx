import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Badge, Button, Field, Input, MethodField, Modal, MoneyInput, OutstandingNote, PageHeader, Pagination, Spinner, Table } from '../components/ui'

interface Driver {
  id: string
  name: string
  phone?: string
  license_no?: string
  vehicle_name?: string
  vehicle_plate?: string
  balance: number
}

export default function Drivers() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [payId, setPayId] = useState<string | null>(null)
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const { data, isLoading } = useList<Driver>('drivers', { search, page })

  const create = useMutation({
    mutationFn: (p: Record<string, string>) => api.post('/drivers', p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['drivers'] }); setCreating(false) },
  })
  const pay = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.post(`/drivers/${id}/pay`, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['drivers'] }); setPayId(null) },
  })

  return (
    <div>
      <PageHeader title="Drivers" subtitle="Driver ka baqi aur payment" actions={can('transport.manage') && <Button onClick={() => setCreating(true)}>+ Driver</Button>} />
      <div className="mb-4">
        <Input placeholder="Search name or phone…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="max-w-xs" />
      </div>
      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Name', 'Phone', 'Vehicle (gaari)', 'Dues (we owe)', '']}>
          {data?.data.map((d) => (
            <tr key={d.id}>
              <td className="px-4 py-3 font-medium">{d.name}</td>
              <td className="px-4 py-3">{d.phone ?? '—'}</td>
              <td className="px-4 py-3">{d.vehicle_name ? `${d.vehicle_name}${d.vehicle_plate ? ` (${d.vehicle_plate})` : ''}` : '—'}</td>
              <td className="px-4 py-3">{d.balance > 0 ? <Badge color="red">{formatPaisa(d.balance)}</Badge> : <Badge color="green">Settled</Badge>}</td>
              <td className="px-4 py-3 text-right space-x-3">
                <button className="text-sm text-blue-600 hover:underline" onClick={() => setLedgerId(d.id)}>Ledger</button>
                {can('payments.manage') && <button className="text-sm text-blue-600 hover:underline" onClick={() => setPayId(d.id)}>Pay</button>}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pagination meta={data?.meta} page={page} onPage={setPage} />
      {creating && (
        <Modal title="New Driver" onClose={() => setCreating(false)}>
          <DriverForm onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error ? apiError(create.error) : ''} />
        </Modal>
      )}
      {payId && (
        <Modal title="Pay Driver" onClose={() => setPayId(null)}>
          <PayForm
            outstanding={data?.data.find((d) => d.id === payId)?.balance ?? 0}
            onSubmit={(payload) => pay.mutate({ id: payId, payload })}
            busy={pay.isPending}
            error={pay.error ? apiError(pay.error) : ''}
          />
        </Modal>
      )}
      {ledgerId && <LedgerModal id={ledgerId} onClose={() => setLedgerId(null)} />}
    </div>
  )
}

function DriverForm({ onSubmit, busy, error }: { onSubmit: (p: Record<string, string>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ name: '', phone: '', license_no: '', vehicle_name: '', vehicle_plate: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form) }} className="space-y-3">
      <Field label="Name"><Input value={form.name} onChange={(e) => set('name', e.target.value)} required /></Field>
      <Field label="Phone"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
      <Field label="License No"><Input value={form.license_no} onChange={(e) => set('license_no', e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vehicle (gaari ka naam)"><Input value={form.vehicle_name} onChange={(e) => set('vehicle_name', e.target.value)} placeholder="Mazda" /></Field>
        <Field label="Plate no"><Input value={form.vehicle_plate} onChange={(e) => set('vehicle_plate', e.target.value)} placeholder="LEX-123" /></Field>
      </div>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save'}</Button>
    </form>
  )
}

function PayForm({ outstanding, onSubmit, busy, error }: { outstanding: number; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ payment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  const settled = outstanding <= 0
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, amount: Number(form.amount) }) }} className="space-y-3">
      <OutstandingNote label="Driver ko dene hain (baqi)" amount={outstanding} onFill={(rs) => set('amount', String(rs))} />
      {settled ? (
        <p className="text-sm" style={{ color: 'var(--green)' }}>Sab clear — koi payment baqi nahi.</p>
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

function LedgerModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['driver-ledger', id],
    queryFn: async () => (await api.get(`/drivers/${id}/ledger`)).data,
  })
  return (
    <Modal title="Driver Ledger" onClose={onClose}>
      {isLoading || !data ? <Spinner /> : (
        <div>
          <div className="mb-3 text-sm">{data.driver.name} — Dues: <strong>{formatPaisa(data.balance)}</strong></div>
          <Table head={['Date', 'Ref', 'Desc', 'Charge', 'Paid']}>
            {data.rows.map((r: Record<string, string | number>, i: number) => (
              <tr key={i}>
                <td className="px-4 py-2">{r.date}</td>
                <td className="px-4 py-2">{r.reference}</td>
                <td className="px-4 py-2">{r.description}</td>
                <td className="px-4 py-2">{r.credit ? formatPaisa(Number(r.credit)) : '—'}</td>
                <td className="px-4 py-2">{r.debit ? formatPaisa(Number(r.debit)) : '—'}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Modal>
  )
}
