import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { formatPaisa } from '../lib/money'
import { Badge, Card, PageHeader, PagedTable, Spinner } from '../components/ui'

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

  const data = tb.data

  return (
    <div>
      <PageHeader
        title="Trial Balance"
        subtitle="Accounts ki summary, sab barabar hona chahiye"
        actions={data.balanced ? <Badge color="green">Balanced</Badge> : <Badge color="red">Out of balance!</Badge>}
      />

      {pl.data && (
        <div className="mb-4 grid grid-cols-3 gap-4">
          <Card><div className="text-xs uppercase text-slate-500">Income</div><div className="mt-1 text-xl font-bold text-green-600">{formatPaisa(pl.data.income)}</div></Card>
          <Card><div className="text-xs uppercase text-slate-500">Expense</div><div className="mt-1 text-xl font-bold text-red-600">{formatPaisa(pl.data.expense)}</div></Card>
          <Card><div className="text-xs uppercase" style={{ color: 'var(--muted)' }}>Profit (Munafa)</div><div className="mt-1 text-xl font-bold" style={{ color: pl.data.profit < 0 ? 'var(--red)' : 'var(--text)' }}>{formatPaisa(pl.data.profit)}</div></Card>
        </div>
      )}

      <PagedTable
        head={['Code', 'Account', 'Type', { label: 'Debit', align: 'right' }, { label: 'Credit', align: 'right' }]}
        rows={data.rows}
        searchText={(r) => `${r.code} ${r.name} ${r.type}`}
        searchPlaceholder="Code ya account ke naam se dhoondein…"
        emptyText="Koi account nahi."
        // Jor poore khate ka hai, is liye search ya page badalne par badalta nahi.
        footer={(
          <tr className="font-bold" style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
            <td className="px-4 py-2.5" colSpan={3}>Total (saare accounts)</td>
            <td className="px-4 py-2.5 text-right">{formatPaisa(data.total_debit)}</td>
            <td className="px-4 py-2.5 text-right">{formatPaisa(data.total_credit)}</td>
          </tr>
        )}
        row={(r) => (
          <tr key={r.code} style={{ borderTop: '1px solid var(--border)' }}>
            <td className="px-4 py-2 font-mono text-xs">{r.code}</td>
            <td className="px-4 py-2 font-medium">{r.name}</td>
            <td className="px-4 py-2 capitalize" style={{ color: 'var(--muted)' }}>{r.type}</td>
            <td className="px-4 py-2 text-right">{r.debit ? formatPaisa(r.debit) : '·'}</td>
            <td className="px-4 py-2 text-right">{r.credit ? formatPaisa(r.credit) : '·'}</td>
          </tr>
        )}
      />
    </div>
  )
}
