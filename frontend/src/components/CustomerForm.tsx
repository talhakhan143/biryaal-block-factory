import { useState } from 'react'
import { Button, Field, Input } from './ui'

export interface CustomerPayload extends Record<string, string> {
  name: string
  phone: string
  address: string
}

/**
 * New-customer form. Shared by the Customers page and the New Sale screen so a
 * walk-in can be added without leaving the till.
 */
export default function CustomerForm({
  onSubmit,
  busy,
  error,
  submitLabel = 'Save',
  autoFocus = false,
}: {
  onSubmit: (p: CustomerPayload) => void
  busy: boolean
  error: string
  submitLabel?: string
  autoFocus?: boolean
}) {
  const [form, setForm] = useState<CustomerPayload>({ name: '', phone: '', address: '' })
  const set = (k: keyof CustomerPayload, v: string) => setForm({ ...form, [k]: v })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(form)
      }}
      className="space-y-3"
    >
      <Field label="Name"><Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus={autoFocus} required /></Field>
      <Field label="Phone"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0300-1234567" /></Field>
      <Field label="Address"><Input value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy || !form.name.trim()} className="w-full">{busy ? 'Saving…' : submitLabel}</Button>
    </form>
  )
}
