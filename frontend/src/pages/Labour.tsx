import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { BookText, Coins, Power, PowerOff, Trash2, Wallet } from 'lucide-react'
import { AdvanceForm, Badge, Button, type Column, DataTable, Field, IconButton, Input, MethodField, Modal, MoneyInput, OutstandingNote, PageHeader, RowActions, Select, Spinner, Table, useConfirm } from '../components/ui'

interface Labourer {
  id: string
  name: string
  phone?: string
  daily_wage: number
  balance: number
  is_active: boolean
}

export default function Labour() {
  const { can } = useAuth()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [marking, setMarking] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('name')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [payId, setPayId] = useState<string | null>(null)
  const [advanceId, setAdvanceId] = useState<string | null>(null)
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const { data, isLoading } = useList<Labourer>('labourers', { search, page, sort, dir })
  const invalidate = () => { ['labourers', 'payments', 'payables', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })) }

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('asc') }
    setPage(1)
  }

  const create = useMutation({ mutationFn: (p: Record<string, unknown>) => api.post('/labourers', p), onSuccess: () => { invalidate(); setCreating(false) } })
  const mark = useMutation({ mutationFn: (p: Record<string, unknown>) => api.post('/attendances', p), onSuccess: () => { invalidate(); setMarking(false) } })
  const pay = useMutation({ mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.post(`/labourers/${id}/pay`, payload), onSuccess: () => { invalidate(); setPayId(null) } })
  const advance = useMutation({ mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.post(`/labourers/${id}/advance`, payload), onSuccess: () => { invalidate(); setAdvanceId(null) } })
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/labourers/${id}`), onSuccess: invalidate, onError: (e) => alert(apiError(e)) })
  const toggle = useMutation({ mutationFn: (l: Labourer) => api.put(`/labourers/${l.id}`, { name: l.name, phone: l.phone ?? '', daily_wage: l.daily_wage / 100, is_active: !l.is_active }), onSuccess: invalidate, onError: (e) => alert(apiError(e)) })

  const columns: Column<Labourer>[] = [
    { key: 'name', label: 'Name', sortable: true, render: (l) => <span className="font-medium" style={{ opacity: l.is_active ? 1 : 0.55 }}>{l.name}</span> },
    { key: 'phone', label: 'Phone', sortable: true, render: (l) => l.phone ?? '—' },
    { key: 'daily_wage', label: 'Daily Wage', sortable: true, align: 'right', render: (l) => formatPaisa(l.daily_wage) },
    { key: 'balance', label: 'Dues / Advance', sortable: true, align: 'right', render: (l) => l.balance > 0 ? <Badge color="red">{formatPaisa(l.balance)}</Badge> : l.balance < 0 ? <Badge color="blue">Advance {formatPaisa(-l.balance)}</Badge> : <Badge color="green">Settled</Badge> },
    { key: 'is_active', label: 'Status', sortable: true, render: (l) => l.is_active ? <Badge color="green">Active</Badge> : <Badge color="amber">Off</Badge> },
    {
      key: 'actions', label: '', align: 'right', render: (l) => (
        <RowActions>
          <IconButton icon={BookText} label="Ledger" onClick={() => setLedgerId(l.id)} />
          {can('payments.manage') && <IconButton icon={Wallet} label="Pay mazdoor" tone="primary" onClick={() => setPayId(l.id)} />}
          {can('payments.manage') && <IconButton icon={Coins} label="Advance dein" tone="amber" onClick={() => setAdvanceId(l.id)} />}
          {can('labour.manage') && <IconButton icon={l.is_active ? PowerOff : Power} label={l.is_active ? 'Deactivate' : 'Activate'} tone="amber" onClick={() => toggle.mutate(l)} />}
          {can('labour.manage') && (
            <IconButton icon={Trash2} label="Delete" tone="red" onClick={async () => {
              if (await confirm({ title: 'Mazdoor delete karein?', message: `"${l.name}" delete ho jayega.`, confirmText: 'Delete' })) del.mutate(l.id)
            }} />
          )}
        </RowActions>
      ),
    },
  ]

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
      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading}
        emptyText="Koi mazdoor nahi."
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Mazdoor name ya phone se search…"
        sort={sort}
        dir={dir}
        onSort={onSort}
        meta={data?.meta}
        page={page}
        onPage={setPage}
      />
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
      {advanceId && (
        <Modal title="Advance — Mazdoor" onClose={() => setAdvanceId(null)}>
          <AdvanceForm
            who="Mazdoor"
            balance={data?.data.find((l) => l.id === advanceId)?.balance ?? 0}
            onSubmit={(payload) => advance.mutate({ id: advanceId, payload })}
            busy={advance.isPending}
            error={advance.error ? apiError(advance.error) : ''}
          />
        </Modal>
      )}
      {ledgerId && <LedgerModal id={ledgerId} onClose={() => setLedgerId(null)} />}
    </div>
  )
}

function LedgerModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['labourer-ledger', id],
    queryFn: async () => (await api.get(`/labourers/${id}/ledger`)).data,
  })
  const bal = data ? Number(data.balance) : 0
  return (
    <Modal title="Mazdoor Ledger" onClose={onClose}>
      {isLoading || !data ? <Spinner /> : (
        <div>
          <div className="mb-3 text-sm">
            {data.labourer.name} —{' '}
            {bal > 0
              ? <>Baqi dene hain: <strong style={{ color: 'var(--red)' }}>{formatPaisa(bal)}</strong></>
              : bal < 0
                ? <>Advance jama: <strong style={{ color: 'var(--primary)' }}>{formatPaisa(-bal)}</strong></>
                : <strong style={{ color: 'var(--green)' }}>Sab clear</strong>}
          </div>
          <Table head={['Date', 'Ref', 'Desc', 'Mazdoori', 'Diya']}>
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
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ labourer_id: '', work_date: today, status: 'present' })
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
        <Field label="Date"><Input type="date" max={today} value={form.work_date} onChange={(e) => set('work_date', e.target.value)} required /></Field>
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
  const over = Math.round(Number(form.amount) * 100) > outstanding
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (over) return; onSubmit({ ...form, amount: Number(form.amount) }) }} className="space-y-3">
      <OutstandingNote label="Mazdoor ko dene hain (baqi)" amount={outstanding} onFill={(rs) => set('amount', String(rs))} />
      {settled ? (
        <p className="text-sm" style={{ color: 'var(--green)' }}>Sab clear — koi mazdoori baqi nahi. Zyada dena ho to "Advance" use karein.</p>
      ) : (
        <>
          <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required /></Field>
          <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
          <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
          {over && <p className="text-sm" style={{ color: 'var(--red)' }}>Baqi se zyada — sirf {formatPaisa(outstanding)} de sakte hain. Zyada ke liye "Advance" use karein.</p>}
        </>
      )}
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy || settled || over} className="w-full">{busy ? 'Saving…' : 'Pay'}</Button>
    </form>
  )
}
