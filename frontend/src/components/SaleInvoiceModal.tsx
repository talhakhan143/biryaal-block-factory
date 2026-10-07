import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Spinner } from './ui'
import InvoiceSheet from './InvoiceSheet'

interface SaleDetail {
  invoice_no: string
  sale_date: string
  type: string
  payment_method?: string | null
  bank_ref?: string | null
  customer?: { name: string } | null
  subtotal: number
  discount: number
  transport_fare: number
  total: number
  paid: number
  balance: number
  items?: { product_name?: string; item_name?: string; unit?: string; quantity: number; unit_price: number; line_total: number }[]
}

/**
 * Printable invoice for one sale, fetched fresh so the totals are never stale.
 * Shared by the Sales list, the Resellers Point sales list and the customer
 * history page, so the same bill looks identical wherever it is opened from.
 */
export default function SaleInvoiceModal({ id, source = 'factory', onClose }: { id: string; source?: 'factory' | 'reseller'; onClose: () => void }) {
  const path = source === 'reseller' ? `/reseller/sales/${id}` : `/sales/${id}`
  const { data, isLoading } = useQuery({
    queryKey: [source === 'reseller' ? 'reseller/sales' : 'sale', id],
    queryFn: async () => (await api.get<{ data: SaleDetail }>(path)).data.data,
  })

  if (isLoading || !data) {
    return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}><Spinner /></div>
  }

  const paidVia = data.payment_method
    ? `Paid via ${String(data.payment_method).toUpperCase()}${data.bank_ref ? ` (${data.bank_ref})` : ''}`
    : String(data.type).toUpperCase()

  return (
    <InvoiceSheet
      subtitle={source === 'reseller' ? 'Resellers Point' : undefined}
      docType="Sales Invoice"
      number={String(data.invoice_no)}
      date={data.sale_date}
      customer={data.customer?.name ?? 'Walk-in'}
      meta={paidVia}
      lines={(data.items ?? []).map((it) => ({
        name: it.product_name ?? it.item_name ?? 'Item',
        qty: it.unit ? `${it.quantity} ${it.unit}` : String(it.quantity),
        rate: it.unit_price,
        total: it.line_total,
      }))}
      totals={[
        { label: 'Subtotal', value: Number(data.subtotal) },
        ...(Number(data.discount) > 0 ? [{ label: 'Discount', value: Number(data.discount), sign: '−' }] : []),
        ...(Number(data.transport_fare) > 0 ? [{ label: 'Transport (kiraya)', value: Number(data.transport_fare) }] : []),
        { label: 'Total', value: Number(data.total), strong: true },
        { label: 'Paid', value: Number(data.paid) },
        { label: 'Balance', value: Number(data.balance) },
      ]}
      onClose={onClose}
    />
  )
}
