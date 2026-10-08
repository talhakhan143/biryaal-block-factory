import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { SquarePen, ArrowRight, BookText, Power, PowerOff, Trash2 } from 'lucide-react'
import { Badge, Button, type Column, DataTable, Field, IconButton, Input, Modal, PageHeader, RowActions, Spinner, Table, useConfirm } from '../components/ui'

interface Supplier {
  id: string
  name: string
  phone?: string
  address?: string
  balance: number
  is_active: boolean
  created_at?: string
}

export default function Suppliers() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('created_at')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const { data, isLoading } = useList<Supplier>('suppliers', { search, page, sort, dir })

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir(key === 'created_at' ? 'desc' : 'asc') }
    setPage(1)
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: ['suppliers'] })

  const create = useMutation({
    mutationFn: (payload: Record<string, string>) => editing ? api.put(`/suppliers/${editing.id}`, payload) : api.post('/suppliers', payload),
    onSuccess: () => {
      invalidate()
      setCreating(false)
      setEditing(null)
    },
  })

  const toggle = useMutation({
    mutationFn: (s: Supplier) => api.put(`/suppliers/${s.id}`, { name: s.name, phone: s.phone ?? '', address: s.address ?? '', is_active: !s.is_active }),
    onSuccess: invalidate,
    onError: (e) => alert(apiError(e)),
  })

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/suppliers/${id}`),
    onSuccess: invalidate,
    onError: (e) => alert(apiError(e)),
  })

  const columns: Column<Supplier>[] = [
    { key: 'name', label: 'Name', sortable: true, render: (s) => <span className="font-medium" style={{ opacity: s.is_active ? 1 : 0.55 }}>{s.name}</span> },
    { key: 'phone', label: 'Phone', sortable: true, render: (s) => s.phone ?? '·' },
    { key: 'balance', label: 'Balance (we owe)', sortable: true, align: 'right', render: (s) => (s.balance > 0 ? <Badge color="red">{formatPaisa(s.balance)}</Badge> : <Badge color="green">Settled</Badge>) },
    { key: 'is_active', label: 'Status', sortable: true, render: (s) => (s.is_active ? <Badge color="green">Active</Badge> : <Badge color="amber">Off</Badge>) },
    { key: 'created_at', label: 'Kab bana', sortable: true, render: (r) => (r.created_at ? String(r.created_at).slice(0, 10) : '·') },
    {
      key: 'actions', label: '', align: 'right', render: (s) => (
        <div onClick={(e) => e.stopPropagation()}>
        <RowActions>
          <IconButton icon={BookText} label="Khata (quick)" onClick={() => setLedgerId(s.id)} />
          {can('suppliers.manage') && <IconButton icon={SquarePen} label="Naam, phone ya address theek karein" tone="primary" onClick={() => setEditing(s)} />}
          <IconButton icon={ArrowRight} label="Poori history" tone="primary" onClick={() => navigate(`/suppliers/${s.id}`)} />
          {can('suppliers.manage') && (
            <IconButton icon={s.is_active ? PowerOff : Power} label={s.is_active ? 'Deactivate' : 'Activate'} tone="amber" onClick={() => toggle.mutate(s)} />
          )}
          {can('suppliers.delete') && (
            <IconButton icon={Trash2} label="Delete" tone="red" onClick={async () => {
              if (await confirm({ title: 'Supplier delete karein?', message: `"${s.name}" delete ho jayega.`, confirmText: 'Delete' })) del.mutate(s.id)
            }} />
          )}
        </RowActions>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="Kisi bhi naam par click karein, poori history khul jayegi. Maal walay, jin se kacha maal lete hain"
        actions={can('suppliers.manage') && <Button onClick={() => setCreating(true)}>+ Supplier</Button>}
      />

      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading}
        emptyText="No suppliers yet."
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Name ya phone se search…"
        sort={sort}
        dir={dir}
        onSort={onSort}
        meta={data?.meta}
        page={page}
        onPage={setPage}
        onRowClick={(s) => navigate(`/suppliers/${s.id}`)}
      />

      {(creating || editing) && (
        <Modal title={editing ? `Theek karein: ${editing.name}` : 'Naya Supplier'} onClose={() => { setCreating(false); setEditing(null) }}>
          <SupplierForm supplier={editing} onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error ? apiError(create.error) : ''} submitLabel={editing ? 'Save karein' : 'Add karein'} />
        </Modal>
      )}

      {ledgerId && <LedgerModal id={ledgerId} onClose={() => setLedgerId(null)} />}
    </div>
  )
}

function SupplierForm({ supplier, onSubmit, busy, error, submitLabel = 'Save' }: { supplier?: Supplier | null; onSubmit: (p: Record<string, string>) => void; busy: boolean; error: string; submitLabel?: string }) {
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    phone: supplier?.phone ?? '',
    address: supplier?.address ?? '',
  })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(form)
      }}
      className="space-y-3"
    >
      <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
      <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
      <Field label="Address"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : submitLabel}</Button>
    </form>
  )
}

function LedgerModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['supplier-ledger', id],
    queryFn: async () => (await api.get(`/suppliers/${id}/ledger`)).data,
  })
  return (
    <Modal title="Supplier Ledger" onClose={onClose}>
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <div>
          <div className="mb-3 text-sm">
            {data.supplier.name}, Balance: <strong>{formatPaisa(data.balance)}</strong>
          </div>
          <Table head={['Date', 'Ref', 'Desc', { label: 'Debit', align: 'right' }, { label: 'Credit', align: 'right' }]}>
            {data.rows.map((r: Record<string, string | number>, i: number) => (
              <tr key={i}>
                <td className="px-4 py-2">{r.date}</td>
                <td className="px-4 py-2">{r.reference}</td>
                <td className="px-4 py-2">{r.description}</td>
                <td className="px-4 py-2">{r.debit ? formatPaisa(Number(r.debit)) : '·'}</td>
                <td className="px-4 py-2">{r.credit ? formatPaisa(Number(r.credit)) : '·'}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Modal>
  )
}
