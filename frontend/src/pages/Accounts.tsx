import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { formatPaisa } from '../lib/money'
import { Modal, PageHeader, PagedTable, Spinner } from '../components/ui'

interface TBRow { code: string; name: string; type: string; debit: number; credit: number; balance: number }
interface LedgerRow { date: string; reference: string; description: string; debit: number; credit: number }

export default function Accounts() {
  const [ledgerCode, setLedgerCode] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['trial-balance'],
    queryFn: async () => (await api.get<{ rows: TBRow[] }>('/accounting/trial-balance')).data,
  })

  if (isLoading || !data) return <Spinner />

  return (
    <div>
      <PageHeader title="Accounts" subtitle="Chart of accounts, kisi pe click kar ke poora ledger dekho" />
      <PagedTable
        head={['Code', 'Account', 'Type', { label: 'Balance', align: 'right' }, '']}
        rows={data.rows}
        searchText={(r) => `${r.code} ${r.name} ${r.type}`}
        searchPlaceholder="Code ya account ke naam se dhoondein…"
        emptyText="Koi account nahi."
        row={(r) => (
          <tr key={r.code} style={{ borderTop: '1px solid var(--border)' }}>
            <td className="px-4 py-3 font-mono text-xs">{r.code}</td>
            <td className="px-4 py-3 font-medium">{r.name}</td>
            <td className="px-4 py-3 capitalize" style={{ color: 'var(--muted)' }}>{r.type}</td>
            <td className="px-4 py-3 text-right">{formatPaisa(r.balance)}</td>
            <td className="px-4 py-3 text-right">
              <button className="text-sm hover:underline" style={{ color: 'var(--primary)' }} onClick={() => setLedgerCode(r.code)}>Ledger</button>
            </td>
          </tr>
        )}
      />
      {ledgerCode && <LedgerModal code={ledgerCode} onClose={() => setLedgerCode(null)} />}
    </div>
  )
}

function LedgerModal({ code, onClose }: { code: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['account-ledger', code],
    queryFn: async () => (await api.get<{ account: { code: string; name: string }; rows: LedgerRow[] }>(`/accounting/ledger/${code}`)).data,
  })
  return (
    <Modal title="Account Ledger" onClose={onClose}>
      {isLoading || !data ? <Spinner /> : (
        <div>
          <div className="mb-3 text-sm" style={{ color: 'var(--text)' }}>
            {data.account.code} · <strong>{data.account.name}</strong>
          </div>
          <PagedTable
            head={['Date', 'Ref', 'Description', { label: 'Debit', align: 'right' }, { label: 'Credit', align: 'right' }]}
            rows={data.rows}
            pageSize={10}
            searchText={(r) => `${r.date} ${r.reference} ${r.description}`}
            searchPlaceholder="Date, ref ya tafseel se dhoondein…"
            emptyText="Koi entry nahi."
            row={(r, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-4 py-2 text-xs">{r.date}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.reference}</td>
                <td className="px-4 py-2">{r.description}</td>
                <td className="px-4 py-2 text-right">{r.debit ? formatPaisa(r.debit) : '·'}</td>
                <td className="px-4 py-2 text-right">{r.credit ? formatPaisa(r.credit) : '·'}</td>
              </tr>
            )}
          />
        </div>
      )}
    </Modal>
  )
}
