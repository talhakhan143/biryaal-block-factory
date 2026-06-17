import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Badge, Button, Field, Input, Modal, PageHeader, Pagination, Spinner, Table } from '../components/ui'

interface Supplier {
  id: string
  name: string
  phone?: string
  address?: string
  balance: number
  is_active: boolean
}

export default function Suppliers() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const { data, isLoading } = useList<Supplier>('suppliers', { search, page })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['suppliers'] })

  const create = useMutation({
    mutationFn: (payload: Record<string, string>) => api.post('/suppliers', payload),
    onSuccess: () => {
      invalidate()
      setCreating(false)
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

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="Maal walay — jin se kacha maal lete hain"
        actions={can('suppliers.manage') && <Button onClick={() => setCreating(true)}>+ Supplier</Button>}
      />

      <div className="mb-4">
        <Input placeholder="Search name or phone…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="max-w-xs" />
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Name', 'Phone', 'Balance (we owe)', 'Status', '']}>
          {data?.data.map((s) => (
            <tr key={s.id} style={{ opacity: s.is_active ? 1 : 0.55 }}>
              <td className="px-4 py-3 font-medium">{s.name}</td>
              <td className="px-4 py-3">{s.phone ?? '—'}</td>
              <td className="px-4 py-3">
                {s.balance > 0 ? <Badge color="red">{formatPaisa(s.balance)}</Badge> : <Badge color="green">Settled</Badge>}
              </td>
              <td className="px-4 py-3">
                {s.is_active ? <Badge color="green">Active</Badge> : <Badge color="amber">Off</Badge>}
              </td>
              <td className="px-4 py-3 text-right space-x-3">
                <button className="text-sm text-blue-600 hover:underline" onClick={() => setLedgerId(s.id)}>
                  Ledger
                </button>
                {can('suppliers.manage') && (
                  <button className="text-sm hover:underline" style={{ color: 'var(--primary)' }} onClick={() => toggle.mutate(s)}>
                    {s.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                )}
                {can('suppliers.manage') && (
                  <button className="text-sm hover:underline" style={{ color: 'var(--red)' }} onClick={() => { if (confirm(`Delete supplier ${s.name}?`)) del.mutate(s.id) }}>
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
          {data?.data.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-slate-400">No suppliers yet.</td>
            </tr>
          )}
        </Table>
      )}
      <Pagination meta={data?.meta} page={page} onPage={setPage} />

      {creating && (
        <Modal title="New Supplier" onClose={() => setCreating(false)}>
          <SupplierForm onSubmit={(p) => create.mutate(p)} busy={create.isPending} error={create.error ? apiError(create.error) : ''} />
        </Modal>
      )}

      {ledgerId && <LedgerModal id={ledgerId} onClose={() => setLedgerId(null)} />}
    </div>
  )
}

function SupplierForm({ onSubmit, busy, error }: { onSubmit: (p: Record<string, string>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ name: '', phone: '', address: '' })
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
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save'}</Button>
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
            {data.supplier.name} — Balance: <strong>{formatPaisa(data.balance)}</strong>
          </div>
          <Table head={['Date', 'Ref', 'Desc', 'Debit', 'Credit']}>
            {data.rows.map((r: Record<string, string | number>, i: number) => (
              <tr key={i}>
                <td className="px-4 py-2">{r.date}</td>
                <td className="px-4 py-2">{r.reference}</td>
                <td className="px-4 py-2">{r.description}</td>
                <td className="px-4 py-2">{r.debit ? formatPaisa(Number(r.debit)) : '—'}</td>
                <td className="px-4 py-2">{r.credit ? formatPaisa(Number(r.credit)) : '—'}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Modal>
  )
}
