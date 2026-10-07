import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { formatPaisa } from '../lib/money'
import { Card, type Column, DataTable, PageHeader } from '../components/ui'

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
  shown_in: number
  shown_out: number
  rows: CashRow[]
  meta?: { current_page: number; last_page: number; total: number }
  /**
   * Search lagte hi balance sirf milne wali entries ka jor reh jata hai, poore
   * khate ka nahi. Aise waqt me usay balance keh kar dikhana jhoot hoga.
   */
  running_balance_exact: boolean
}

export default function CashBook() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['cash-book', { search, page }],
    queryFn: async () => (await api.get<CashBookData>('/cash-book', { params: { search, page } })).data,
  })

  const exact = data?.running_balance_exact ?? true

  const columns: Column<CashRow>[] = [
    { key: 'date', label: 'Date', render: (r) => r.date },
    { key: 'reference', label: 'Ref', render: (r) => <span className="font-mono text-xs">{r.reference}</span> },
    { key: 'description', label: 'Description', render: (r) => r.description },
    { key: 'in', label: 'In', align: 'right', render: (r) => r.in ? <span style={{ color: 'var(--green)' }}>{formatPaisa(r.in)}</span> : '·' },
    { key: 'out', label: 'Out', align: 'right', render: (r) => r.out ? <span style={{ color: 'var(--red)' }}>{formatPaisa(r.out)}</span> : '·' },
    { key: 'balance', label: 'Balance', align: 'right', render: (r) => exact ? <span className="font-medium">{formatPaisa(r.balance)}</span> : '·' },
  ]

  return (
    <div>
      <PageHeader title="Cash Book" subtitle="Rozana cash aana jana, running balance ke saath" />
      {data && (
        // Search lagi ho to ye jor sirf milne wali entries ka hota hai, is liye
        // Closing hamesha poore khate ka hai, search se nahi badalta.
        // In/Out search ke waqt sirf dikhne wali rows ka jorh dikhate hain.
        <div className={`mb-4 grid gap-4 ${exact ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <Card><div className="text-xs uppercase text-slate-500">{exact ? 'Total In' : 'Jo mila, us me aaya'}</div><div className="mt-1 text-xl font-bold text-green-600">{formatPaisa(exact ? data.total_in : data.shown_in)}</div></Card>
          <Card><div className="text-xs uppercase text-slate-500">{exact ? 'Total Out' : 'Jo mila, us me gaya'}</div><div className="mt-1 text-xl font-bold text-red-600">{formatPaisa(exact ? data.total_out : data.shown_out)}</div></Card>
          <Card><div className="text-xs uppercase" style={{ color: 'var(--muted)' }}>Closing</div><div className="mt-1 text-xl font-bold" style={{ color: data.closing < 0 ? 'var(--red)' : 'var(--text)' }}>{formatPaisa(data.closing)}</div></Card>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={data?.rows}
        loading={isLoading}
        emptyText="Koi lain-den nahi."
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Ref ya tafseel se dhoondein…"
        meta={data?.meta}
        page={page}
        onPage={setPage}
      />
      {!exact && (
        <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
          Dhoondte waqt balance ka khana khali rehta hai, kyunki wo sirf milne wali entries ka jor hota, poore khate ka nahi. Search khali karein to chalta balance wapas aa jayega.
        </p>
      )}
    </div>
  )
}
