import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { formatPaisa } from '../lib/money'
import { Badge, Card, PageHeader, Spinner, Table } from '../components/ui'

interface TBRow {
  code: string
  name: string
  type: string
  debit: number
  credit: number
  balance: number
}
interface TBData {
  rows: TBRow[]
  total_debit: number
  total_credit: number
  balanced: boolean
}

export default function TrialBalance() {
  const tb = useQuery({
    queryKey: ['trial-balance'],
    queryFn: async () => (await api.get<TBData>('/accounting/trial-balance')).data,
  })
  const pl = useQuery({
    queryKey: ['profit-loss'],
    queryFn: async () => (await api.get<{ income: number; expense: number; profit: number }>('/accounting/profit-loss')).data,
  })

  if (tb.isLoading || !tb.data) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Trial Balance"
        subtitle="Accounts ki summary — sab barabar hona chahiye"
        actions={tb.data.balanced ? <Badge color="green">Balanced</Badge> : <Badge color="red">Out of balance!</Badge>}
      />

      {pl.data && (
        <div className="mb-4 grid grid-cols-3 gap-4">
          <Card><div className="text-xs uppercase text-slate-500">Income</div><div className="mt-1 text-xl font-bold text-green-600">{formatPaisa(pl.data.income)}</div></Card>
          <Card><div className="text-xs uppercase text-slate-500">Expense</div><div className="mt-1 text-xl font-bold text-red-600">{formatPaisa(pl.data.expense)}</div></Card>
          <Card><div className="text-xs uppercase" style={{ color: 'var(--muted)' }}>Profit (Munafa)</div><div className="mt-1 text-xl font-bold" style={{ color: pl.data.profit < 0 ? 'var(--red)' : 'var(--text)' }}>{formatPaisa(pl.data.profit)}</div></Card>
        </div>
      )}

      <Table head={['Code', 'Account', 'Type', 'Debit', 'Credit']}>
        {tb.data.rows.map((r) => (
          <tr key={r.code}>
            <td className="px-4 py-2 font-mono text-xs">{r.code}</td>
            <td className="px-4 py-2 font-medium">{r.name}</td>
            <td className="px-4 py-2 capitalize text-slate-500">{r.type}</td>
            <td className="px-4 py-2">{r.debit ? formatPaisa(r.debit) : '—'}</td>
            <td className="px-4 py-2">{r.credit ? formatPaisa(r.credit) : '—'}</td>
          </tr>
        ))}
        <tr className="border-t-2 border-slate-300 font-bold">
          <td className="px-4 py-2" colSpan={3}>Total</td>
          <td className="px-4 py-2">{formatPaisa(tb.data.total_debit)}</td>
          <td className="px-4 py-2">{formatPaisa(tb.data.total_credit)}</td>
        </tr>
      </Table>
    </div>
  )
}
