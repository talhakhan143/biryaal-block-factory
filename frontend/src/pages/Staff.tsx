import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Printer, SquarePen, Trash2, Wallet } from 'lucide-react'
import { Badge, Button, type Column, DataTable, Field, IconButton, Input, MethodField, Modal, MoneyInput, OutstandingNote, PageHeader, RowActions, Select, useConfirm } from '../components/ui'
import { PaymentReceipt, SalarySlip, type PaymentDoc } from '../components/receipts'

interface Staff {
  id: string
  name: string
  role?: string
  monthly_salary: number
  created_at?: string
  phone?: string
}
interface Salary {
  id: string
  reference: string
  staff_name?: string
  month: string
  amount: number
  paid: number
  balance: number
  status: string
}

const statusColor: Record<string, string> = { paid: 'green', partial: 'amber', unpaid: 'red' }

export default function StaffPage() {
  const { can } = useAuth()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [addStaff, setAddStaff] = useState(false)
  const [editing, setEditing] = useState<Staff | null>(null)
  const [genSalary, setGenSalary] = useState(false)
  const [payId, setPayId] = useState<string | null>(null)
  // Tankha dene par parchi khud khul jati hai; list se bhi dobara nikal sakte hain.
  const [receipt, setReceipt] = useState<PaymentDoc | null>(null)
  const [slip, setSlip] = useState<Salary | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('created_at')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const staff = useList<Staff>('staff', { page, search, sort, dir })
  const allStaff = useList<Staff>('staff', { per_page: 200 }) // full list for the salary dropdown
  const [salPage, setSalPage] = useState(1)
  const [salSearch, setSalSearch] = useState('')
  const salaries = useList<Salary>('salaries', { page: salPage, search: salSearch })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['staff'] }); qc.invalidateQueries({ queryKey: ['salaries'] }) }

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir(key === 'created_at' ? 'desc' : 'asc') }
    setPage(1)
  }

  const staffColumns: Column<Staff>[] = [
    { key: 'name', label: 'Name', sortable: true, render: (s) => <span className="font-medium">{s.name}</span> },
    { key: 'role', label: 'Role', render: (s) => s.role ?? '·' },
    { key: 'monthly_salary', label: 'Monthly Salary', sortable: true, align: 'right', render: (s) => formatPaisa(s.monthly_salary) },
    { key: 'created_at', label: 'Kab bana', sortable: true, render: (r) => (r.created_at ? String(r.created_at).slice(0, 10) : '·') },
    {
      key: 'actions', label: '', align: 'right', render: (s) => (
        can('hr.manage') || can('hr.delete') ? (
          <RowActions>
            {can('hr.manage') && <IconButton icon={SquarePen} label="Theek karein" tone="primary" onClick={() => setEditing(s)} />}
            {can('hr.delete') && <IconButton icon={Trash2} label="Delete" tone="red" onClick={async () => {
              if (await confirm({ title: 'Staff delete karein?', message: `"${s.name}" delete ho jayega.`, confirmText: 'Delete' })) delStaff.mutate(s.id)
            }} />}
          </RowActions>
        ) : null
      ),
    },
  ]

  const saveStaff = useMutation({
    mutationFn: (p: Record<string, unknown>) => (editing ? api.put(`/staff/${editing.id}`, p) : api.post('/staff', p)),
    onSuccess: () => { refresh(); setAddStaff(false); setEditing(null) },
  })
  const delStaff = useMutation({ mutationFn: (id: string) => api.delete(`/staff/${id}`), onSuccess: refresh, onError: (e) => alert(apiError(e)) })
  const generate = useMutation({ mutationFn: (p: Record<string, unknown>) => api.post('/salaries', p), onSuccess: () => { refresh(); setGenSalary(false) } })
  const pay = useMutation({ mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.post(`/salaries/${id}/pay`, payload), onSuccess: (res) => { refresh(); setPayId(null); setReceipt(res.data.data) } })

  const salaryColumns: Column<Salary>[] = [
    { key: 'reference', label: 'Ref', render: (s) => <span className="font-mono text-xs">{s.reference}</span> },
    { key: 'staff_name', label: 'Staff', render: (s) => s.staff_name },
    { key: 'month', label: 'Mahina', render: (s) => s.month },
    { key: 'amount', label: 'Tankha', align: 'right', render: (s) => formatPaisa(s.amount) },
    { key: 'paid', label: 'Diya', align: 'right', render: (s) => formatPaisa(s.paid) },
    { key: 'balance', label: 'Baqi', align: 'right', render: (s) => formatPaisa(s.balance) },
    { key: 'status', label: 'Haal', render: (s) => <Badge color={statusColor[s.status]}>{s.status}</Badge> },
    {
      key: 'actions', label: '', align: 'right',
      render: (s) => (
        <RowActions>
          <IconButton icon={Printer} label="Parchi dekhein / print karein" tone="primary" onClick={() => setSlip(s)} />
          {can('hr.manage') && s.status !== 'paid' && <IconButton icon={Wallet} label="Tankha dein" tone="primary" onClick={() => setPayId(s.id)} />}
        </RowActions>
      ),
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <PageHeader title="Staff" subtitle="Mahine wale mulazim aur unki tankha" actions={can('hr.manage') && <Button onClick={() => setAddStaff(true)}>+ Staff</Button>} />
        <DataTable
          columns={staffColumns}
          rows={staff.data?.data}
          loading={staff.isLoading}
          emptyText="Koi staff nahi."
          search={search}
          onSearch={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder="Naam ya phone se search…"
          sort={sort}
          dir={dir}
          onSort={onSort}
          meta={staff.data?.meta}
          page={page}
          onPage={setPage}
        />
      </div>

      <div>
        <PageHeader title="Salaries" subtitle="Tankha banayein aur ada karein" actions={can('hr.manage') && <Button onClick={() => setGenSalary(true)}>Generate Salary</Button>} />
        <DataTable
          columns={salaryColumns}
          rows={salaries.data?.data}
          loading={salaries.isLoading}
          emptyText="Abhi koi tankha nahi bani."
          search={salSearch}
          onSearch={(v) => { setSalSearch(v); setSalPage(1) }}
          searchPlaceholder="Ref, staff ya mahine se dhoondein…"
          meta={salaries.data?.meta}
          page={salPage}
          onPage={setSalPage}
        />
      </div>

      {(addStaff || editing) && (
        <Modal title={editing ? `Theek karein: ${editing.name}` : 'Naya Staff'} onClose={() => { setAddStaff(false); setEditing(null) }}>
          <StaffForm
            staff={editing}
            onSubmit={(p) => saveStaff.mutate(p)}
            busy={saveStaff.isPending}
            error={saveStaff.error ? apiError(saveStaff.error) : ''}
            submitLabel={editing ? 'Save karein' : 'Add karein'}
          />
        </Modal>
      )}
      {genSalary && (
        <Modal title="Generate Salary" onClose={() => setGenSalary(false)}>
          <SalaryForm staff={allStaff.data?.data ?? []} onSubmit={(p) => generate.mutate(p)} busy={generate.isPending} error={generate.error ? apiError(generate.error) : ''} />
        </Modal>
      )}
      {payId && (
        <Modal title="Pay Salary" onClose={() => setPayId(null)}>
          <PayForm
            outstanding={salaries.data?.data.find((s) => s.id === payId)?.balance ?? 0}
            onSubmit={(payload) => pay.mutate({ id: payId, payload })}
            busy={pay.isPending}
            error={pay.error ? apiError(pay.error) : ''}
          />
        </Modal>
      )}
      {slip && <SalarySlip salary={slip} onClose={() => setSlip(null)} />}
      {receipt && <PaymentReceipt payment={receipt} onClose={() => setReceipt(null)} />}
    </div>
  )
}

function StaffForm({ staff, onSubmit, busy, error, submitLabel = 'Save' }: { staff?: Staff | null; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string; submitLabel?: string }) {
  const [form, setForm] = useState({
    name: staff?.name ?? '',
    role: staff?.role ?? '',
    phone: staff?.phone ?? '',
    monthly_salary: staff ? String(staff.monthly_salary / 100) : '',
  })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, monthly_salary: Number(form.monthly_salary) }) }} className="space-y-3">
      <Field label="Name"><Input value={form.name} onChange={(e) => set('name', e.target.value)} required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role"><Input value={form.role} onChange={(e) => set('role', e.target.value)} placeholder="Supervisor" /></Field>
        <Field label="Phone"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
      </div>
      <Field label="Monthly salary (Rs)"><MoneyInput value={form.monthly_salary} onChange={(v) => set('monthly_salary', v)} required /></Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : submitLabel}</Button>
    </form>
  )
}

function SalaryForm({ staff, onSubmit, busy, error }: { staff: Staff[]; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ staff_id: '', month: new Date().toISOString().slice(0, 7), amount: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const payload: Record<string, unknown> = { staff_id: form.staff_id, month: form.month }
        if (form.amount !== '') payload.amount = Number(form.amount)
        onSubmit(payload)
      }}
      className="space-y-3"
    >
      <Field label="Staff">
        <Select value={form.staff_id} onChange={(e) => set('staff_id', e.target.value)} required>
          <option value="">Select…</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Month (YYYY-MM)"><Input value={form.month} onChange={(e) => set('month', e.target.value)} placeholder="2026-06" required /></Field>
        <Field label="Amount (blank = default)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} /></Field>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Generate'}</Button>
    </form>
  )
}

function PayForm({ outstanding, onSubmit, busy, error }: { outstanding: number; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ payment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  const settled = outstanding <= 0
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, amount: Number(form.amount) }) }} className="space-y-3">
      <OutstandingNote label="Baqi tankha (remaining salary)" amount={outstanding} onFill={(rs) => set('amount', String(rs))} />
      {settled ? (
        <p className="text-sm" style={{ color: 'var(--green)' }}>Sab clear, tankha poori ho chuki.</p>
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
