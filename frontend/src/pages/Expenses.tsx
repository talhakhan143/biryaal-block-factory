import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Badge, Button, type Column, DataTable, Field, Input, MethodField, Modal, MoneyInput, Note, PageHeader, Select, StatTile } from '../components/ui'

interface Expense {
  id: string
  reference: string
  expense_date: string
  category: string
  title: string
  amount: number
  method: string
}

interface CostSummary {
  from?: string | null
  to?: string | null
  direct: { entries: number; total: number; by_category: { category: string; entries: number; total: number }[] }
  other: { key: string; label: string; hint: string; link: string | null; entries: number; total: number }[]
  other_total: number
  other_available: boolean
  grand_total: number
}

const CATEGORIES = ['electricity', 'diesel', 'maintenance', 'internet', 'other']

const pretty = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export default function Expenses() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('expense_date')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')

  // Dashboard card jo scope bhejta hai wahi URL me rehta hai, taake link share
  // karne par doosre banday ko bhi wahi list mile.
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const category = params.get('category') ?? ''
  const scoped = Boolean(from || to || category)

  // Aik hi call me saare params. Do alag calls lagataar karne par doosri call
  // purane params padh leti hai aur pehli change gum ho jati hai.
  const setParam = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
    setPage(1)
  }
  const clearScope = () => { setParams(new URLSearchParams(), { replace: true }); setPage(1) }

  const query = { page, search, sort, dir, from: from || undefined, to: to || undefined, category: category || undefined }
  const { data, isLoading } = useList<Expense>('expenses', query)
  const { data: summary } = useQuery({
    queryKey: ['expenses/summary', { from, to, category, search }],
    queryFn: async () => (await api.get<CostSummary>('/expenses/summary', {
      params: { from: from || undefined, to: to || undefined, category: category || undefined, search: search || undefined },
    })).data,
  })

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }

  const create = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/expenses', p),
    onSuccess: () => {
      ;['expenses', 'expenses/summary', 'dashboard', 'cash-book', 'accounting', 'payments'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
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

  const scopeLabel = from && to && from === to ? pretty(from)
    : from && to ? `${pretty(from)} se ${pretty(to)}`
    : from ? `${pretty(from)} se aage`
    : to ? `${pretty(to)} tak`
    : ''

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Kharchay — bijli, diesel waghera"
        actions={can('expenses.manage') && <Button onClick={() => setCreating(true)}>+ Expense</Button>}
      />

      {/* Active scope, exactly as the dashboard sent it */}
      {scoped && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Filter</span>
          {scopeLabel && <Chip label={scopeLabel} onClear={() => setParam({ from: '', to: '' })} />}
          {category && <Chip label={category} onClear={() => setParam({ category: '' })} />}
          <button onClick={clearScope} className="text-xs font-medium underline" style={{ color: 'var(--primary)' }}>Saaray dikhayein</button>
        </div>
      )}

      {/* Totals first: this is the number the dashboard card was showing */}
      {summary && (
        <div className="bf-stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label={scoped ? 'In dinon ke kharchay' : 'Saaray kharchay'}
            value={formatPaisa(summary.direct.total)}
            hint={`Neeche wali list ke ${summary.direct.entries} kharchay`}
            tone="red"
          />
          {summary.other_available && (
            <>
              <StatTile label="Salary aur mazdoori" value={formatPaisa(summary.other_total)} hint="Ye list me nahi aate" tone="amber" />
              <StatTile label="Kul kharcha" value={formatPaisa(summary.grand_total)} hint="Dono mila kar" tone="red" />
            </>
          )}
          {summary.direct.by_category[0] && (
            <StatTile
              label="Sabse zyada kis par"
              value={summary.direct.by_category[0].category}
              hint={formatPaisa(summary.direct.by_category[0].total)}
              tone="primary"
            />
          )}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label="Kis din se"><Input type="date" value={from} onChange={(e) => setParam({ from: e.target.value })} /></Field>
        <Field label="Kis din tak"><Input type="date" value={to} onChange={(e) => setParam({ to: e.target.value })} /></Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => setParam({ category: e.target.value })}>
            <option value="">Saaray</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
      </div>

      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading}
        emptyText={
          scoped
            ? <span>In dinon ka koi kharcha nahi likha gaya. <button onClick={clearScope} className="font-medium underline" style={{ color: 'var(--primary)' }}>Saaray dikhayein</button></span>
            : 'Abhi tak koi kharcha nahi likha gaya.'
        }
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Naam ya category se dhoondein…"
        sort={sort}
        dir={dir}
        onSort={onSort}
        meta={data?.meta}
        page={page}
        onPage={setPage}
      />

      {/* The costs this page can never list. Without this the dashboard's cost
          figure has nowhere to be explained. */}
      {summary?.other_available && summary.other.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-1 text-sm font-bold" style={{ color: 'var(--text)' }}>Ye kharchay is list me nahi aate</h2>
          <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
            Ye bhi inhi dinon ka kharcha hai, bas ye upar wali list me nahi aata kyunki ye alag jagah se likha jata hai. Card par click karke wahan chale jayein.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.other.map((o) => (
              <button
                key={o.key}
                onClick={() => o.link && navigate(o.link)}
                disabled={!o.link}
                className={`rounded-xl border p-4 text-left transition ${o.link ? 'bf-lift cursor-pointer' : ''}`}
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{o.label}</span>
                  {o.link && <span style={{ color: 'var(--muted)' }}>›</span>}
                </div>
                <div className="text-[10px]" style={{ color: 'var(--muted)' }}>{o.hint}</div>
                <div className="mt-2 text-lg font-bold" style={{ color: 'var(--amber)' }}>{formatPaisa(o.total)}</div>
                <div className="text-[10px]" style={{ color: 'var(--muted)' }}>{o.entries} entries</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {summary?.other_available && summary.other.length === 0 && scoped && (
        <div className="mt-6">
          <Note>In dinon me koi salary ya mazdoori nahi likhi gayi.</Note>
        </div>
      )}

      {creating && (
        <Modal title="New Expense" onClose={() => setCreating(false)}>
          <ExpenseForm onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error ? apiError(create.error) : ''} />
        </Modal>
      )}
    </div>
  )
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}
    >
      {label}
      <button onClick={onClear} aria-label="Filter hatayein" className="transition hover:opacity-70"><X size={12} /></button>
    </span>
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
