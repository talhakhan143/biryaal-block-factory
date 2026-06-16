import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, apiError } from '../lib/api'
import { Button, Card, Field, Input } from '../components/ui'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''
  const email = params.get('email') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/reset-password', {
        token, email, password, password_confirmation: confirm,
      })
      setDone(true)
      setTimeout(() => navigate('/login'), 1500)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-lg font-bold" style={{ color: 'var(--text)' }}>Reset Password</h1>
        <p className="mb-5 text-sm" style={{ color: 'var(--muted)' }}>{email || 'Naya password set karein'}</p>
        {done ? (
          <p className="text-sm" style={{ color: 'var(--green)' }}>Password reset ho gaya — login par le ja rahe…</p>
        ) : !token || !email ? (
          <p className="text-sm" style={{ color: 'var(--red)' }}>Invalid reset link. Email se dobara link kholein.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="New password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            <Field label="Confirm password"><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></Field>
            {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Reset password'}</Button>
          </form>
        )}
        <Link to="/login" className="mt-4 block text-center text-sm hover:underline" style={{ color: 'var(--primary)' }}>← Back to login</Link>
      </Card>
    </div>
  )
}
