import { useState } from 'react'
import { useList } from '../lib/hooks'
import { Badge, type Column, DataTable, PageHeader } from '../components/ui'

interface Audit {
  id: number
  event: string
  model: string
  user: string
  old_values: Record<string, unknown>
  new_values: Record<string, unknown>
  created_at: string
}

const eventColor: Record<string, string> = { created: 'green', updated: 'amber', deleted: 'red' }

export default function AuditLogs() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('created_at')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const { data, isLoading } = useList<Audit>('audits', { page, search, sort, dir })

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }

  const columns: Column<Audit>[] = [
    { key: 'created_at', label: 'Time', sortable: true, render: (a) => <span className="text-xs">{new Date(a.created_at).toLocaleString()}</span> },
    { key: 'user', label: 'User', render: (a) => a.user },
    { key: 'event', label: 'Action', sortable: true, render: (a) => <Badge color={eventColor[a.event] ?? 'slate'}>{a.event}</Badge> },
    { key: 'auditable_type', label: 'Record', sortable: true, render: (a) => a.model },
    { key: 'fields', label: 'Changed fields', render: (a) => <span className="text-xs" style={{ color: 'var(--muted)' }}>{Object.keys(a.new_values ?? {}).slice(0, 6).join(', ') || '—'}</span> },
  ]

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="Kisne kya change kiya — record" />
      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading}
        emptyText="No logs."
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Action ya record se search…"
        sort={sort}
        dir={dir}
        onSort={onSort}
        meta={data?.meta}
        page={page}
        onPage={setPage}
      />
    </div>
  )
}
