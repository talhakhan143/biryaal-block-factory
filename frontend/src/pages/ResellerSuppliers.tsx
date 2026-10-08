import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { SquarePen, Trash2, Wallet } from 'lucide-react'
import { Badge, Button, type Column, DataTable, Field, IconButton, Input, MethodField, Modal, MoneyInput, OutstandingNote, PageHeader, RowActions, useConfirm } from '../components/ui'

export interface RSupplier {
  id: string
  name: string
  phone?: string
  address?: string
  balance: number
  is_active: boolean
  created_at?: string
}

export default function ResellerSuppliers() {
  const { can } = useAuth()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<RSupplier | null>(null)
  const [creating, setCreating] = useState(false)
  const [payFor, setPayFor] = useState<RSupplier | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('created_at')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const { data, isLoading } = useList<RSupplier>('reseller/suppliers', { page, search, sort, dir })
  const manage = can('reseller.manage')

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir(key === 'created_at' ? 'desc' : 'asc') }
    setPage(1)
  }

  const save = useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: Record<string, unknown> }) =>
      id ? api.put(`/reseller/suppliers/${id}`, payload) : api.post('/reseller/suppliers', payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reseller/suppliers'] }); setEditing(null); setCreating(false) },
  })
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/reseller/suppliers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reseller/suppliers'] }),
    onError: (e) => alert(apiError(e)),
  })
  const pay = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.post(`/reseller/suppliers/${id}/pay`, payload),
    onSuccess: () => {
      ['reseller/suppliers', 'reseller/purchases', 'reseller/dashboard', 'reseller/payables', 'reseller/payments'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      setPayFor(null)
    },
  })
  const remove = async (s: RSupplier) => {
    if (await confirm({ title: 'Supplier delete karein?', message: `"${s.name}" delete ho jayega.`, confirmText: 'Delete' })) del.mutate(s.id)
  }

  const columns: Column<RSupplier>[] = [
    { key: 'name', label: 'Name', sortable: true, render: (s) => <span className="font-medium">{s.name}</span> },
    { key: 'phone', label: 'Phone', render: (s) => s.phone ?? '—' },
    { key: 'balance', label: 'Udhaar (dena)', sortable: true, align: 'right', render: (s) => <span style={{ color: s.balance > 0 ? 'var(--amber)' : 'var(--muted)' }}>{formatPaisa(s.balance)}</span> },
    { key: 'status', label: 'Status', render: (s) => (s.is_active ? <Badge color="green">Active</Badge> : <Badge color="slate">Off</Badge>) },
    { key: 'created_at', label: 'Kab bana', sortable: true, render: (r) => (r.created_at ? String(r.created_at).slice(0, 10) : '·') },
    {
      key: 'actions', label: '', align: 'right', render: (s) => (
        manage ? (
          <RowActions>
            {s.balance > 0 && <IconButton icon={Wallet} label="Pay" tone="green" onClick={() => setPayFor(s)} />}
            <IconButton icon={SquarePen} label="Edit" tone="primary" onClick={() => setEditing(s)} />
            <IconButton icon={Trash2} label="Delete" tone="red" onClick={() => remove(s)} />
          </RowActions>
        ) : null
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Reseller Suppliers"
        subtitle="Jin se maal khareedte ho — udhaar/hisab yahan"
        actions={manage && <Button onClick={() => setCreating(true)}>+ Supplier</Button>}
      />
      <DataTable
        columns={columns} rows={data?.data} loading={isLoading} emptyText="Koi supplier nahi."
        search={search} onSearch={(v) => { setSearch(v); setPage(1) }} searchPlaceholder="Naam ya phone se search…"
        sort={sort} dir={dir} onSort={onSort} meta={data?.meta} page={page} onPage={setPage}
      />
      {(creating || editing) && (
        <Modal title={editing ? 'Edit Supplier' : 'New Supplier'} onClose={() => { setCreating(false); setEditing(null) }}>
          <SupplierForm supplier={editing} onSubmit={(payload) => save.mutate({ id: editing?.id, payload })} busy={save.isPending} error={save.error ? apiError(save.error) : ''} />
        </Modal>
      )}
      {payFor && (
        <Modal title={`Pay — ${payFor.name}`} onClose={() => setPayFor(null)}>
          <PaySupplierForm outstanding={payFor.balance} onSubmit={(payload) => pay.mutate({ id: payFor.id, payload })} busy={pay.isPending} error={pay.error ? apiError(pay.error) : ''} />
        </Modal>
      )}
    </div>
  )
}

function PaySupplierForm({ outstanding, onSubmit, busy, error }: { outstanding: number; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ payment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, amount: Number(form.amount) }) }} className="space-y-3">
      <OutstandingNote label="Supplier ko dena (total baqi)" amount={outstanding} onFill={(rs) => set('amount', String(rs))} />
      <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required /></Field>
      <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Pay'}</Button>
    </form>
  )
}

function SupplierForm({ supplier, onSubmit, busy, error }: { supplier: RSupplier | null; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({
    name: supplier?.name ?? '', phone: supplier?.phone ?? '', address: supplier?.address ?? '', is_active: supplier?.is_active ?? true,
  })
  const set = (k: string, v: string | boolean) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form) }} className="space-y-3">
      <Field label="Name"><Input value={form.name} onChange={(e) => set('name', e.target.value)} required autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Address"><Input value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
        <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} /> Active
      </label>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save'}</Button>
    </form>
  )
}
