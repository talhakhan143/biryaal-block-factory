import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, apiError } from '../lib/api'
import { Button, Card, Field, Input } from '../components/ui'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState('')
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.post('/forgot-password', { email })
      setSent(res.data.message)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-lg font-bold" style={{ color: 'var(--text)' }}>Forgot Password</h1>
        <p className="mb-5 text-sm" style={{ color: 'var(--muted)' }}>Apni email daalein — reset link wahin aayega.</p>
        {sent ? (
          <p className="text-sm" style={{ color: 'var(--green)' }}>{sent}</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">{busy ? 'Sending…' : 'Send reset link'}</Button>
          </form>
        )}
        <Link to="/login" className="mt-4 block text-center text-sm hover:underline" style={{ color: 'var(--primary)' }}>← Back to login</Link>
      </Card>
    </div>
  )
}
