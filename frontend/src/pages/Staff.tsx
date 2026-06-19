import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Trash2, Wallet } from 'lucide-react'
import { Badge, Button, Field, IconButton, Input, MethodField, Modal, MoneyInput, OutstandingNote, PageHeader, RowActions, Select, Spinner, Table, useConfirm } from '../components/ui'

interface Staff {
  id: string
  name: string
  role?: string
  monthly_salary: number
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
  const [genSalary, setGenSalary] = useState(false)
  const [payId, setPayId] = useState<string | null>(null)
  const staff = useList<Staff>('staff', { per_page: 100 })
  const salaries = useList<Salary>('salaries')
  const refresh = () => { qc.invalidateQueries({ queryKey: ['staff'] }); qc.invalidateQueries({ queryKey: ['salaries'] }) }

  const createStaff = useMutation({ mutationFn: (p: Record<string, unknown>) => api.post('/staff', p), onSuccess: () => { refresh(); setAddStaff(false) } })
  const delStaff = useMutation({ mutationFn: (id: string) => api.delete(`/staff/${id}`), onSuccess: refresh, onError: (e) => alert(apiError(e)) })
  const generate = useMutation({ mutationFn: (p: Record<string, unknown>) => api.post('/salaries', p), onSuccess: () => { refresh(); setGenSalary(false) } })
  const pay = useMutation({ mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.post(`/salaries/${id}/pay`, payload), onSuccess: () => { refresh(); setPayId(null) } })

  return (
    <div className="space-y-8">
      <div>
        <PageHeader title="Staff" subtitle="Mahine wale mulazim aur unki tankha" actions={can('hr.manage') && <Button onClick={() => setAddStaff(true)}>+ Staff</Button>} />
        {staff.isLoading ? <Spinner /> : (
          <Table head={['Name', 'Role', 'Monthly Salary', '']}>
            {staff.data?.data.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3">{s.role ?? '—'}</td>
                <td className="px-4 py-3">{formatPaisa(s.monthly_salary)}</td>
                <td className="px-4 py-3">
                  {can('hr.manage') && (
                    <RowActions>
                      <IconButton icon={Trash2} label="Delete" tone="red" onClick={async () => {
                        if (await confirm({ title: 'Staff delete karein?', message: `"${s.name}" delete ho jayega.`, confirmText: 'Delete' })) delStaff.mutate(s.id)
                      }} />
                    </RowActions>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <div>
        <PageHeader title="Salaries" subtitle="Tankha banayein aur ada karein" actions={can('hr.manage') && <Button onClick={() => setGenSalary(true)}>Generate Salary</Button>} />
        {salaries.isLoading ? <Spinner /> : (
          <Table head={['Ref', 'Staff', 'Month', 'Amount', 'Paid', 'Balance', 'Status', '']}>
            {salaries.data?.data.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-mono text-xs">{s.reference}</td>
                <td className="px-4 py-3">{s.staff_name}</td>
                <td className="px-4 py-3">{s.month}</td>
                <td className="px-4 py-3">{formatPaisa(s.amount)}</td>
                <td className="px-4 py-3">{formatPaisa(s.paid)}</td>
                <td className="px-4 py-3">{formatPaisa(s.balance)}</td>
                <td className="px-4 py-3"><Badge color={statusColor[s.status]}>{s.status}</Badge></td>
                <td className="px-4 py-3">
                  {can('hr.manage') && s.status !== 'paid' && (
                    <RowActions>
                      <IconButton icon={Wallet} label="Pay salary" tone="primary" onClick={() => setPayId(s.id)} />
                    </RowActions>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      {addStaff && (
        <Modal title="New Staff" onClose={() => setAddStaff(false)}>
          <StaffForm onSubmit={(p) => createStaff.mutate(p)} busy={createStaff.isPending} error={createStaff.error ? apiError(createStaff.error) : ''} />
        </Modal>
      )}
      {genSalary && (
        <Modal title="Generate Salary" onClose={() => setGenSalary(false)}>
          <SalaryForm staff={staff.data?.data ?? []} onSubmit={(p) => generate.mutate(p)} busy={generate.isPending} error={generate.error ? apiError(generate.error) : ''} />
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
    </div>
  )
}

function StaffForm({ onSubmit, busy, error }: { onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ name: '', role: '', phone: '', monthly_salary: '' })
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
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save'}</Button>
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
        <p className="text-sm" style={{ color: 'var(--green)' }}>Sab clear — tankha poori ho chuki.</p>
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
