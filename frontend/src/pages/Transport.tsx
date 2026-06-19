import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Wallet } from 'lucide-react'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Badge, Button, type Column, DataTable, Field, IconButton, Input, MethodField, Modal, MoneyInput, OutstandingNote, PageHeader, RowActions } from '../components/ui'

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
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('trip_date')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [payFor, setPayFor] = useState<Trip | null>(null)
  const { data, isLoading } = useList<Trip>('transport-trips', { page, search, sort, dir })

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }

  const pay = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.post(`/transport-trips/${id}/pay`, payload),
    onSuccess: () => {
      ['transport-trips', 'drivers', 'dashboard', 'payables'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      setPayFor(null)
    },
  })

  const columns: Column<Trip>[] = [
    { key: 'reference', label: 'Ref', sortable: true, render: (t) => <span className="font-mono text-xs">{t.reference}</span> },
    { key: 'trip_date', label: 'Date', sortable: true, render: (t) => t.trip_date },
    { key: 'vehicle', label: 'Vehicle', render: (t) => t.vehicle_label ?? '—' },
    { key: 'driver', label: 'Driver', render: (t) => t.driver?.name ?? '—' },
    { key: 'rate', label: 'Rate', sortable: true, align: 'right', render: (t) => formatPaisa(t.rate) },
    { key: 'paid', label: 'Paid', sortable: true, align: 'right', render: (t) => formatPaisa(t.paid) },
    { key: 'balance', label: 'Balance', sortable: true, align: 'right', render: (t) => formatPaisa(t.balance) },
    { key: 'status', label: 'Status', sortable: true, render: (t) => <Badge color={statusColor[t.status]}>{t.status}</Badge> },
    {
      key: 'actions', label: '', align: 'right', render: (t) => (
        can('payments.manage') && t.status !== 'paid' && t.driver
          ? <RowActions><IconButton icon={Wallet} label="Pay" tone="primary" onClick={() => setPayFor(t)} /></RowActions>
          : null
      ),
    },
  ]

  return (
    <div>
      <PageHeader title="Transport Trips" subtitle="Trips dispatch se khud-ba-khud bante hain · yahin se driver ko pay karein" />
      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading}
        emptyText="Koi trip nahi — dispatch pe kiraya daalo to yahan aayega."
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Ref, driver ya vehicle se search…"
        sort={sort}
        dir={dir}
        onSort={onSort}
        meta={data?.meta}
        page={page}
        onPage={setPage}
      />
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
