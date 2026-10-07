import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { api } from '../lib/api'
import { formatPaisa } from '../lib/money'
import { Badge, type Column, DataTable, IconButton, Note, PageHeader, RowActions, StatTile } from '../components/ui'

interface ResellerCustomer {
  id: string
  name: string
  phone?: string
  invoices: number
  sale_due: number
  kiraya_due: number
  received: number
  outstanding: number
}

/**
 * Resellers Point ki apni customer list. Naam aur phone block factory wali
 * list se hi aate hain, magar har figure sirf is portal ka hai.
 */
export default function ResellerCustomers() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['reseller/customers', { search }],
    queryFn: async () => (await api.get<{ data: ResellerCustomer[] }>('/reseller/customers', { params: { search: search || undefined } })).data.data,
  })

  const rows = data ?? []
  const totals = useMemo(() => ({
    due: rows.reduce((a, r) => a + r.outstanding, 0),
    kiraya: rows.reduce((a, r) => a + r.kiraya_due, 0),
    received: rows.reduce((a, r) => a + r.received, 0),
    owing: rows.filter((r) => r.outstanding > 0).length,
  }), [rows])

  const columns: Column<ResellerCustomer>[] = [
    { key: 'name', label: 'Naam', render: (c) => <span className="font-medium">{c.name}</span> },
    { key: 'phone', label: 'Phone', render: (c) => c.phone ?? '·' },
    { key: 'invoices', label: 'Bill', align: 'right', render: (c) => c.invoices },
    { key: 'sale_due', label: 'Maal ka baqi', align: 'right', render: (c) => (c.sale_due > 0 ? formatPaisa(c.sale_due) : '·') },
    { key: 'kiraya_due', label: 'Kiraya ka baqi', align: 'right', render: (c) => (c.kiraya_due > 0 ? formatPaisa(c.kiraya_due) : '·') },
    {
      key: 'outstanding', label: 'Kul lena hai', align: 'right',
      render: (c) => (c.outstanding > 0 ? <Badge color="amber">{formatPaisa(c.outstanding)}</Badge> : <Badge color="green">Saaf</Badge>),
    },
    {
      key: 'actions', label: '', align: 'right',
      render: (c) => (
        <div onClick={(e) => e.stopPropagation()}>
          <RowActions>
            <IconButton icon={ArrowRight} label="Poori history" tone="primary" onClick={() => navigate(`/reseller/customers/${c.id}`)} />
          </RowActions>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title="Customers" subtitle="Resellers Point. Kisi bhi naam par click karein, uski poori history khul jayegi" />

      <div className="mb-3">
        <Note>Yahan ke saare figures sirf Resellers Point ke hain. Block factory ka hisaab is me shaamil nahi.</Note>
      </div>

      <div className="bf-stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Kul lena hai" value={formatPaisa(totals.due)} hint={`${totals.owing} customers se`} tone={totals.due > 0 ? 'red' : 'green'} />
        <StatTile label="Is me kiraya" value={formatPaisa(totals.kiraya)} hint="Rental ka baqi" tone="amber" />
        <StatTile label="Ab tak paisa mila" value={formatPaisa(totals.received)} tone="green" />
        <StatTile label="Customers" value={String(rows.length)} hint="Jinhon ne yahan se kuch liya" tone="primary" />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        emptyText="Resellers Point par abhi kisi customer ka kaam nahi hua."
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Naam ya phone se dhoondein…"
        page={page}
        onPage={setPage}
        onRowClick={(c) => navigate(`/reseller/customers/${c.id}`)}
      />
    </div>
  )
}
