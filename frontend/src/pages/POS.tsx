import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus, Wallet } from 'lucide-react'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { Button, Card, Field, Input, MethodField, Modal, MoneyInput, Note, OutstandingNote, Select } from '../components/ui'
import CustomerForm, { type CustomerPayload } from '../components/CustomerForm'
import InvoiceSheet from '../components/InvoiceSheet'
import { PaymentReceipt, type PaymentDoc } from '../components/receipts'
import { MONEY_KEYS } from '../lib/queryKeys'

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
  const qc = useQueryClient()
  const products = useList<Product>('products', { per_page: 100, active_only: true })
  const customers = useList<{ id: string; name: string; balance: number; advance: number }>('customers', { per_page: 100 })
  const [cart, setCart] = useState<CartLine[]>([])
  const [customerId, setCustomerId] = useState('')
  const [discount, setDiscount] = useState('0')
  const [transport, setTransport] = useState('0')
  const [paid, setPaid] = useState('') // khali = poora (full)
  const [method, setMethod] = useState('cash')
  const [bankRef, setBankRef] = useState('')
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null)
  const [addingCustomer, setAddingCustomer] = useState(false)
  const [takingAdvance, setTakingAdvance] = useState(false)
  // Advance ki parchi wahi shared rasid hai jo baqi har page par chalti hai,
  // taake customer ke haath me har jagah aik jaisa kaghaz jaye.
  const [advanceSlip, setAdvanceSlip] = useState<{ payment: PaymentDoc; name: string; held: number } | null>(null)

  // MoneyInput akela "." ya "-" bhi rehne deta hai, aur Number('.') NaN hai.
  // Bina guard ke poora bill NaN ban jata tha aur "Rs NaN" dikhane ke bawajood
  // Complete button chalta tha, jo poore rate par asli sale bana deta tha.
  const rsToPaisa = (v: string) => {
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
  }
  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.product.sale_price * l.qty, 0), [cart])
  const totalQty = useMemo(() => cart.reduce((s, l) => s + l.qty, 0), [cart])

  // Discount per BLOCK likha jata hai, kul rakam nahi. Owner is tarah sochta
  // hai: "is bande ko ek rupya block chhoot de do". 100 block par 1 likho to
  // discount Rs 100 banta hai. Bill par dono cheezein nazar aati hain taake
  // koi shak na rahe.
  const discountRateP = rsToPaisa(discount)
  const discountP = discountRateP === null ? null : discountRateP * totalQty
  const transportP = rsToPaisa(transport)
  const badDiscount = discountP === null
  const badTransport = transportP === null
  const overDiscount = discountP !== null && discountP > subtotal
  const goodsNet = Math.max(0, subtotal - (discountP ?? 0))
  const total = goodsNet + (transportP ?? 0)
  const selected = customers.data?.data.find((c) => c.id === customerId)
  // Jo advance pehle se jama hai.
  const advanceHeld = selected?.advance ?? 0

  // Paid now khali chhodne ka matlab:
  //   advance pada hai  -> kuch cash nahi liya, bill advance me se katega
  //   advance nahi hai  -> poora paisa mauqe par mil gaya (cash sale)
  // Warna jo likha hai wahi cash hai.
  const paidEntered = paid.trim() === '' ? null : rsToPaisa(paid)
  const badPaid = paid.trim() !== '' && paidEntered === null
  const paidVal = paidEntered === null
    ? (advanceHeld > 0 ? 0 : total)
    : Math.min(paidEntered, total)
  const balance = Math.max(0, total - paidVal)
  const isCredit = balance > 0
  // Backend bhi yehi karta hai: pehle cash, phir advance, phir udhaar.
  const advanceUse = isCredit ? Math.min(advanceHeld, balance) : 0
  const afterAdvance = balance - advanceUse

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

  const newCustomer = useMutation({
    mutationFn: async (payload: CustomerPayload) => (await api.post('/customers', payload)).data,
    onSuccess: async (res) => {
      await customers.refetch()
      setCustomerId(res.data.id) // seedha select ho jaye, dobara dhoondna na pare
      setAddingCustomer(false)
    },
  })

  const advance = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post(`/customers/${customerId}/advance`, payload)).data,
    onSuccess: (res) => {
      MONEY_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      customers.refetch()
      setAdvanceSlip({ payment: res.data, name: res.customer.name, held: res.customer.advance })
      setTakingAdvance(false)
    },
  })

  const sale = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/sales', payload),
    onSuccess: (res) => {
      setReceipt(res.data.data)
      setCart([])
      setDiscount('0')
      setTransport('0')
      setPaid('')
      setMethod('cash')
      setBankRef('')
      setCustomerId('')
      // Advance aur stock dono abhi badle hain, refresh ke bina sahi dikhein.
      MONEY_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      products.refetch()
      customers.refetch()
    },
  })

  const blocked = badDiscount || badTransport || badPaid || overDiscount || total <= 0
  const blockedWhy = badDiscount ? 'Discount theek nahi likha.'
    : badTransport ? 'Transport theek nahi likha.'
    : badPaid ? '"Paid now" theek nahi likha.'
    : overDiscount ? 'Discount bill se zyada hai.'
    : cart.length > 0 && total <= 0 ? 'Bill sifar ka hai, sale nahi ban sakti.'
    : ''

  const checkout = () => {
    if (blocked) return
    sale.mutate({
      customer_id: customerId || null,
      sale_date: new Date().toISOString().slice(0, 10),
      type: isCredit ? 'credit' : 'cash',
      discount: (discountP ?? 0) / 100,
      transport_fare: (transportP ?? 0) / 100,
      paid: isCredit ? paidVal / 100 : undefined, // rupees; backend paisa karega
      payment_method: paidVal > 0 ? method : undefined,
      bank_ref: method === 'bank' ? bankRef : undefined,
      items: cart.map((l) => ({ product_id: l.product.id, quantity: l.qty })),
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* Product grid */}
      <div>
        <h1 className="mb-1 text-xl font-bold" style={{ color: 'var(--text)' }}>New Sale (Nayi Farokht)</h1>
        <p className="mb-4 text-sm" style={{ color: 'var(--muted)' }}>Product pe tap karke cart me dalein</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {products.data?.data.map((p) => {
            const ready = p.stock?.ready_qty ?? 0
            return (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                disabled={ready <= 0}
                className="rounded-xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <div className="font-semibold" style={{ color: 'var(--text)' }}>{p.name}</div>
                <div className="text-sm" style={{ color: 'var(--muted)' }}>{formatPaisa(p.sale_price)}</div>
                <div className="mt-1 text-xs font-medium" style={{ color: ready > 0 ? 'var(--green)' : 'var(--red)' }}>Ready: {ready}</div>
              </button>
            )
          })}
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
          {/* Customer: cash (poora paisa) me optional, udhaar me zaroori */}
          <Field label={isCredit ? 'Customer (Grahak), zaroori (udhaar)' : 'Customer (Grahak) (optional)'}>
            <div className="flex items-center gap-2">
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required={isCredit} className="flex-1">
                <option value="">{isCredit ? 'Select…' : 'Walk-in (bina naam)'}</option>
                {customers.data?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <button
                type="button"
                onClick={() => setAddingCustomer(true)}
                title="Naya customer add karein"
                className="shrink-0 rounded-lg border px-2.5 py-2 transition hover:brightness-95"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--primary)' }}
              >
                <UserPlus size={16} />
              </button>
              <button
                type="button"
                onClick={() => setTakingAdvance(true)}
                disabled={!customerId}
                title="Advance payment lein (paisa pehle, maal baad me)"
                className="shrink-0 rounded-lg border px-2.5 py-2 transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--green)' }}
              >
                <Wallet size={16} />
              </button>
            </div>
          </Field>
          {customerId && <OutstandingNote label="Pichla baqi (previous due)" amount={selected?.balance ?? 0} />}
          {advanceHeld > 0 && (
            <Note>
              Is customer ka advance jama hai, is liye bill khud isi me se kat jayega. Agar wo abhi cash
              bhi de raha hai to "Paid now" me utni raqam likh dein.
            </Note>
          )}
          <Field label="Discount (Rs per block)">
            <MoneyInput value={discount} onChange={setDiscount} />
          </Field>
          <Field label="Transport / kiraya (Rs), customer deta hai">
            <MoneyInput value={transport} onChange={setTransport} />
          </Field>
          {/* Paid now hamesha, khali = poora paisa; kam likho to baqi udhaar */}
          <Field label={advanceHeld > 0 ? 'Paid now (Rs), khali = advance se' : 'Paid now (Rs), khali = poora'}>
            <MoneyInput value={paid} onChange={setPaid} placeholder={advanceHeld > 0 ? '0 (advance se)' : String(total / 100)} />
          </Field>

          {paidVal > 0 && (
            <MethodField method={method} bankRef={bankRef} onChange={(m, b) => { setMethod(m); setBankRef(b) }} />
          )}

          <div className="flex justify-between text-sm"><span>Subtotal</span><span>{formatPaisa(subtotal)}</span></div>
          {(discountP ?? 0) > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--muted)' }}>Discount ({formatPaisa(discountRateP ?? 0)} x {totalQty} block)</span>
              <span style={{ color: 'var(--green)' }}>-{formatPaisa(discountP ?? 0)}</span>
            </div>
          )}
          {Number(transport) > 0 && <div className="flex justify-between text-sm"><span>Transport (kiraya)</span><span>{formatPaisa(Number(transport) * 100)}</span></div>}
          <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{formatPaisa(total)}</span></div>
          <div className="flex justify-between text-sm"><span>Paid now</span><span>{formatPaisa(paidVal)}</span></div>
          {advanceUse > 0 && (
            <div className="flex justify-between text-sm"><span>Advance se katega</span><span style={{ color: 'var(--green)' }}>{formatPaisa(advanceUse)}</span></div>
          )}
          {afterAdvance > 0 && <div className="flex justify-between text-sm font-semibold"><span>Baqi (udhaar)</span><span style={{ color: 'var(--amber)' }}>{formatPaisa(afterAdvance)}</span></div>}
          {advanceUse > 0 && afterAdvance === 0 && (
            <div className="flex justify-between text-sm font-semibold"><span>Baqi</span><span style={{ color: 'var(--green)' }}>Kuch nahi, advance se poora</span></div>
          )}

          {blockedWhy && <p className="text-sm" style={{ color: 'var(--red)' }}>{blockedWhy}</p>}
          {sale.error && <p className="text-sm text-red-600">{apiError(sale.error)}</p>}
          <Button
            onClick={checkout}
            disabled={cart.length === 0 || sale.isPending || blocked || (isCredit && !customerId)}
            className="w-full"
          >
            {sale.isPending ? 'Processing…' : advanceUse > 0 && afterAdvance === 0 ? 'Complete (Advance se)' : isCredit ? 'Complete (Udhaar)' : 'Complete Sale'}
          </Button>
        </div>
      </Card>

      {addingCustomer && (
        <Modal title="Naya Customer" onClose={() => setAddingCustomer(false)}>
          <CustomerForm
            onSubmit={(p) => newCustomer.mutate(p)}
            busy={newCustomer.isPending}
            error={newCustomer.error ? apiError(newCustomer.error) : ''}
            submitLabel="Add aur select karein"
            autoFocus
          />
        </Modal>
      )}

      {takingAdvance && selected && (
        <Modal title={`Advance lein: ${selected.name}`} onClose={() => setTakingAdvance(false)}>
          <AdvanceForm
            held={advanceHeld}
            onSubmit={(p) => advance.mutate(p)}
            busy={advance.isPending}
            error={advance.error ? apiError(advance.error) : ''}
          />
        </Modal>
      )}

      {advanceSlip && (
        <PaymentReceipt
          payment={advanceSlip.payment}
          party={advanceSlip.name}
          reason="Advance jama (paisa pehle, maal baad me)"
          extraTotals={[{ label: 'Kul advance jama', value: advanceSlip.held }]}
          onClose={() => setAdvanceSlip(null)}
        />
      )}

      {receipt && <Receipt sale={receipt} onClose={() => setReceipt(null)} />}
    </div>
  )
}

