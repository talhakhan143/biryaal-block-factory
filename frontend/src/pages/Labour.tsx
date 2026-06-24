import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { BookText, CalendarDays, Coins, Power, PowerOff, Trash2, Wallet } from 'lucide-react'
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
  const [calId, setCalId] = useState<string | null>(null)
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
          {can('labour.manage') && <IconButton icon={CalendarDays} label="Haazri (calendar)" tone="green" onClick={() => setCalId(l.id)} />}
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
      {calId && data?.data.find((l) => l.id === calId) && (
        <AttendanceCalendar
          labourer={data.data.find((l) => l.id === calId)!}
          onClose={() => setCalId(null)}
        />
      )}
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

/**
 * Per-labourer monthly attendance calendar. Year + month dropdowns (no future
 * year/month). Tap empty past/today cells to select, then bulk-mark a status.
 * Already-marked days are locked (fix mistakes via Adjustments). Each cell shows
 * the date number and weekday.
 */
function AttendanceCalendar({ labourer, onClose }: { labourer: Labourer; onClose: () => void }) {
  const qc = useQueryClient()
  const now = new Date()
  const curY = now.getFullYear()
  const curM = now.getMonth() + 1
  const today = now.toISOString().slice(0, 10)
  const [year, setYear] = useState(curY)
  const [month, setMonth] = useState(curM)
  const [status, setStatus] = useState('present')
  const [sel, setSel] = useState<Set<string>>(new Set())

  const pad = (n: number) => String(n).padStart(2, '0')
  const daysInMonth = new Date(year, month, 0).getDate()
  const from = `${year}-${pad(month)}-01`
  const to = `${year}-${pad(month)}-${pad(daysInMonth)}`

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-cal', labourer.id, year, month],
    queryFn: async () => (await api.get('/attendances', { params: { labourer_id: labourer.id, from, to, per_page: 40 } })).data.data as { work_date: string; status: string }[],
  })
  const marked = new Map<string, string>()
  ;(data ?? []).forEach((a) => marked.set(a.work_date, a.status))

  const mark = useMutation({
    mutationFn: () => api.post('/attendances/bulk', { labourer_id: labourer.id, status, dates: Array.from(sel) }),
    onSuccess: () => {
      setSel(new Set())
      ;['attendance-cal', 'labourers', 'dashboard', 'payables'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
    },
  })

  const years = [curY - 2, curY - 1, curY]
  const monthsAll = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const maxMonth = year === curY ? curM : 12
  const changeYear = (y: number) => { setYear(y); setSel(new Set()); if (y === curY && month > curM) setMonth(curM) }
  const changeMonth = (m: number) => { setMonth(m); setSel(new Set()) }

  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const firstDow = new Date(year, month - 1, 1).getDay()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const toggle = (dateStr: string) => {
    const next = new Set(sel)
    if (next.has(dateStr)) next.delete(dateStr)
    else next.add(dateStr)
    setSel(next)
  }

  const statusInfo: Record<string, { c: string; t: string }> = {
    present: { c: 'var(--green)', t: 'P' },
    half: { c: 'var(--amber)', t: 'H' },
    absent: { c: 'var(--red)', t: 'A' },
  }

  return (
    <Modal title={`Haazri — ${labourer?.name ?? ''}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Saal (year)"><Select value={String(year)} onChange={(e) => changeYear(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</Select></Field>
          <Field label="Mahina (month)"><Select value={String(month)} onChange={(e) => changeMonth(Number(e.target.value))}>{monthsAll.map((m, i) => (i + 1) <= maxMonth ? <option key={m} value={i + 1}>{m}</option> : null)}</Select></Field>
          <Field label="Status (kya lagana)"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="present">Present (poora din)</option><option value="half">Half day</option><option value="absent">Absent (ghair-haazir)</option></Select></Field>
        </div>

        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Khaali din pe click karke select karein (ek ya kayi), phir niche "Mark" dabayein. Jis din pehle se haazri lag chuki wo <b>locked</b> hai — galti theek karni ho to Adjustments se.
        </p>

        {isLoading ? <Spinner /> : (
          <div>
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-bold" style={{ color: 'var(--muted)' }}>
              {dows.map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDow }).map((_, i) => <div key={`b${i}`} />)}
              {days.map((day) => {
                const dateStr = `${year}-${pad(month)}-${pad(day)}`
                const isFuture = dateStr > today
                const st = marked.get(dateStr)
                const isSel = sel.has(dateStr)
                const dow = dows[new Date(year, month - 1, day).getDay()]
                if (st) {
                  const info = statusInfo[st] ?? statusInfo.present
                  return (
                    <div key={day} className="rounded-lg border px-1 py-1.5 text-center" style={{ borderColor: info.c, background: `color-mix(in srgb, ${info.c} 14%, transparent)`, cursor: 'not-allowed' }} title={`${dateStr} — ${st} (locked)`}>
                      <div className="text-sm font-bold" style={{ color: info.c }}>{day}</div>
                      <div className="text-[9px]" style={{ color: 'var(--muted)' }}>{dow}</div>
                      <div className="text-[10px] font-bold" style={{ color: info.c }}>{info.t}</div>
                    </div>
                  )
                }
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={isFuture}
                    onClick={() => toggle(dateStr)}
                    className="rounded-lg border px-1 py-1.5 text-center transition"
                    style={{
                      borderColor: isSel ? 'var(--primary)' : 'var(--border)',
                      background: isSel ? 'var(--primary)' : 'var(--surface-2)',
                      color: isSel ? 'var(--primary-fg)' : 'var(--text)',
                      opacity: isFuture ? 0.35 : 1,
                      cursor: isFuture ? 'not-allowed' : 'pointer',
                    }}
                    title={isFuture ? `${dateStr} — future (locked)` : dateStr}
                  >
                    <div className="text-sm font-bold">{day}</div>
                    <div className="text-[9px]" style={{ color: isSel ? 'var(--primary-fg)' : 'var(--muted)' }}>{dow}</div>
                    <div className="text-[10px]">{isSel ? '✓' : '·'}</div>
                  </button>
                )
              })}
            </div>

            <div className="mt-3 flex flex-wrap gap-3 text-[11px]" style={{ color: 'var(--muted)' }}>
              <span style={{ color: 'var(--green)' }}>■ Present</span>
              <span style={{ color: 'var(--amber)' }}>■ Half</span>
              <span style={{ color: 'var(--red)' }}>■ Absent</span>
              <span>Locked = pehle se lagi · faded = future</span>
            </div>
          </div>
        )}

        {mark.error && <p className="text-sm" style={{ color: 'var(--red)' }}>{apiError(mark.error)}</p>}
        <Button type="button" disabled={sel.size === 0 || mark.isPending} className="w-full" onClick={() => mark.mutate()}>
          {mark.isPending ? 'Saving…' : `Mark ${sel.size || ''} din — ${status === 'present' ? 'Present' : status === 'half' ? 'Half' : 'Absent'}`}
        </Button>
      </div>
    </Modal>
  )
}
