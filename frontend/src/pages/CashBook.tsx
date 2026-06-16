import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { formatPaisa } from '../lib/money'
import { Card, PageHeader, Spinner, Table } from '../components/ui'

interface CashRow {
  date: string
  reference: string
  description: string
  in: number
  out: number
  balance: number
}
interface CashBookData {
  opening: number
  closing: number
  total_in: number
  total_out: number
  rows: CashRow[]
}

export default function CashBook() {
  const { data, isLoading } = useQuery({
    queryKey: ['cash-book'],
    queryFn: async () => (await api.get<CashBookData>('/cash-book')).data,
  })

  if (isLoading || !data) return <Spinner />

  return (
    <div>
      <PageHeader title="Cash Book" subtitle="Rozana cash aana jana, running balance ke saath" />
      <div className="mb-4 grid grid-cols-3 gap-4">
        <Card><div className="text-xs uppercase text-slate-500">Total In</div><div className="mt-1 text-xl font-bold text-green-600">{formatPaisa(data.total_in)}</div></Card>
        <Card><div className="text-xs uppercase text-slate-500">Total Out</div><div className="mt-1 text-xl font-bold text-red-600">{formatPaisa(data.total_out)}</div></Card>
        <Card><div className="text-xs uppercase" style={{ color: 'var(--muted)' }}>Closing</div><div className="mt-1 text-xl font-bold" style={{ color: data.closing < 0 ? 'var(--red)' : 'var(--text)' }}>{formatPaisa(data.closing)}</div></Card>
      </div>
      <Table head={['Date', 'Ref', 'Description', 'In', 'Out', 'Balance']}>
        {data.rows.map((r, i) => (
          <tr key={i}>
            <td className="px-4 py-2">{r.date}</td>
            <td className="px-4 py-2 font-mono text-xs">{r.reference}</td>
            <td className="px-4 py-2">{r.description}</td>
            <td className="px-4 py-2 text-green-600">{r.in ? formatPaisa(r.in) : '—'}</td>
            <td className="px-4 py-2 text-red-600">{r.out ? formatPaisa(r.out) : '—'}</td>
            <td className="px-4 py-2 font-medium">{formatPaisa(r.balance)}</td>
          </tr>
        ))}
        {data.rows.length === 0 && (
          <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No transactions.</td></tr>
        )}
      </Table>
    </div>
  )
}
