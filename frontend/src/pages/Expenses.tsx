import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Badge, Button, Field, Input, MethodField, Modal, PageHeader, Select, Spinner, Table } from '../components/ui'

interface Expense {
  id: string
  reference: string
  expense_date: string
  category: string
  title: string
  amount: number
  method: string
}

const CATEGORIES = ['electricity', 'diesel', 'maintenance', 'internet', 'other']

export default function Expenses() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const { data, isLoading } = useList<Expense>('expenses')

  const create = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/expenses', p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      setCreating(false)
    },
  })

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Kharchay — bijli, diesel waghera"
        actions={can('expenses.manage') && <Button onClick={() => setCreating(true)}>+ Expense</Button>}
      />
      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Ref', 'Date', 'Category', 'Title', 'Amount', 'Method']}>
          {data?.data.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-3 font-mono text-xs">{e.reference}</td>
              <td className="px-4 py-3">{e.expense_date}</td>
              <td className="px-4 py-3"><Badge color="blue">{e.category}</Badge></td>
              <td className="px-4 py-3">{e.title}</td>
              <td className="px-4 py-3">{formatPaisa(e.amount)}</td>
              <td className="px-4 py-3 capitalize">{e.method}</td>
            </tr>
          ))}
        </Table>
      )}
      {creating && (
        <Modal title="New Expense" onClose={() => setCreating(false)}>
          <ExpenseForm onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error ? apiError(create.error) : ''} />
        </Modal>
      )}
    </div>
  )
}

function ExpenseForm({ onSubmit, busy, error }: { onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ expense_date: new Date().toISOString().slice(0, 10), category: 'diesel', title: '', amount: '', method: 'cash', bank_ref: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, amount: Number(form.amount) }) }} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={form.expense_date} onChange={(e) => set('expense_date', e.target.value)} required /></Field>
        <Field label="Category">
          <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Title"><Input value={form.title} onChange={(e) => set('title', e.target.value)} required /></Field>
      <Field label="Amount (Rs)"><Input type="number" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} required /></Field>
      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save'}</Button>
    </form>
  )
}
