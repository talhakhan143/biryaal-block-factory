import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { Button, Field, IconButton, Input, MethodField, MoneyInput, Note, Select, Spinner } from './ui'

interface Line { product_id: string; quantity: string; unit_price: string }

interface SaleDoc {
  id: string
  invoice_no: string
  customer_id?: string | null
  sale_date: string
  type: string
  discount: number
  transport_fare: number
  paid: number
  payment_method?: string | null
  bank_ref?: string | null
  notes?: string | null
  items?: { product_id: string; quantity: number; unit_price: number }[]
}

/**
 * Galat likha hua bill theek karna.
 *
 * Bill ki har cheez badalti hai: maal, ginti, rate, discount, kiraya aur jo
 * paisa mila. Server andar se poora bill wapas leta hai aur naye hisaab se
 * dobara likhta hai, magar invoice number wahi rehta hai kyunke wo parchi
 * customer ke haath me ja chuki hoti hai.
 *
 * Discount yahan KUL rakam me likha jata hai, POS ki tarah per block nahi.
 * Wajah: bill ban chuka hai, ginti badal sakti hai, aur per block se wapas
 * ginti karna sirf andaza hota.
 */
export default function SaleEditForm({ saleId, onSubmit, busy, error }: {
  saleId: string
  onSubmit: (p: Record<string, unknown>) => void
  busy: boolean
  error: string
}) {
  const products = useList<{ id: string; name: string; sale_price: number }>('products', { per_page: 100, active_only: true })
  const customers = useList<{ id: string; name: string }>('customers', { per_page: 200 })
  const { data: sale, isLoading } = useQuery({
    queryKey: ['sales', saleId],
    queryFn: async () => (await api.get<{ data: SaleDoc }>(`/sales/${saleId}`)).data.data,
  })

  const [form, setForm] = useState<{
    customer_id: string; sale_date: string; type: string; discount: string
    transport_fare: string; paid: string; method: string; bank_ref: string
  } | null>(null)
  const [lines, setLines] = useState<Line[] | null>(null)

  // Pehli dafa bill aane par form bhar dete hain. Paisa se rupay yahin hota hai.
  if (sale && !form) {
    setForm({
      customer_id: sale.customer_id ?? '',
      sale_date: sale.sale_date,
      type: sale.type,
      discount: String(sale.discount / 100),
      transport_fare: String(sale.transport_fare / 100),
      paid: String(sale.paid / 100),
      method: sale.payment_method ?? 'cash',
      bank_ref: sale.bank_ref ?? '',
    })
    setLines((sale.items ?? []).map((i) => ({
      product_id: i.product_id,
      quantity: String(i.quantity),
      unit_price: String(i.unit_price / 100),
    })))
  }

  if (isLoading || !form || !lines) return <Spinner />

  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  const setLine = (i: number, k: keyof Line, v: string) =>
    setLines(lines.map((l, x) => (x === i ? { ...l, [k]: v } : l)))
  const addLine = () => setLines([...lines, { product_id: '', quantity: '1', unit_price: '' }])
  const dropLine = (i: number) => setLines(lines.filter((_, x) => x !== i))

  const rsToP = (v: string) => {
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
  }
  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (rsToP(l.unit_price) ?? 0), 0)
  const discountP = rsToP(form.discount)
  const fareP = rsToP(form.transport_fare)
  const paidP = rsToP(form.paid)
  const total = Math.max(0, subtotal - (discountP ?? 0)) + (fareP ?? 0)

  const blank = lines.some((l) => !l.product_id || !(Number(l.quantity) > 0) || rsToP(l.unit_price) === null)
  const why = lines.length === 0 ? 'Bill me kam az kam aik cheez honi chahiye.'
    : blank ? 'Har line par maal, ginti aur rate theek likhein.'
      : discountP === null || fareP === null || paidP === null ? 'Rakam theek nahi likhi.'
        : (discountP ?? 0) > subtotal ? 'Discount bill se zyada hai.'
          : total <= 0 ? 'Bill sifar ka hai.'
            : (paidP ?? 0) > total ? 'Mila hua paisa bill se zyada hai.'
              : form.type === 'credit' && !form.customer_id ? 'Udhaar wale bill par customer zaroori hai.'
                : ''

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (why) return
        onSubmit({
          customer_id: form.customer_id || null,
          sale_date: form.sale_date,
          type: form.type,
          discount: (discountP ?? 0) / 100,
          transport_fare: (fareP ?? 0) / 100,
          paid: (paidP ?? 0) / 100,
          payment_method: (paidP ?? 0) > 0 ? form.method : undefined,
          bank_ref: form.method === 'bank' ? form.bank_ref : undefined,
          items: lines.map((l) => ({
            product_id: l.product_id,
            quantity: Number(l.quantity),
            unit_price: (rsToP(l.unit_price) ?? 0) / 100,
          })),
        })
      }}
      className="space-y-3"
    >
      <Note>
        Bill andar se poora wapas le kar naye hisaab se likha jata hai, magar invoice number wahi rehta hai.
        Agar is bill ka challan ban chuka ho, maal wapas aaya ho, ya is par alag se paisa receive hua ho to
        server rok dega.
      </Note>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={form.sale_date} onChange={(e) => set('sale_date', e.target.value)} required /></Field>
        <Field label="Kaise">
          <Select value={form.type} onChange={(e) => set('type', e.target.value)}>
            <option value="cash">Cash (poora paisa)</option>
            <option value="credit">Udhaar</option>
          </Select>
        </Field>
      </div>
      <Field label={form.type === 'credit' ? 'Customer, zaroori (udhaar)' : 'Customer (optional)'}>
        <Select value={form.customer_id} onChange={(e) => set('customer_id', e.target.value)}>
          <option value="">Walk-in (bina naam)</option>
          {customers.data?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>

      <div className="rounded-lg px-3 py-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Maal</div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <Field label="Kya">
                  <Select value={l.product_id} onChange={(e) => setLine(i, 'product_id', e.target.value)} required>
                    <option value="">Select…</option>
                    {products.data?.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="w-20"><Field label="Ginti"><Input type="number" min="1" value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} required /></Field></div>
              <div className="w-28"><Field label="Rate (Rs)"><MoneyInput value={l.unit_price} onChange={(v) => setLine(i, 'unit_price', v)} required /></Field></div>
              <div className="pb-1"><IconButton icon={Trash2} label="Delete" tone="red" onClick={() => dropLine(i)} /></div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addLine}
          className="mt-2 text-xs font-semibold underline-offset-2 hover:underline"
          style={{ color: 'var(--primary)' }}
        >
          Aur maal daalein
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Discount (Rs, kul)"><MoneyInput value={form.discount} onChange={(v) => set('discount', v)} /></Field>
        <Field label="Transport / kiraya (Rs)"><MoneyInput value={form.transport_fare} onChange={(v) => set('transport_fare', v)} /></Field>
      </div>
      <Field label="Mila hua paisa (Rs)"><MoneyInput value={form.paid} onChange={(v) => set('paid', v)} /></Field>
      {(paidP ?? 0) > 0 && (
        <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      )}

      <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Maal ka total</span><span>{formatPaisa(subtotal)}</span></div>
        {(discountP ?? 0) > 0 && <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Discount</span><span style={{ color: 'var(--green)' }}>-{formatPaisa(discountP ?? 0)}</span></div>}
        {(fareP ?? 0) > 0 && <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Kiraya</span><span>{formatPaisa(fareP ?? 0)}</span></div>}
        <div className="mt-1 flex justify-between border-t pt-1 text-base font-bold" style={{ borderColor: 'var(--border)' }}>
          <span>Bill ka total</span><span style={{ color: 'var(--primary)' }}>{formatPaisa(total)}</span>
        </div>
        <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Mila</span><span>{formatPaisa(paidP ?? 0)}</span></div>
        <div className="flex justify-between font-semibold">
          <span>Baqi</span>
          <span style={{ color: total - (paidP ?? 0) > 0 ? 'var(--amber)' : 'var(--green)' }}>{formatPaisa(Math.max(total - (paidP ?? 0), 0))}</span>
        </div>
      </div>

      {why && <p className="text-sm" style={{ color: 'var(--red)' }}>{why}</p>}
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy || !!why} className="w-full">{busy ? 'Saving…' : 'Save karein'}</Button>
    </form>
  )
}
