import { useState } from 'react'
import { formatPaisa } from '../lib/money'
import { Button, Field, Input, MethodField, MoneyInput } from './ui'

export interface EditablePayment {
  reference: string
  party_name?: string | null
  payment_date: string
  amount: number
  method?: string | null
  bank_ref?: string | null
}

/**
 * Galat likhi hui rakam ya tareekh theek karna.
 *
 * Nayi entry nahi banti, wahi record badalta hai, is liye parchi ka reference
 * wahi rehta hai jo bande ko pehle de diya gaya tha. Backend andar se purana
 * asar hata kar naya lagata hai, to cash, khata aur jo bill is paise se chuke
 * the sab khud nayi rakam par aa jate hain.
 *
 * Aik hi jagah rehta hai taake Payments page aur customer ki apni page par
 * bilkul aik jaisa dikhe.
 */
export default function PaymentEditForm({
  payment, party, onSubmit, busy, error,
}: {
  payment: EditablePayment
  /** Agar row me naam na ho to page khud bata deta hai. */
  party?: string
  onSubmit: (p: Record<string, unknown>) => void
  busy: boolean
  error: string
}) {
  const [form, setForm] = useState({
    payment_date: payment.payment_date,
    amount: String((payment.amount ?? 0) / 100),
    method: payment.method ?? 'cash',
    bank_ref: payment.bank_ref ?? '',
  })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  const amt = Number(form.amount)
  const bad = !Number.isFinite(amt) || amt <= 0

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (bad) return; onSubmit({ ...form, amount: amt }) }}
      className="space-y-3"
    >
      <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Kis ka</span><span>{payment.party_name || party || '·'}</span></div>
        <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Abhi likha hua</span><span className="font-semibold">{formatPaisa(payment.amount ?? 0)}</span></div>
      </div>
      <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required /></Field>
      <Field label="Nayi rakam (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} autoFocus required /></Field>
      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy || bad} className="w-full">{busy ? 'Saving…' : 'Save karein'}</Button>
    </form>
  )
}
