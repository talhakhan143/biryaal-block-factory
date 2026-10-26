import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { api, apiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Button, Card, Field, Note, PageHeader, PasswordInput, Switch } from '../components/ui'

/**
 * Dashboard ke paise wale tile in char tokrion me bante hain. Yehi char naam
 * server bhi samajhta hai, is liye in ke naam badalne nahi hain.
 */
const GROUPS: { key: string; label: string; covers: string }[] = [
  { key: 'income', label: 'Profit aur loss', covers: 'Is mahine Aamdani, Net Profit (mahina aur ab tak), Sale Profit, Kiraya Income' },
  { key: 'sales', label: 'Total sales aur payments', covers: 'Today Sales, Money In, Money Out, is mahine ki sales' },
  { key: 'cash', label: 'Cash aur bank', covers: 'Total Cash, Cash in hand, Bank balance' },
  { key: 'dues', label: 'Lena dena (udhaar aur advance)', covers: 'Receivables, Payables, customer ka advance, diye hue advance' },
]

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

export default function Settings() {
  const qc = useQueryClient()
  const { user, refreshUser } = useAuth()

  const saved = useMemo(() => user?.dashboard_hidden ?? [], [user])
  const [hidden, setHidden] = useState<string[]>(saved)
  const [password, setPassword] = useState('')
  const [done, setDone] = useState('')

  const changed = !sameSet(saved, hidden)
  // Sab chaaron tokriyan bandh hain ya nahi. Owner ko aksar "sab chhupa do"
  // chahiye hota hai, aik aik switch dabana uski aadat nahi.
  const allHidden = GROUPS.every((g) => hidden.includes(g.key))

  const save = useMutation({
    mutationFn: () => api.patch('/settings/dashboard-privacy', { hidden, current_password: password }),
    onSuccess: async () => {
      await refreshUser()
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['reseller/dashboard'] })
      setPassword('')
      setDone('Save ho gaya.')
    },
    onError: async () => {
      // Save nahi hua, to switch wahin wapas chale jayein jahan server ne rakha
      // hai. Warna screen jhoot bolti hai: taale lage hue dikhte hain magar
      // server par kuch badla hi nahi, aur banda page refresh kar ke sach
      // dhoondne par majboor ho jata hai.
      const fresh = await refreshUser()
      setHidden(fresh?.dashboard_hidden ?? [])
      setPassword('')
    },
  })

  // Purani error nayi selection ke upar pari rahe to banda samajhta hai ab bhi
  // ruka hua hai, is liye switch chhune par hi saaf ho jati hai.
  const clearNotices = () => {
    setDone('')
    if (save.error) save.reset()
  }

  const toggle = (key: string) => {
    clearNotices()
    setHidden((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const toggleAll = () => {
    clearNotices()
    setHidden(allHidden ? [] : GROUPS.map((g) => g.key))
  }

  const error = save.error ? apiError(save.error) : ''
  const blocked = !changed || password.trim() === ''
  // Sales User ke header me Password ka button hi nahi hota, aur server bhi usay
  // apna password badalne nahi deta. Neeche wali line usay sach batani chahiye.
  const canChangePw = !!user && !user.roles.includes('Sales User')

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" subtitle="Apni nazar ki settings, sirf aapke account par lagti hain" />

      <Card>
        <h2 className="flex items-center gap-2 text-base font-bold" style={{ color: 'var(--text)' }}>
          <Lock size={16} style={{ color: 'var(--muted)' }} />
          Dashboard par paisa chhupayein
        </h2>

        <div className="mt-3">
          <Note>
            Dashboard par jo raqam chhupa do wo server se hi nahi aati, is liye koi devtools se bhi nahi dekh sakta.
            Chhupane aur kholne, dono par apna password lagta hai, yani aapki screen khuli pari ho to bhi koi aa kar
            ye setting badal nahi sakta. Ye sirf aapke account par hai, doosre user ki nazar nahi badalti. Factory
            aur Resellers, dono dashboard par aik saath lagti hai.
            <br />
            <span style={{ color: 'var(--muted)' }}>
              Kharch (expenses) aur blocks ki ginti kabhi nahi chhupti, sab chhupa dene par bhi nazar aati hai.
              Reports, Cash Book aur Sales ke page par figure phir bhi nazar aayenge, ye sirf dashboard ka parda hai.
            </span>
          </Note>
        </div>

        <div
          className="mt-4 flex items-center justify-between gap-4 rounded-lg px-3 py-3"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          <div className="min-w-0">
            <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>Sab kuch chhupa do</div>
            <div className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
              Dashboard par paise ka aik figure bhi nazar nahi aayega
            </div>
          </div>
          <Switch on={allHidden} label="Sab kuch chhupa do" onToggle={toggleAll} />
        </div>

        <div className="mt-2 divide-y" style={{ borderColor: 'var(--border)' }}>
          {GROUPS.map((g) => {
            const on = hidden.includes(g.key)
            return (
              <div key={g.key} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{g.label}</div>
                  <div className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>{g.covers}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Switch on={on} label={g.label} onToggle={() => toggle(g.key)} />
                  <span className="text-[10px] font-semibold" style={{ color: on ? 'var(--amber)' : 'var(--muted)' }}>
                    {on ? 'Chhupa hua' : 'Nazar aata hai'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Password hamesha, kisi bhi tabdeeli par. Khana chhupana nahi, warna
            banda switch daba kar Save dhoondta reh jata hai. */}
        <div className="mt-4">
          <Field label="Apna password (ye setting badalne ke liye)">
            <PasswordInput
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearNotices() }}
              autoComplete="current-password"
            />
          </Field>
        </div>

        {error && <p className="mt-3 text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
        {done && <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--green)' }}>{done}</p>}

        <div className="mt-4">
          <Button onClick={() => save.mutate()} disabled={blocked || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save karein'}
          </Button>
        </div>

        <p className="mt-4 border-t pt-3 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
          {canChangePw
            ? 'Password khud badalna ho to sab se upar daayen apne naam ke paas Password ka button hai, wahan se badalta hai.'
            : 'Apna password aap khud nahi badal sakte. Badalna ho to Owner se rabta karein.'}
        </p>
      </Card>
    </div>
  )
}
