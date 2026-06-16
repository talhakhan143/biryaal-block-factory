import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { Badge, Button, Field, Input, Modal, PageHeader, Select, Spinner, Table } from '../components/ui'

interface AppUser {
  id: number
  name: string
  email: string
  phone?: string
  is_active: boolean
  roles: string[]
}

export default function Users() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<AppUser | null>(null)
  const [creating, setCreating] = useState(false)
  const { data, isLoading } = useList<AppUser>('users')
  const roles = useQuery({ queryKey: ['roles'], queryFn: async () => (await api.get<string[]>('/roles')).data })

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
      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Name', 'Email', 'Phone', 'Role', 'Status', '']}>
          {data?.data.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3 font-medium">{u.name}</td>
              <td className="px-4 py-3">{u.email}</td>
              <td className="px-4 py-3">{u.phone ?? '—'}</td>
              <td className="px-4 py-3">{u.roles.map((r) => <Badge key={r} color="blue">{r}</Badge>)}</td>
              <td className="px-4 py-3">{u.is_active ? <Badge color="green">Active</Badge> : <Badge color="red">Disabled</Badge>}</td>
              <td className="px-4 py-3 text-right">
                <button className="text-sm hover:underline" style={{ color: 'var(--primary)' }} onClick={() => setEditing(u)}>Edit</button>
              </td>
            </tr>
          ))}
        </Table>
      )}
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
