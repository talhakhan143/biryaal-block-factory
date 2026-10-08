import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { Button, Card, Field, Input, MethodField, MoneyInput, Select } from '../components/ui'
import InvoiceSheet from '../components/InvoiceSheet'

interface Item {
  id: string
  name: string
  unit: string
  sale_price: number
  stock_qty: number
}
interface CartLine { item: Item; qty: number }

export default function ResellerPOS() {
  const items = useList<Item>('reseller/items', { per_page: 100, active_only: true })
  const customers = useList<{ id: string; name: string }>('customers', { per_page: 100 })
  const [cart, setCart] = useState<CartLine[]>([])
  const [customerId, setCustomerId] = useState('')
  const [discount, setDiscount] = useState('0')
  const [transport, setTransport] = useState('0')
  const [paid, setPaid] = useState('') // khali = poora (full)
  const [method, setMethod] = useState('cash')
  const [bankRef, setBankRef] = useState('')
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null)

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.item.sale_price * l.qty, 0), [cart])
  const goodsNet = Math.max(0, subtotal - Number(discount) * 100)
  const total = goodsNet + Number(transport) * 100
  // Paid: khali chhoro to poora paisa; kam likho to baqi udhaar (customer zaroori).
  const paidVal = paid.trim() === '' ? total : Math.min(Math.round(Number(paid) * 100), total)
  const balance = Math.max(0, total - paidVal)
  const isCredit = balance > 0

  const addToCart = (it: Item) => {
    setCart((c) => {
      const ex = c.find((l) => l.item.id === it.id)
      if (ex) return c.map((l) => (l.item.id === it.id ? { ...l, qty: l.qty + 1 } : l))
      return [...c, { item: it, qty: 1 }]
    })
  }
  const setQty = (id: string, qty: number) => setCart((c) => c.map((l) => (l.item.id === id ? { ...l, qty: Math.max(1, qty) } : l)))
  const removeLine = (id: string) => setCart((c) => c.filter((l) => l.item.id !== id))

  const sale = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/reseller/sales', payload),
    onSuccess: (res) => {
      setReceipt(res.data.data)
      setCart([]); setDiscount('0'); setTransport('0'); setPaid(''); setMethod('cash'); setBankRef(''); setCustomerId('')
      items.refetch()
    },
  })

  const checkout = () => {
    sale.mutate({
      customer_id: customerId || null,
      sale_date: new Date().toISOString().slice(0, 10),
      type: isCredit ? 'credit' : 'cash',
      discount: Number(discount),
      transport_fare: Number(transport),
      paid: isCredit ? paidVal / 100 : undefined, // rupees; backend paisa karega
      payment_method: paidVal > 0 ? method : undefined,
      bank_ref: method === 'bank' ? bankRef : undefined,
      items: cart.map((l) => ({ reseller_item_id: l.item.id, quantity: l.qty })),
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div>
        <h1 className="mb-1 text-xl font-bold" style={{ color: 'var(--text)' }}>Resellers Point, Farokht</h1>
        <p className="mb-4 text-sm" style={{ color: 'var(--muted)' }}>Item pe tap karke cart me dalein</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.data?.data.map((it) => (
            <button
              key={it.id}
              onClick={() => addToCart(it)}
              disabled={it.stock_qty <= 0}
              className="rounded-xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 disabled:opacity-50"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="font-semibold" style={{ color: 'var(--text)' }}>{it.name}</div>
              <div className="text-sm" style={{ color: 'var(--muted)' }}>{formatPaisa(it.sale_price)} / {it.unit}</div>
              <div className="mt-1 text-xs font-medium" style={{ color: it.stock_qty > 0 ? 'var(--green)' : 'var(--red)' }}>Stock: {it.stock_qty} {it.unit}</div>
            </button>
          ))}
        </div>
      </div>

      <Card className="h-fit">
        <h2 className="mb-3 font-bold" style={{ color: 'var(--text)' }}>Cart (Tokri)</h2>
        {cart.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Item pe tap karein.</p>
        ) : (
          <div className="space-y-2">
            {cart.map((l) => (
              <div key={l.item.id} className="flex items-center gap-2 text-sm">
                <div className="flex-1">
                  <div className="font-medium" style={{ color: 'var(--text)' }}>{l.item.name}</div>
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>{formatPaisa(l.item.sale_price)} / {l.item.unit}</div>
                </div>
                <Input type="number" value={l.qty} min={1} onChange={(e) => setQty(l.item.id, Number(e.target.value))} className="w-16" />
                <button onClick={() => removeLine(l.item.id)} className="text-red-500">✕</button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <Field label={isCredit ? 'Customer, zaroori (udhaar)' : 'Customer (optional)'}>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required={isCredit}>
              <option value="">{isCredit ? 'Select…' : 'Walk-in'}</option>
              {customers.data?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Discount (Rs)"><MoneyInput value={discount} onChange={setDiscount} /></Field>
          <Field label="Transport / kiraya (Rs)"><MoneyInput value={transport} onChange={setTransport} /></Field>
          {/* Paid now hamesha, khali = poora paisa; kam likho to baqi udhaar */}
          <Field label="Paid now (Rs), khali = poora">
            <MoneyInput value={paid} onChange={setPaid} placeholder={String(total / 100)} />
          </Field>
          {paidVal > 0 && (
            <MethodField method={method} bankRef={bankRef} onChange={(m, b) => { setMethod(m); setBankRef(b) }} />
          )}

          <div className="flex justify-between text-sm"><span>Subtotal</span><span>{formatPaisa(subtotal)}</span></div>
          {Number(transport) > 0 && <div className="flex justify-between text-sm"><span>Transport</span><span>{formatPaisa(Number(transport) * 100)}</span></div>}
          <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{formatPaisa(total)}</span></div>
          <div className="flex justify-between text-sm"><span>Paid now</span><span>{formatPaisa(paidVal)}</span></div>
          {balance > 0 && <div className="flex justify-between text-sm font-semibold"><span>Baqi (udhaar)</span><span style={{ color: 'var(--amber)' }}>{formatPaisa(balance)}</span></div>}

          {sale.error && <p className="text-sm text-red-600">{apiError(sale.error)}</p>}
          <Button onClick={checkout} disabled={cart.length === 0 || sale.isPending || (isCredit && !customerId)} className="w-full">
            {sale.isPending ? 'Processing…' : isCredit ? 'Complete (Udhaar)' : 'Complete Sale'}
          </Button>
        </div>
      </Card>

      {receipt && <Receipt sale={receipt} onClose={() => setReceipt(null)} />}
    </div>
  )
}

function Receipt({ sale, onClose }: { sale: Record<string, unknown>; onClose: () => void }) {
  const items = (sale.items as { item_name: string; quantity: number; unit: string; unit_price: number; line_total: number }[]) ?? []
  const cust = sale.customer as { name?: string } | undefined
  return (
    <InvoiceSheet
      subtitle="Resellers Point"
      docType="Sales Invoice"
      number={String(sale.invoice_no)}
      date={String(sale.sale_date ?? '')}
      customer={cust?.name ?? 'Walk-in'}
      meta={sale.payment_method ? `Paid via ${String(sale.payment_method).toUpperCase()}` : undefined}
      lines={items.map((it) => ({ name: it.item_name, qty: `${it.quantity} ${it.unit}`, rate: it.unit_price, total: it.line_total }))}
      totals={[
        { label: 'Subtotal', value: Number(sale.subtotal ?? 0) },
        ...(Number(sale.discount) > 0 ? [{ label: 'Discount', value: Number(sale.discount), sign: '−' }] : []),
        ...(Number(sale.transport_fare) > 0 ? [{ label: 'Transport', value: Number(sale.transport_fare) }] : []),
        { label: 'Total', value: Number(sale.total), strong: true },
        { label: 'Paid', value: Number(sale.paid) },
        { label: 'Balance', value: Number(sale.balance) },
      ]}
      onClose={onClose}
    />
  )
}
