import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Badge, Button, Field, Input, MethodField, Modal, MoneyInput, OutstandingNote, PageHeader, Pagination, Spinner, Table } from '../components/ui'

interface Trip {
  id: string
  reference: string
  vehicle_label?: string
  driver?: { name: string }
  trip_date: string
  rate: number
  paid: number
  balance: number
  status: string
}

const statusColor: Record<string, string> = { paid: 'green', partial: 'amber', unpaid: 'red' }

export default function Transport() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [payFor, setPayFor] = useState<Trip | null>(null)
  const { data, isLoading } = useList<Trip>('transport-trips', { page })

  const pay = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.post(`/transport-trips/${id}/pay`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transport-trips'] })
      qc.invalidateQueries({ queryKey: ['drivers'] })
      setPayFor(null)
    },
  })

  return (
    <div>
      <PageHeader title="Transport Trips" subtitle="Trips dispatch se khud-ba-khud bante hain · yahin se driver ko pay karein" />
      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Ref', 'Date', 'Vehicle', 'Driver', 'Rate', 'Paid', 'Balance', 'Status', '']}>
          {data?.data.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-3 font-mono text-xs">{t.reference}</td>
              <td className="px-4 py-3">{t.trip_date}</td>
              <td className="px-4 py-3">{t.vehicle_label ?? '—'}</td>
              <td className="px-4 py-3">{t.driver?.name ?? '—'}</td>
              <td className="px-4 py-3">{formatPaisa(t.rate)}</td>
              <td className="px-4 py-3">{formatPaisa(t.paid)}</td>
              <td className="px-4 py-3">{formatPaisa(t.balance)}</td>
              <td className="px-4 py-3"><Badge color={statusColor[t.status]}>{t.status}</Badge></td>
              <td className="px-4 py-3 text-right">
                {can('payments.manage') && t.status !== 'paid' && t.driver && (
                  <button className="text-sm hover:underline" style={{ color: 'var(--primary)' }} onClick={() => setPayFor(t)}>Pay</button>
                )}
              </td>
            </tr>
          ))}
          {data?.data.length === 0 && (
            <tr><td colSpan={9} className="px-4 py-6 text-center" style={{ color: 'var(--muted)' }}>Koi trip nahi — dispatch pe kiraya daalo to yahan aayega.</td></tr>
          )}
        </Table>
      )}
      <Pagination meta={data?.meta} page={page} onPage={setPage} />
      {payFor && (
        <Modal title={`Pay Driver — ${payFor.reference}`} onClose={() => setPayFor(null)}>
          <PayForm
            outstanding={payFor.balance}
            onSubmit={(payload) => pay.mutate({ id: payFor.id, payload })}
            busy={pay.isPending}
            error={pay.error ? apiError(pay.error) : ''}
          />
        </Modal>
      )}
    </div>
  )
}

function PayForm({ outstanding, onSubmit, busy, error }: { outstanding: number; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ payment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, amount: Number(form.amount) }) }} className="space-y-3">
      <OutstandingNote label="Is trip ka baqi (driver ko dena)" amount={outstanding} onFill={(rs) => set('amount', String(rs))} />
      <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required /></Field>
      <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Pay'}</Button>
    </form>
  )
}
