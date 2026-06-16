import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Badge, PageHeader, Spinner, Table } from '../components/ui'

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
  const { data, isLoading } = useQuery({
    queryKey: ['audits'],
    queryFn: async () => (await api.get<{ data: Audit[] }>('/audits')).data,
  })

  if (isLoading || !data) return <Spinner />

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="Kisne kya change kiya — record" />
      <Table head={['Time', 'User', 'Action', 'Record', 'Changed fields']}>
        {data.data.map((a) => (
          <tr key={a.id}>
            <td className="px-4 py-2 text-xs">{new Date(a.created_at).toLocaleString()}</td>
            <td className="px-4 py-2">{a.user}</td>
            <td className="px-4 py-2"><Badge color={eventColor[a.event] ?? 'slate'}>{a.event}</Badge></td>
            <td className="px-4 py-2">{a.model}</td>
            <td className="px-4 py-2 text-xs" style={{ color: 'var(--muted)' }}>
              {Object.keys(a.new_values ?? {}).slice(0, 6).join(', ') || '—'}
            </td>
          </tr>
        ))}
        {data.data.length === 0 && (
          <tr><td colSpan={5} className="px-4 py-6 text-center" style={{ color: 'var(--muted)' }}>No logs.</td></tr>
        )}
      </Table>
    </div>
  )
}