function Receipt({ sale, onClose }: { sale: Record<string, unknown>; onClose: () => void }) {
  const items = (sale.items as { product_name: string; quantity: number; unit_price: number; line_total: number }[]) ?? []
  const cust = sale.customer as { name?: string } | undefined
  return (
    <InvoiceSheet
      docType="Sales Invoice"
      number={String(sale.invoice_no)}
      date={String(sale.sale_date ?? '')}
      customer={cust?.name ?? 'Walk-in'}
      meta={sale.payment_method ? `Paid via ${String(sale.payment_method).toUpperCase()}` : undefined}
      lines={items.map((it) => ({ name: it.product_name, qty: String(it.quantity), rate: it.unit_price, total: it.line_total }))}
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

function AdvanceForm({ held, onSubmit, busy, error }: { held: number; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ payment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '', notes: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, amount: Number(form.amount) }) }} className="space-y-3">
      <Note>
        Paisa pehle, maal baad me. Jo bhi bill is customer ka banega, wo khud is advance me se katta jayega.
      </Note>
      {held > 0 && <OutstandingNote label="" amount={-held} />}
      <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required /></Field>
      <Field label="Advance (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      <Field label="Note (marzi se)"><Input value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Kis kaam ke liye" /></Field>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy || !form.amount} className="w-full">{busy ? 'Saving…' : 'Advance jama karein'}</Button>
    </form>
  )
}

