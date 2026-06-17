import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import { Badge, Button, Field, Input, MethodField, Modal, MoneyInput, OutstandingNote, PageHeader, Pagination, Spinner, Table } from '../components/ui'

interface Sale {
  id: string
  invoice_no: string
  customer?: { name: string }
  sale_date: string
  type: string
  total: number
  paid: number
  balance: number
  status: string
}

const statusColor: Record<string, string> = { paid: 'green', partial: 'amber', unpaid: 'red' }

export default function Sales() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [viewId, setViewId] = useState<string | null>(null)
  const [receiveFor, setReceiveFor] = useState<Sale | null>(null)
  const { data, isLoading } = useList<Sale>('sales', { search, page })

  const receive = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.post(`/sales/${id}/receive`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] })
      setReceiveFor(null)
    },
  })

  return (
    <div>
      <PageHeader title="Sales" subtitle="Saari bikri — cash aur udhaar" />
      <div className="mb-4">
        <Input placeholder="Search invoice no…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="max-w-xs" />
      </div>
      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Invoice', 'Date', 'Customer', 'Type', 'Total', 'Paid', 'Balance', 'Status', '']}>
          {data?.data.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-3 font-mono text-xs">{s.invoice_no}</td>
              <td className="px-4 py-3">{s.sale_date}</td>
              <td className="px-4 py-3">{s.customer?.name ?? 'Walk-in'}</td>
              <td className="px-4 py-3 capitalize">{s.type}</td>
              <td className="px-4 py-3">{formatPaisa(s.total)}</td>
              <td className="px-4 py-3">{formatPaisa(s.paid)}</td>
              <td className="px-4 py-3">{formatPaisa(s.balance)}</td>
              <td className="px-4 py-3"><Badge color={statusColor[s.status]}>{s.status}</Badge></td>
              <td className="px-4 py-3 text-right space-x-3">
                {can('payments.manage') && s.balance > 0 && (
                  <button className="text-sm hover:underline" style={{ color: 'var(--green)' }} onClick={() => setReceiveFor(s)}>Receive</button>
                )}
                <button className="text-sm hover:underline" style={{ color: 'var(--primary)' }} onClick={() => setViewId(s.id)}>
                  View / Print
                </button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pagination meta={data?.meta} page={page} onPage={setPage} />
      {viewId && <InvoiceModal id={viewId} onClose={() => setViewId(null)} />}
      {receiveFor && (
        <Modal title={`Receive — ${receiveFor.invoice_no}`} onClose={() => setReceiveFor(null)}>
          <ReceiveForm
            outstanding={receiveFor.balance}
            onSubmit={(payload) => receive.mutate({ id: receiveFor.id, payload })}
            busy={receive.isPending}
            error={receive.error ? apiError(receive.error) : ''}
          />
        </Modal>
      )}
    </div>
  )
}

function ReceiveForm({ outstanding, onSubmit, busy, error }: { outstanding: number; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ payment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, amount: Number(form.amount) }) }} className="space-y-3">
      <OutstandingNote label="Is invoice ka baqi (customer se lena)" amount={outstanding} onFill={(rs) => set('amount', String(rs))} />
      <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required /></Field>
      <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Receive'}</Button>
    </form>
  )
}

function InvoiceModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['sale', id],
    queryFn: async () => (await api.get(`/sales/${id}`)).data.data,
  })
  const items = (data?.items as { product_name: string; quantity: number; unit_price: number; line_total: number }[]) ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-6 text-slate-900" onClick={(e) => e.stopPropagation()}>
        {isLoading || !data ? (
          <Spinner />
        ) : (
          <>
            <div className="text-center">
              <img src="/logo.png" alt="Barval" className="mx-auto mb-2 h-16 w-auto object-contain" />
              <p className="text-xs text-slate-500">Sales Invoice</p>
              <p className="mt-1 font-mono text-sm">{String(data.invoice_no)}</p>
              <p className="text-xs text-slate-500">{data.sale_date} · {data.customer?.name ?? 'Walk-in'} · {String(data.type).toUpperCase()}</p>
              {data.payment_method && (
                <p className="text-xs text-slate-500">Paid via {String(data.payment_method).toUpperCase()}{data.bank_ref ? ` (${data.bank_ref})` : ''}</p>
              )}
            </div>
            <div className="my-4 border-y border-dashed border-slate-300 py-3 text-sm">
              {items.map((it, i) => (
                <div key={i} className="flex justify-between">
                  <span>{it.product_name} × {it.quantity}</span>
                  <span>{formatPaisa(it.line_total)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1 text-sm">
              {Number(data.transport_fare) > 0 && <div className="flex justify-between"><span>Transport (kiraya)</span><span>{formatPaisa(Number(data.transport_fare))}</span></div>}
              <div className="flex justify-between font-bold"><span>Total</span><span>{formatPaisa(Number(data.total))}</span></div>
              <div className="flex justify-between"><span>Paid</span><span>{formatPaisa(Number(data.paid))}</span></div>
              <div className="flex justify-between"><span>Balance</span><span>{formatPaisa(Number(data.balance))}</span></div>
            </div>
            <p className="mt-4 text-center text-[10px] text-slate-400">Software by Talha Khan · WhatsApp 92-336-8469404</p>
            <div className="no-print mt-5 flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={onClose}>Close</Button>
              <Button className="flex-1" onClick={() => window.print()}>Print</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
