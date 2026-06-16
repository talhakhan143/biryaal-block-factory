import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { apiError } from '../lib/api'
import { Button, Card, Field, Input } from '../components/ui'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('owner@blockfactory.test')
  const [password, setPassword] = useState('password')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(apiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <Card className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div
            className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl text-xl font-black"
            style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}
          >
            B
          </div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Biryaal Block Factory</h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Login karein (sign in)</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          <Link to="/forgot-password" className="block text-center text-sm hover:underline" style={{ color: 'var(--primary)' }}>
            Forgot password?
          </Link>
        </form>
      </Card>
      <p className="mt-6 text-center text-[11px]" style={{ color: 'var(--muted)' }}>
        Design &amp; Developed by Talha Khan · WhatsApp 92-336-8469404
      </p>
    </div>
  )
}
