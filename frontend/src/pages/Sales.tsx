import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { Badge, Button, Input, PageHeader, Spinner, Table } from '../components/ui'

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
  const [search, setSearch] = useState('')
  const [viewId, setViewId] = useState<string | null>(null)
  const { data, isLoading } = useList<Sale>('sales', { search })

  return (
    <div>
      <PageHeader title="Sales" subtitle="Saari bikri — cash aur udhaar" />
      <div className="mb-4">
        <Input placeholder="Search invoice no…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
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
              <td className="px-4 py-3 text-right">
                <button className="text-sm hover:underline" style={{ color: 'var(--primary)' }} onClick={() => setViewId(s.id)}>
                  View / Print
                </button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {viewId && <InvoiceModal id={viewId} onClose={() => setViewId(null)} />}
    </div>
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
              <h2 className="text-lg font-bold">Biryaal Block Factory</h2>
              <p className="text-xs text-slate-500">Sales Invoice</p>
              <p className="mt-1 font-mono text-sm">{String(data.invoice_no)}</p>
              <p className="text-xs text-slate-500">{data.sale_date} · {data.customer?.name ?? 'Walk-in'} · {String(data.type).toUpperCase()}</p>
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
