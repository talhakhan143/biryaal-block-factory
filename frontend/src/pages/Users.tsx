import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldAlert, SquarePen, TriangleAlert } from 'lucide-react'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { Badge, Button, Card, type Column, DataTable, Field, IconButton, Input, Modal, PageHeader, RowActions, Select } from '../components/ui'

interface AppUser {
  id: number
  name: string
  email: string
  phone?: string
  is_active: boolean
  roles: string[]
}

export default function Users() {
  const { user } = useAuth()
  const canReset = user?.roles.some((r) => r === 'Super Admin' || r === 'Owner') ?? false
  const qc = useQueryClient()
  const [editing, setEditing] = useState<AppUser | null>(null)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('name')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const { data, isLoading } = useList<AppUser>('users', { search, page, sort, dir })
  const roles = useQuery({ queryKey: ['roles'], queryFn: async () => (await api.get<string[]>('/roles')).data })

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setSort(key); setDir('asc') }
    setPage(1)
  }

  const columns: Column<AppUser>[] = [
    { key: 'name', label: 'Name', sortable: true, render: (u) => <span className="font-medium">{u.name}</span> },
    { key: 'email', label: 'Email', sortable: true, render: (u) => u.email },
    { key: 'phone', label: 'Phone', render: (u) => u.phone ?? '—' },
    { key: 'role', label: 'Role', render: (u) => u.roles.map((r) => <Badge key={r} color="blue">{r}</Badge>) },
    { key: 'status', label: 'Status', render: (u) => u.is_active ? <Badge color="green">Active</Badge> : <Badge color="red">Disabled</Badge> },
    {
      key: 'actions', label: '', align: 'right', render: (u) => (
        <RowActions><IconButton icon={SquarePen} label="Edit" tone="primary" onClick={() => setEditing(u)} /></RowActions>
      ),
    },
  ]

  const save = useMutation({
    mutationFn: ({ id, payload }: { id?: number; payload: Record<string, unknown> }) =>
      id ? api.put(`/users/${id}`, payload) : api.post('/users', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setEditing(null)
      setCreating(false)
    },
  })

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Staff logins & roles (kaun kya access kar sakta hai)"
        actions={<Button onClick={() => setCreating(true)}>+ User</Button>}
      />
      <DataTable
        columns={columns}
        rows={data?.data}
        loading={isLoading}
        emptyText="Koi user nahi."
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Naam ya email se search…"
        sort={sort}
        dir={dir}
        onSort={onSort}
        meta={data?.meta}
        page={page}
        onPage={setPage}
      />

      {canReset && <DangerZone />}

      {(creating || editing) && (
        <Modal title={editing ? 'Edit User' : 'New User'} onClose={() => { setCreating(false); setEditing(null) }}>
          <UserForm
            user={editing}
            roles={roles.data ?? []}
            onSubmit={(payload) => save.mutate({ id: editing?.id, payload })}
            busy={save.isPending}
            error={save.error ? apiError(save.error) : ''}
          />
        </Modal>
      )}
    </div>
  )
}

function UserForm({ user, roles, onSubmit, busy, error }: { user: AppUser | null; roles: string[]; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    role: user?.roles[0] ?? 'Sales User',
    password: '',
    is_active: user?.is_active ?? true,
  })
  const set = (k: string, v: string | boolean) => setForm({ ...form, [k]: v })

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form }) }} className="space-y-3">
      <Field label="Name"><Input value={form.name} onChange={(e) => set('name', e.target.value)} required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required /></Field>
        <Field label="Phone"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
      </div>
      <Field label="Role">
        <Select value={form.role} onChange={(e) => set('role', e.target.value)} required>
          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
      </Field>
      <Field label={user ? 'New password (khali = na badlo)' : 'Password'}>
        <Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} required={!user} />
      </Field>
      {user && (
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
          <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
          Active (login kar sakta hai)
        </label>
      )}
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save'}</Button>
    </form>
  )
}

/** Super-Admin only: nuke all business/test data so a client starts fresh. */
function DangerZone() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [done, setDone] = useState<string | null>(null)

  const reset = useMutation({
    mutationFn: () => api.post('/system/reset', { confirm: confirmText }),
    onSuccess: (res) => {
      setDone((res.data as { message?: string })?.message ?? 'System reset ho gaya.')
      qc.clear()
    },
  })

  const close = () => { setOpen(false); setConfirmText(''); reset.reset() }

  return (
    <div className="mt-10">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--red)' }}>
        <ShieldAlert size={16} /> Danger Zone — Owner / Super Admin
      </h2>
      <Card accent="red">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold" style={{ color: 'var(--text)' }}>Hard Reset — saara data wipe</div>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
              Client demo ke baad sab kuch clear: sales, purchases, payments, production, dispatch, transport, customers,
              suppliers, drivers, mazdoor, staff, products, stock, ledger — sab. <strong>Users, roles aur accounts safe rahenge.</strong>
              {' '}Yeh wapas nahi aata.
            </p>
          </div>
          <Button variant="danger" onClick={() => setOpen(true)} className="shrink-0">
            <TriangleAlert size={16} /> Hard Reset
          </Button>
        </div>
      </Card>

      {open && (
        <Modal title="Hard Reset — pakka?" onClose={close}>
          {done ? (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: 'var(--green)' }}>{done}</p>
              <Button className="w-full" onClick={() => window.location.reload()}>Page reload karein</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border p-3" style={{ borderColor: 'var(--red)', background: 'color-mix(in srgb, var(--red) 10%, transparent)' }}>
                <TriangleAlert size={20} style={{ color: 'var(--red)', flexShrink: 0 }} />
                <p className="text-sm" style={{ color: 'var(--text)' }}>
                  Saara business/test data permanently delete ho jayega aur <strong>wapas nahi aayega</strong>. Backup le liya?
                </p>
              </div>
              <Field label='Confirm karne ke liye "RESET" (capital) likhein'>
                <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESET" autoFocus />
              </Field>
              {reset.error && <p className="text-sm" style={{ color: 'var(--red)' }}>{apiError(reset.error)}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={close}>Cancel</Button>
                <Button variant="danger" disabled={confirmText !== 'RESET' || reset.isPending} onClick={() => reset.mutate()}>
                  {reset.isPending ? 'Wiping…' : 'Sab data delete karo'}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
