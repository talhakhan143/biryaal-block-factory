import { useState } from 'react'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { Badge, PageHeader, Pagination, Spinner, Table } from '../components/ui'

interface Trip {
  id: string
  reference: string
  vehicle_label?: string
  driver?: { name: string }
  trip_date: string
  rate: number
  paid: number
  balance: number
  status: string
}

const statusColor: Record<string, string> = { paid: 'green', partial: 'amber', unpaid: 'red' }

export default function Transport() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useList<Trip>('transport-trips', { page })

  return (
    <div>
      <PageHeader title="Transport Trips" subtitle="Trips dispatch se khud-ba-khud bante hain · driver dues Drivers page se pay karein" />
      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Ref', 'Date', 'Vehicle', 'Driver', 'Rate', 'Paid', 'Balance', 'Status']}>
          {data?.data.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-3 font-mono text-xs">{t.reference}</td>
              <td className="px-4 py-3">{t.trip_date}</td>
              <td className="px-4 py-3">{t.vehicle_label ?? '—'}</td>
              <td className="px-4 py-3">{t.driver?.name ?? '—'}</td>
              <td className="px-4 py-3">{formatPaisa(t.rate)}</td>
              <td className="px-4 py-3">{formatPaisa(t.paid)}</td>
              <td className="px-4 py-3">{formatPaisa(t.balance)}</td>
              <td className="px-4 py-3"><Badge color={statusColor[t.status]}>{t.status}</Badge></td>
            </tr>
          ))}
          {data?.data.length === 0 && (
            <tr><td colSpan={8} className="px-4 py-6 text-center" style={{ color: 'var(--muted)' }}>Koi trip nahi — dispatch pe kiraya daalo to yahan aayega.</td></tr>
          )}
        </Table>
      )}
      <Pagination meta={data?.meta} page={page} onPage={setPage} />
    </div>
  )
}
