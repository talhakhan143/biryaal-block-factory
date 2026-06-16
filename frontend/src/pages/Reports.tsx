import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { formatPaisa } from '../lib/money'
import { Button, Card, Field, Input, PageHeader, Select, Spinner } from '../components/ui'

interface Column { key: string; label: string; money?: boolean; align?: string }
interface Summary { label: string; value: number | string; money?: boolean }
interface Report {
  title: string
  period: string
  columns: Column[]
  rows: Record<string, string | number>[]
  summary: Summary[]
}

const TYPES = [
  { key: 'sales', label: 'Sales (Bikri)' },
  { key: 'production', label: 'Production (Block banae)' },
  { key: 'expenses', label: 'Expenses (Kharchay)' },
  { key: 'inventory', label: 'Inventory (Stock)' },
  { key: 'labour', label: 'Labour (Mazdoori)' },
  { key: 'profit-loss', label: 'Profit & Loss (Munafa)' },
]

export default function Reports() {
  const today = new Date().toISOString().slice(0, 10)
  const monthStart = today.slice(0, 8) + '01'
  const [type, setType] = useState('sales')
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(today)
  const [downloading, setDownloading] = useState('')

  const params = type === 'inventory' ? {} : { from, to }
  const { data, isLoading } = useQuery({
    queryKey: ['report', type, params],
    queryFn: async () => (await api.get<Report>(`/reports/${type}`, { params })).data,
  })

  const download = async (format: 'pdf' | 'excel') => {
    setDownloading(format)
    try {
      const res = await api.get(`/reports/${type}/${format}`, { params, responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report-${type}-${today}.${format === 'pdf' ? 'pdf' : 'xlsx'}`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading('')
    }
  }

  const cell = (col: Column, row: Record<string, string | number>) => {
    const v = row[col.key]
    if (col.money && typeof v === 'number') return formatPaisa(v)
    return v ?? '—'
  }

  return (
    <div>
      <PageHeader title="Reports" subtitle="Report dekho aur PDF / Excel download karo" />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48">
            <Field label="Report">
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </Select>
            </Field>
          </div>
          {type !== 'inventory' && (
            <>
              <Field label="From (se)"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="To (tak)"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            </>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={() => download('excel')} disabled={!!downloading}>
              {downloading === 'excel' ? '…' : 'Excel'}
            </Button>
            <Button variant="secondary" onClick={() => download('pdf')} disabled={!!downloading}>
              {downloading === 'pdf' ? '…' : 'PDF'}
            </Button>
          </div>
        </div>
      </Card>

      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{data.title}</h2>
            <span className="text-sm" style={{ color: 'var(--muted)' }}>{data.period}</span>
          </div>
          <div className="overflow-x-auto rounded-xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide" style={{ background: 'var(--surface-2)', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                  {data.columns.map((col) => (
                    <th key={col.key} className={`px-4 py-3 font-semibold ${col.align === 'right' ? 'text-right' : 'text-left'}`}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ color: 'var(--text)' }}>
                {data.rows.map((row, i) => (
                  <tr key={i}>
                    {data.columns.map((col) => (
                      <td key={col.key} className={`px-4 py-2 ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                        {cell(col, row)}
                      </td>
                    ))}
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr><td colSpan={data.columns.length} className="px-4 py-6 text-center" style={{ color: 'var(--muted)' }}>No data.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {data.summary.length > 0 && (
            <div className="mt-4 flex justify-end">
              <Card className="w-full max-w-sm">
                {data.summary.map((s, i) => (
                  <div key={i} className="flex justify-between py-1 text-sm">
                    <span style={{ color: 'var(--muted)' }}>{s.label}</span>
                    <span className="font-bold" style={{ color: 'var(--text)' }}>
                      {s.money && typeof s.value === 'number' ? formatPaisa(s.value) : s.value}
                    </span>
                  </div>
                ))}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
