import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Badge, Button, type Column, DataTable, Field, Input, MethodField, Modal, MoneyInput, PageHeader, Select } from '../components/ui'

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
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('expense_date')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const { data, isLoading } = useList<Expense>('expenses', { page, search, sort, dir })

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }

  const create = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/expenses', p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      setCreating(false)
    },
  })

  const columns: Column<Expense>[] = [
    { key: 'reference', label: 'Ref', sortable: true, render: (e) => <span className="font-mono text-xs">{e.reference}</span> },
    { key: 'expense_date', label: 'Date', sortable: true, render: (e) => e.expense_date },
    { key: 'category', label: 'Category', sortable: true, render: (e) => <Badge color="blue">{e.category}</Badge> },
    { key: 'title', label: 'Title', render: (e) => e.title },
    { key: 'amount', label: 'Amount', sortable: true, align: 'right', render: (e) => formatPaisa(e.amount) },
    { key: 'method', label: 'Method', render: (e) => <span className="capitalize">{e.method}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Kharchay — bijli, diesel waghera"
        actions={can('expenses.manage') && <Button onClick={() => setCreating(true)}>+ Expense</Button>}
      />
      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading}
        emptyText="Koi kharcha nahi."
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Ref, category ya title se search…"
        sort={sort}
        dir={dir}
        onSort={onSort}
        meta={data?.meta}
        page={page}
        onPage={setPage}
      />
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
      <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save'}</Button>
    </form>
  )
}
