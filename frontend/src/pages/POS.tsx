import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { Button, Card, Field, Input, MethodField, MoneyInput, OutstandingNote, Select } from '../components/ui'

interface Product {
  id: string
  name: string
  sale_price: number
  stock?: { ready_qty: number }
}
interface CartLine {
  product: Product
  qty: number
}

export default function POS() {
  const products = useList<Product>('products', { per_page: 100, active_only: true })
  const customers = useList<{ id: string; name: string; balance: number }>('customers', { per_page: 100 })
  const [cart, setCart] = useState<CartLine[]>([])
  const [type, setType] = useState<'cash' | 'credit'>('cash')
  const [customerId, setCustomerId] = useState('')
  const [discount, setDiscount] = useState('0')
  const [paid, setPaid] = useState('0')
  const [method, setMethod] = useState('cash')
  const [bankRef, setBankRef] = useState('')
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null)

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.product.sale_price * l.qty, 0), [cart])
  const total = Math.max(0, subtotal - Number(discount) * 100)

  const addToCart = (p: Product) => {
    setCart((c) => {
      const existing = c.find((l) => l.product.id === p.id)
      if (existing) return c.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l))
      return [...c, { product: p, qty: 1 }]
    })
  }
  const setQty = (id: string, qty: number) =>
    setCart((c) => c.map((l) => (l.product.id === id ? { ...l, qty: Math.max(1, qty) } : l)))
  const removeLine = (id: string) => setCart((c) => c.filter((l) => l.product.id !== id))

  const sale = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/sales', payload),
    onSuccess: (res) => {
      setReceipt(res.data.data)
      setCart([])
      setDiscount('0')
      setPaid('0')
      setMethod('cash')
      setBankRef('')
      setCustomerId('')
      products.refetch()
    },
  })

  const checkout = () => {
    sale.mutate({
      customer_id: customerId || null,
      sale_date: new Date().toISOString().slice(0, 10),
      type,
      discount: Number(discount),
      paid: type === 'credit' ? Number(paid) : undefined,
      payment_method: method,
      bank_ref: method === 'bank' ? bankRef : undefined,
      items: cart.map((l) => ({ product_id: l.product.id, quantity: l.qty })),
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* Product grid */}
      <div>
        <h1 className="mb-1 text-xl font-bold" style={{ color: 'var(--text)' }}>New Sale (Nayi Bikri)</h1>
        <p className="mb-4 text-sm" style={{ color: 'var(--muted)' }}>Product pe tap karke cart me dalein</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {products.data?.data.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              className="rounded-xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="font-semibold" style={{ color: 'var(--text)' }}>{p.name}</div>
              <div className="text-sm" style={{ color: 'var(--muted)' }}>{formatPaisa(p.sale_price)}</div>
              <div className="mt-1 text-xs font-medium" style={{ color: 'var(--green)' }}>Ready: {p.stock?.ready_qty ?? 0}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Cart */}
      <Card className="h-fit">
        <h2 className="mb-3 font-bold" style={{ color: 'var(--text)' }}>Cart (Tokri)</h2>
        {cart.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Product pe tap karein.</p>
        ) : (
          <div className="space-y-2">
            {cart.map((l) => (
              <div key={l.product.id} className="flex items-center gap-2 text-sm">
                <div className="flex-1">
                  <div className="font-medium" style={{ color: 'var(--text)' }}>{l.product.name}</div>
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>{formatPaisa(l.product.sale_price)}</div>
                </div>
                <Input
                  type="number"
                  value={l.qty}
                  min={1}
                  onChange={(e) => setQty(l.product.id, Number(e.target.value))}
                  className="w-16"
                />
                <button onClick={() => removeLine(l.product.id)} className="text-red-500">✕</button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <Field label="Sale type (bikri ki qism)">
            <Select value={type} onChange={(e) => setType(e.target.value as 'cash' | 'credit')}>
              <option value="cash">Cash — abhi poora paisa</option>
              <option value="credit">Credit — udhaar / baad me</option>
            </Select>
          </Field>

          {/* Customer: cash me optional (walk-in), credit me zaroori */}
          <Field label={type === 'credit' ? 'Customer (Grahak) — zaroori' : 'Customer (Grahak) — optional'}>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required={type === 'credit'}>
              <option value="">{type === 'credit' ? 'Select…' : 'Walk-in (bina naam)'}</option>
              {customers.data?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          {customerId && (
            <OutstandingNote
              label="Pichla baqi (previous due)"
              amount={customers.data?.data.find((c) => c.id === customerId)?.balance ?? 0}
            />
          )}
          {type === 'credit' && (
            <Field label="Paid now (Rs) — abhi kitna diya">
              <MoneyInput value={paid} onChange={setPaid} />
            </Field>
          )}
          <Field label="Discount (Rs)">
            <MoneyInput value={discount} onChange={setDiscount} />
          </Field>

          {(type === 'cash' || Number(paid) > 0) && (
            <MethodField method={method} bankRef={bankRef} onChange={(m, b) => { setMethod(m); setBankRef(b) }} />
          )}

          <div className="flex justify-between text-sm"><span>Subtotal</span><span>{formatPaisa(subtotal)}</span></div>
          <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{formatPaisa(total)}</span></div>

          {sale.error && <p className="text-sm text-red-600">{apiError(sale.error)}</p>}
          <Button
            onClick={checkout}
            disabled={cart.length === 0 || sale.isPending || (type === 'credit' && !customerId)}
            className="w-full"
          >
            {sale.isPending ? 'Processing…' : 'Complete Sale'}
          </Button>
        </div>
      </Card>

      {receipt && <Receipt sale={receipt} onClose={() => setReceipt(null)} />}
    </div>
  )
}

function Receipt({ sale, onClose }: { sale: Record<string, unknown>; onClose: () => void }) {
  const items = (sale.items as { product_name: string; quantity: number; unit_price: number; line_total: number }[]) ?? []
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-6 text-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="text-center">
          <h2 className="text-lg font-bold">Biryaal Block Factory</h2>
          <p className="text-xs text-slate-500">Sales Receipt</p>
          <p className="mt-1 font-mono text-sm">{String(sale.invoice_no)}</p>
        </div>
        <div className="my-4 border-y border-dashed border-slate-300 py-3 text-sm">
          {items.map((it, i) => (
            <div key={i} className="flex justify-between">
              <span>{it.product_name} × {it.quantity}</span>
              <span>{formatPaisa(it.line_total)}</span>
            </div>
          ))}
        </div>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between font-bold"><span>Total</span><span>{formatPaisa(Number(sale.total))}</span></div>
          <div className="flex justify-between"><span>Paid</span><span>{formatPaisa(Number(sale.paid))}</span></div>
          <div className="flex justify-between"><span>Balance</span><span>{formatPaisa(Number(sale.balance))}</span></div>
        </div>
        <div className="no-print mt-5 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Close</Button>
          <Button className="flex-1" onClick={() => window.print()}>Print</Button>
        </div>
      </div>
    </div>
  )
}
