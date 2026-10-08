import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Button, type Column, DataTable, Field, IconButton, Input, MethodField, Modal, MoneyInput, PageHeader, RowActions, Select } from '../components/ui'
import { AdjustmentVoucher, type AdjustmentDoc } from '../components/receipts'

interface Adjustment {
  id: string
  reference: string
  mode: string
  party_name?: string
  adjustment_date: string
  amount: number
  reason: string
}

const MODES = [
  { key: 'customer_discount', label: 'Customer ko discount / kami (dues kam)' },
  { key: 'customer_charge', label: 'Customer pe extra charge (dues zyada)' },
  { key: 'supplier_discount', label: 'Supplier discount mila (hamari dues kam)' },
  { key: 'supplier_charge', label: 'Supplier extra (hamari dues zyada)' },
  { key: 'cash_out', label: 'Cash kharcha / diya (OUT)' },
  { key: 'cash_in', label: 'Cash aamdani / mila (IN)' },
]

const modeLabel = (m: string) => MODES.find((x) => x.key === m)?.label ?? m

/**
 * Parchi ke liye row ko theek karna.
 *
 * Do baatein: naya adjustment banane par API poora record wapas karta hai jis
 * me date ke saath waqt bhi lagta hai (parchi par sirf din chahiye), aur mode
 * ki jagah wohi Roman Urdu line jaati hai jo list me dikhti hai, warna kaghaz
 * par "cash_out" jaisa code chhap jata hai. Party ka naam list me hota hai,
 * naye record me nahi, is liye wo form se aata hai.
 */
const toVoucher = (
  a: { reference: string; mode: string; adjustment_date: string; amount: number; reason?: string | null; party_name?: string | null },
  partyName?: string,
): AdjustmentDoc => ({
  reference: a.reference,
  adjustment_date: String(a.adjustment_date).slice(0, 10),
  mode: modeLabel(a.mode),
  amount: a.amount,
  reason: a.reason ?? null,
  party_name: a.party_name ?? partyName ?? null,
})

export default function Adjustments() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  // Jo adjustment abhi hua ya jis row ka print dabaya gaya, uski parchi.
  const [voucher, setVoucher] = useState<AdjustmentDoc | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('adjustment_date')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const { data, isLoading } = useList<Adjustment>('adjustments', { search, page, sort, dir })

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }

  // Party ka naam sirf form ko pata hota hai (API naye record me sirf party_id
  // deti hai), is liye wo mutation ke saath hi safar karta hai taake parchi par
  // "Khata" ki jagah asli naam chhape.
  const create = useMutation({
    mutationFn: (v: { payload: Record<string, unknown>; partyName?: string }) => api.post('/adjustments', v.payload),
    onSuccess: (res, v) => {
      qc.invalidateQueries({ queryKey: ['adjustments'] })
      setCreating(false)
      // Khaate me plus minus hua hai, to kaghaz saath hi nikal aana chahiye.
      setVoucher(toVoucher(res.data.data, v.partyName))
    },
  })

  const columns: Column<Adjustment>[] = [
    { key: 'reference', label: 'Ref', sortable: true, render: (a) => <span className="font-mono text-xs">{a.reference}</span> },
    { key: 'adjustment_date', label: 'Date', sortable: true, render: (a) => a.adjustment_date },
    { key: 'mode', label: 'Type', sortable: true, render: (a) => <span className="text-xs">{modeLabel(a.mode)}</span> },
    { key: 'party_name', label: 'Party', render: (a) => a.party_name ?? '·' },
    { key: 'amount', label: 'Amount', sortable: true, align: 'right', render: (a) => formatPaisa(a.amount) },
    { key: 'reason', label: 'Reason', render: (a) => <span className="text-xs" style={{ color: 'var(--muted)' }}>{a.reason}</span> },
    {
      key: 'actions', label: '', align: 'right', render: (a) => (
        <RowActions>
          <IconButton icon={Printer} label="Parchi dekhein / print karein" tone="primary" onClick={() => setVoucher(toVoucher(a))} />
        </RowActions>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Adjustments"
        subtitle="Bill/dues ya cash ka adjustment, sab jaga balanced plus-minus"
        actions={can('payments.manage') && <Button onClick={() => setCreating(true)}>+ Adjustment</Button>}
      />
      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading}
        emptyText="Koi adjustment nahi."
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Ref, wajah ya party se dhoondein…"
        sort={sort}
        dir={dir}
        onSort={onSort}
        meta={data?.meta}
        page={page}
        onPage={setPage}
      />
      {voucher && <AdjustmentVoucher adjustment={voucher} onClose={() => setVoucher(null)} />}

      {creating && (
        <Modal title="New Adjustment" onClose={() => setCreating(false)}>
          <AdjForm
            onSubmit={(p, partyName) => create.mutate({ payload: p, partyName })}
            busy={create.isPending}
            error={create.error ? apiError(create.error) : ''}
          />
        </Modal>
      )}
    </div>
  )
}

function AdjForm({ onSubmit, busy, error }: { onSubmit: (p: Record<string, unknown>, partyName?: string) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ mode: 'customer_discount', party_id: '', adjustment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '', reason: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  const isCustomer = form.mode.startsWith('customer_')
  const isSupplier = form.mode.startsWith('supplier_')
  const isCash = form.mode === 'cash_in' || form.mode === 'cash_out'
  const customers = useList<{ id: string; name: string }>('customers', { per_page: 100 })
  const suppliers = useList<{ id: string; name: string }>('suppliers', { per_page: 100 })

  // Sirf parchi ke liye: chuni gayi party ka naam. Cash walay modes me koi
  // party hoti hi nahi, to wahan khali rehta hai.
  const partyName = isCustomer
    ? customers.data?.data.find((c) => c.id === form.party_id)?.name
    : isSupplier
      ? suppliers.data?.data.find((s) => s.id === form.party_id)?.name
      : undefined

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({
          mode: form.mode,
          party_id: isCustomer || isSupplier ? form.party_id : undefined,
          adjustment_date: form.adjustment_date,
          amount: Number(form.amount),
          method: isCash ? form.method : undefined,
          bank_ref: isCash && form.method === 'bank' ? form.bank_ref : undefined,
          reason: form.reason,
        }, partyName)
      }}
      className="space-y-3"
    >
      <Field label="Kis cheez ka adjustment?">
        <Select value={form.mode} onChange={(e) => set('mode', e.target.value)}>
          {MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </Select>
      </Field>
      {isCustomer && (
        <Field label="Customer">
          <Select value={form.party_id} onChange={(e) => set('party_id', e.target.value)} required>
            <option value="">Select…</option>
            {customers.data?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      )}
      {isSupplier && (
        <Field label="Supplier">
          <Select value={form.party_id} onChange={(e) => set('party_id', e.target.value)} required>
            <option value="">Select…</option>
            {suppliers.data?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={form.adjustment_date} onChange={(e) => set('adjustment_date', e.target.value)} required /></Field>
        <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
      </div>
      {isCash && <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />}
      <Field label="Reason (wajah)"><Input value={form.reason} onChange={(e) => set('reason', e.target.value)} required placeholder="e.g. bill zyada bana tha" /></Field>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save Adjustment'}</Button>
    </form>
  )
}
