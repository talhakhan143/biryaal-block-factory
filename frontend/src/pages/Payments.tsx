import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Badge, Button, Field, Input, MethodField, Modal, MoneyInput, OutstandingNote, PageHeader, Pagination, Select, Spinner, Table } from '../components/ui'

interface Payment {
  id: string
  reference: string
  direction: string
  party_name?: string
  payment_date: string
  amount: number
  method: string
  bank_ref?: string
}

interface Party { id: string; name: string; balance: number }

export default function Payments() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [modal, setModal] = useState<'receipt' | 'supplier' | null>(null)
  const [preset, setPreset] = useState<string>('')
  const [page, setPage] = useState(1)
  const [recvPage, setRecvPage] = useState(1)
  const [payPage, setPayPage] = useState(1)
  const [search, setSearch] = useState('')
  const { data, isLoading } = useList<Payment>('payments', { page, search })
  const recv = useList<Party>('customers', { has_dues: 1, page: recvPage })
  const pay = useList<Party>('suppliers', { has_dues: 1, page: payPage })

  const mutate = useMutation({
    mutationFn: ({ kind, payload }: { kind: string; payload: Record<string, unknown> }) =>
      api.post(kind === 'receipt' ? '/payments/receipt' : '/payments/supplier', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      setModal(null)
      setPreset('')
    },
  })

  const open = (kind: 'receipt' | 'supplier', partyId = '') => { setPreset(partyId); setModal(kind) }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        subtitle="Paisa aana (receipt) aur paisa jana (payment)"
        actions={
          can('payments.manage') && (
            <>
              <Button variant="ghost" onClick={() => open('supplier')}>Pay Supplier</Button>
              <Button onClick={() => open('receipt')}>Receive Payment</Button>
            </>
          )
        }
      />

      {/* Customers who owe us — collect here */}
      <div>
        <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--text)' }}>Lene baqi (Customers se) <span className="font-normal" style={{ color: 'var(--muted)' }}>— receivables</span></h2>
        <Table head={['Customer', 'Baqi (dene hain)', '']}>
          {recv.data?.data.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3 font-medium">{c.name}</td>
              <td className="px-4 py-3"><Badge color="amber">{formatPaisa(c.balance)}</Badge></td>
              <td className="px-4 py-3 text-right">
                {can('payments.manage') && <button className="text-sm hover:underline" style={{ color: 'var(--green)' }} onClick={() => open('receipt', c.id)}>Receive</button>}
              </td>
            </tr>
          ))}
          {recv.data?.data.length === 0 && <tr><td colSpan={3} className="px-4 py-4 text-center text-sm" style={{ color: 'var(--muted)' }}>Sab clear — kisi se lena baqi nahi.</td></tr>}
        </Table>
        <Pagination meta={recv.data?.meta} page={recvPage} onPage={setRecvPage} />
      </div>

      {/* Suppliers we owe — pay here */}
      <div>
        <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--text)' }}>Dene baqi (Suppliers ko) <span className="font-normal" style={{ color: 'var(--muted)' }}>— payables</span></h2>
        <Table head={['Supplier', 'Baqi (dene hain)', '']}>
          {pay.data?.data.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-3 font-medium">{s.name}</td>
              <td className="px-4 py-3"><Badge color="red">{formatPaisa(s.balance)}</Badge></td>
              <td className="px-4 py-3 text-right">
                {can('payments.manage') && <button className="text-sm hover:underline" style={{ color: 'var(--primary)' }} onClick={() => open('supplier', s.id)}>Pay</button>}
              </td>
            </tr>
          ))}
          {pay.data?.data.length === 0 && <tr><td colSpan={3} className="px-4 py-4 text-center text-sm" style={{ color: 'var(--muted)' }}>Sab clear — kisi ko dena baqi nahi.</td></tr>}
        </Table>
        <Pagination meta={pay.data?.meta} page={payPage} onPage={setPayPage} />
      </div>

      {/* All payments history */}
      <div>
        <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--text)' }}>Saari payments (history)</h2>
        <div className="mb-3">
          <Input placeholder="Search ref or party name…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="max-w-xs" />
        </div>
        {isLoading ? (
          <Spinner />
        ) : (
          <Table head={['Ref', 'Date', 'Direction', 'Party', 'Amount', 'Method', 'Bank / ref']}>
            {data?.data.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-mono text-xs">{p.reference}</td>
                <td className="px-4 py-3">{p.payment_date}</td>
                <td className="px-4 py-3">
                  <Badge color={p.direction === 'receipt' ? 'green' : 'red'}>{p.direction === 'receipt' ? 'IN' : 'OUT'}</Badge>
                </td>
                <td className="px-4 py-3">{p.party_name}</td>
                <td className="px-4 py-3">{formatPaisa(p.amount)}</td>
                <td className="px-4 py-3"><Badge color={p.method === 'bank' ? 'blue' : 'slate'}>{p.method}</Badge></td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>{p.bank_ref ?? '—'}</td>
              </tr>
            ))}
          </Table>
        )}
        <Pagination meta={data?.meta} page={page} onPage={setPage} />
      </div>

      {modal && (
        <Modal title={modal === 'receipt' ? 'Receive from Customer' : 'Pay Supplier'} onClose={() => { setModal(null); setPreset('') }}>
          <PaymentForm
            kind={modal}
            initialParty={preset}
            onSubmit={(payload) => mutate.mutate({ kind: modal, payload })}
            busy={mutate.isPending}
            error={mutate.error ? apiError(mutate.error) : ''}
          />
        </Modal>
      )}
    </div>
  )
}

function PaymentForm({ kind, initialParty = '', onSubmit, busy, error }: { kind: string; initialParty?: string; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const partyResource = kind === 'receipt' ? 'customers' : 'suppliers'
  const parties = useList<{ id: string; name: string; balance: number }>(partyResource, { per_page: 100 })
  const [form, setForm] = useState({ party: initialParty, payment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })

  const selected = parties.data?.data.find((p) => p.id === form.party)
  const outstandingLabel = kind === 'receipt' ? 'Customer ne dene hain (baqi)' : 'Humne dene hain (baqi)'

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const idKey = kind === 'receipt' ? 'customer_id' : 'supplier_id'
        onSubmit({ [idKey]: form.party, payment_date: form.payment_date, amount: Number(form.amount), method: form.method, bank_ref: form.method === 'bank' ? form.bank_ref : undefined })
      }}
      className="space-y-3"
    >
      <Field label={kind === 'receipt' ? 'Customer (Grahak)' : 'Supplier (Maal wala)'}>
        <Select value={form.party} onChange={(e) => set('party', e.target.value)} required>
          <option value="">Select…</option>
          {parties.data?.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      {selected && <OutstandingNote label={outstandingLabel} amount={selected.balance} onFill={(rs) => set('amount', String(rs))} />}
      {selected && selected.balance <= 0 ? (
        <p className="text-sm" style={{ color: 'var(--green)' }}>Sab clear — koi baqi nahi.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required /></Field>
            <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
          </div>
          <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
        </>
      )}
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy || !form.party || (!!selected && selected.balance <= 0)} className="w-full">{busy ? 'Saving…' : 'Save'}</Button>
    </form>
  )
}
