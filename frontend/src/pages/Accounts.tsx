import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { formatPaisa } from '../lib/money'
import { Card, Modal, PageHeader, Spinner, Table } from '../components/ui'

interface TBRow { code: string; name: string; type: string; debit: number; credit: number; balance: number }

export default function Accounts() {
  const [ledgerCode, setLedgerCode] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['trial-balance'],
    queryFn: async () => (await api.get<{ rows: TBRow[] }>('/accounting/trial-balance')).data,
  })

  if (isLoading || !data) return <Spinner />

  return (
    <div>
      <PageHeader title="Accounts" subtitle="Chart of accounts — kisi pe click kar ke poora ledger dekho" />
      <Table head={['Code', 'Account', 'Type', 'Balance', '']}>
        {data.rows.map((r) => (
          <tr key={r.code}>
            <td className="px-4 py-3 font-mono text-xs">{r.code}</td>
            <td className="px-4 py-3 font-medium">{r.name}</td>
            <td className="px-4 py-3 capitalize" style={{ color: 'var(--muted)' }}>{r.type}</td>
            <td className="px-4 py-3">{formatPaisa(r.balance)}</td>
            <td className="px-4 py-3 text-right">
              <button className="text-sm hover:underline" style={{ color: 'var(--primary)' }} onClick={() => setLedgerCode(r.code)}>Ledger</button>
            </td>
          </tr>
        ))}
      </Table>
      {ledgerCode && <LedgerModal code={ledgerCode} onClose={() => setLedgerCode(null)} />}
    </div>
  )
}

function LedgerModal({ code, onClose }: { code: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['account-ledger', code],
    queryFn: async () => (await api.get(`/accounting/ledger/${code}`)).data,
  })
  return (
    <Modal title="Account Ledger" onClose={onClose}>
      {isLoading || !data ? <Spinner /> : (
        <div>
          <div className="mb-3 text-sm" style={{ color: 'var(--text)' }}>
            {data.account.code} — <strong>{data.account.name}</strong>
          </div>
          <Card className="max-h-96 overflow-y-auto !p-0">
            <Table head={['Date', 'Ref', 'Description', 'Debit', 'Credit']}>
              {data.rows.map((r: Record<string, string | number>, i: number) => (
                <tr key={i}>
                  <td className="px-4 py-2 text-xs">{r.date}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.reference}</td>
                  <td className="px-4 py-2">{r.description}</td>
                  <td className="px-4 py-2">{r.debit ? formatPaisa(Number(r.debit)) : '—'}</td>
                  <td className="px-4 py-2">{r.credit ? formatPaisa(Number(r.credit)) : '—'}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center" style={{ color: 'var(--muted)' }}>No entries.</td></tr>
              )}
            </Table>
          </Card>
        </div>
      )}
    </Modal>
  )
}
