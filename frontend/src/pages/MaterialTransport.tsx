import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Truck, UserPlus, Wallet } from 'lucide-react'
import { api, apiError } from '../lib/api'
import { useList } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { useAuth } from '../lib/auth'
import {
  Badge, Button, Card, type Column, DataTable, Field, IconButton, Input, MethodField,
  Modal, MoneyInput, Note, OutstandingNote, PageHeader, RowActions, Select, StatTile,
} from '../components/ui'
import { MONEY_KEYS } from '../lib/queryKeys'

interface Driver {
  id: string
  name: string
  phone?: string
  vehicle_name?: string
  vehicle_plate?: string
  balance: number
}
interface Trip {
  id: string
  reference: string
  kind: string
  vehicle_label?: string
  driver?: { id: string; name: string }
  trip_date: string
  rate: number
  paid: number
  balance: number
  status: string
  notes?: string
}

const statusColor: Record<string, string> = { paid: 'green', partial: 'amber', unpaid: 'red' }

/**
 * Maal laane wale driver ka kiraya.
 *
 * Dispatch wala screen maal BHEJNE ka kiraya chalata hai, jahan paisa customer
 * deta hai. Ye uska ulta hai: jo driver supplier se maal factory tak laata hai,
 * uska kiraya hamara apna kharcha hai. Driver aur uska khata dono taraf wahi
 * hain, is liye yahan se bhi usay paisa diya ja sakta hai.
 */
export default function MaterialTransport() {
  const { can } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [driverId, setDriverId] = useState('')
  const [addingDriver, setAddingDriver] = useState(false)
  const [addingTrip, setAddingTrip] = useState(false)
  const [payingDriver, setPayingDriver] = useState(false)
  const [payTrip, setPayTrip] = useState<Trip | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const drivers = useList<Driver>('drivers', { per_page: 200 })
  const trips = useList<Trip>('transport-trips', { kind: 'in', page, search, driver_id: driverId || undefined })

  const selected = drivers.data?.data.find((d) => d.id === driverId)
  const refresh = () => MONEY_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))

  const newDriver = useMutation({
    mutationFn: async (p: Record<string, unknown>) => (await api.post('/drivers', p)).data,
    onSuccess: async (res) => {
      await drivers.refetch()
      setDriverId(res.data.id)   // naya driver seedha select ho jaye
      setAddingDriver(false)
    },
  })

  const newTrip = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/transport-trips', { ...p, kind: 'in', driver_id: driverId }),
    onSuccess: () => { refresh(); drivers.refetch(); setAddingTrip(false) },
  })

  const payAll = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post(`/drivers/${driverId}/pay`, p),
    onSuccess: () => { refresh(); drivers.refetch(); setPayingDriver(false) },
  })

  const payOne = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.post(`/transport-trips/${id}/pay`, payload),
    onSuccess: () => { refresh(); drivers.refetch(); setPayTrip(null) },
  })

  const columns: Column<Trip>[] = [
    { key: 'reference', label: 'Ref', render: (t) => <span className="font-mono text-xs">{t.reference}</span> },
    { key: 'trip_date', label: 'Date', render: (t) => t.trip_date },
    { key: 'driver', label: 'Driver', render: (t) => t.driver?.name ?? '·' },
    { key: 'vehicle', label: 'Gaari', render: (t) => t.vehicle_label ?? '·' },
    { key: 'notes', label: 'Kya laaya', render: (t) => <span style={{ color: 'var(--muted)' }}>{t.notes || '·'}</span> },
    { key: 'rate', label: 'Kiraya', align: 'right', render: (t) => formatPaisa(t.rate) },
    { key: 'paid', label: 'Diya', align: 'right', render: (t) => formatPaisa(t.paid) },
    { key: 'balance', label: 'Baqi', align: 'right', render: (t) => (t.balance > 0 ? <Badge color="amber">{formatPaisa(t.balance)}</Badge> : <Badge color="green">Saaf</Badge>) },
    { key: 'status', label: 'Haal', render: (t) => <Badge color={statusColor[t.status]}>{t.status}</Badge> },
    {
      key: 'actions', label: '', align: 'right',
      render: (t) => (
        <div onClick={(e) => e.stopPropagation()}>
          <RowActions>
            {can('payments.manage') && t.balance > 0 && (
              <IconButton icon={Wallet} label="Is trip ka paisa" tone="primary" onClick={() => setPayTrip(t)} />
            )}
            {t.driver && <IconButton icon={ArrowRight} label="Driver ki poori history" tone="primary" onClick={() => navigate(`/drivers/${t.driver!.id}`)} />}
          </RowActions>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Maal ka Kiraya"
        subtitle="Jo driver supplier se maal factory tak laata hai, uska kiraya aur uska hisaab"
      />

      <div className="mb-4">
        <Note>
          Yahan sirf maal <strong>laane</strong> ka kiraya aata hai. Customer ko maal bhejne ka kiraya
          Dispatch aur Transport se chalta hai.
        </Note>
      </div>

      {/* Driver chuno, ya wahin naya bana lo */}
      <Card className="mb-4">
        <Field label="Driver chunein">
          <div className="flex items-center gap-2">
            <Select value={driverId} onChange={(e) => setDriverId(e.target.value)} className="flex-1">
              <option value="">Saare drivers</option>
              {drivers.data?.data.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.vehicle_name ? ` (${d.vehicle_name})` : ''}{d.balance > 0 ? ` — baqi ${(d.balance / 100).toLocaleString('en-PK')}` : ''}
                </option>
              ))}
            </Select>
            {can('transport.manage') && (
              <button
                type="button"
                onClick={() => setAddingDriver(true)}
                title="Naya driver add karein"
                className="shrink-0 rounded-lg border px-2.5 py-2 transition hover:brightness-95"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--primary)' }}
              >
                <UserPlus size={16} />
              </button>
            )}
          </div>
        </Field>

        {selected && (
          <div className="mt-4">
            <div className="bf-stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Is driver ko dena" value={formatPaisa(Math.max(selected.balance, 0))} hint="Saare kiraye ka baqi" tone={selected.balance > 0 ? 'red' : 'green'} />
              <StatTile label="Gaari" value={selected.vehicle_name || '·'} hint={selected.vehicle_plate || ''} tone="primary" />
              <StatTile label="Phone" value={selected.phone || '·'} tone="text" />
              {selected.balance < 0 && (
                <StatTile label="Advance diya hua" value={formatPaisa(-selected.balance)} hint="Agle kiraye me se katega" tone="amber" />
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {can('transport.manage') && (
                <Button onClick={() => setAddingTrip(true)}>
                  <Truck size={15} className="mr-1.5 inline" />Naya kiraya likhein
                </Button>
              )}
              {can('payments.manage') && selected.balance > 0 && (
                <Button variant="secondary" onClick={() => setPayingDriver(true)}>
                  <Wallet size={15} className="mr-1.5 inline" />Paisa dein
                </Button>
              )}
            </div>
          </div>
        )}

        {!selected && (
          <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
            Driver chunein to uska baqi, naya kiraya likhne ka option aur payment ka button yahin aa jayega.
          </p>
        )}
      </Card>

      <DataTable
        columns={columns}
        rows={trips.data?.data}
        loading={trips.isLoading}
        emptyText={driverId ? 'Is driver ka koi kiraya abhi nahi likha gaya.' : 'Abhi maal laane ka koi kiraya nahi likha gaya.'}
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Ref ya driver se dhoondein…"
        meta={trips.data?.meta}
        page={page}
        onPage={setPage}
        onRowClick={(t) => t.driver && navigate(`/drivers/${t.driver.id}`)}
      />

      {addingDriver && (
        <Modal title="Naya Driver" onClose={() => setAddingDriver(false)}>
          <DriverForm
            onSubmit={(p) => newDriver.mutate(p)}
            busy={newDriver.isPending}
            error={newDriver.error ? apiError(newDriver.error) : ''}
          />
        </Modal>
      )}

      {addingTrip && selected && (
        <Modal title={`Naya kiraya: ${selected.name}`} onClose={() => setAddingTrip(false)}>
          <TripForm
            onSubmit={(p) => newTrip.mutate(p)}
            busy={newTrip.isPending}
            error={newTrip.error ? apiError(newTrip.error) : ''}
          />
        </Modal>
      )}

      {payingDriver && selected && (
        <Modal title={`Paisa dein: ${selected.name}`} onClose={() => setPayingDriver(false)}>
          <PayForm
            label="Is driver ko kul dena"
            outstanding={Math.max(selected.balance, 0)}
            onSubmit={(p) => payAll.mutate(p)}
            busy={payAll.isPending}
            error={payAll.error ? apiError(payAll.error) : ''}
          />
        </Modal>
      )}

      {payTrip && (
        <Modal title={`Paisa dein: ${payTrip.reference}`} onClose={() => setPayTrip(null)}>
          <PayForm
            label="Is trip ka baqi"
            outstanding={payTrip.balance}
            onSubmit={(payload) => payOne.mutate({ id: payTrip.id, payload })}
            busy={payOne.isPending}
            error={payOne.error ? apiError(payOne.error) : ''}
          />
        </Modal>
      )}
    </div>
  )
}

function DriverForm({ onSubmit, busy, error }: { onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ name: '', phone: '', vehicle_name: '', vehicle_plate: '', license_no: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form) }} className="space-y-3">
      <Field label="Naam"><Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus required /></Field>
      <Field label="Phone"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0300-1234567" required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Gaari ka naam"><Input value={form.vehicle_name} onChange={(e) => set('vehicle_name', e.target.value)} placeholder="Hino 6-wheeler" required /></Field>
        <Field label="Number plate"><Input value={form.vehicle_plate} onChange={(e) => set('vehicle_plate', e.target.value)} placeholder="LEB-4471" /></Field>
      </div>
      <Field label="License no (marzi se)"><Input value={form.license_no} onChange={(e) => set('license_no', e.target.value)} /></Field>
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy || !form.name.trim()} className="w-full">{busy ? 'Saving…' : 'Add aur select karein'}</Button>
    </form>
  )
}

function TripForm({ onSubmit, busy, error }: { onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({
    trip_date: new Date().toISOString().slice(0, 10),
    rate: '', paid: '0', notes: '', method: 'cash', bank_ref: '',
  })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  const rate = Number(form.rate) || 0
  const paid = Number(form.paid) || 0
  const over = paid > rate && rate > 0
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (over) return; onSubmit({ ...form, rate, paid }) }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={form.trip_date} onChange={(e) => set('trip_date', e.target.value)} required /></Field>
        <Field label="Kiraya (Rs)"><MoneyInput value={form.rate} onChange={(v) => set('rate', v)} required /></Field>
      </div>
      <Field label="Kya laaya (marzi se)"><Input value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Raiti 10 trolley, Chenab se" /></Field>
      <Field label="Abhi diya (Rs)"><MoneyInput value={form.paid} onChange={(v) => set('paid', v)} /></Field>
      {paid > 0 && <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />}
      {rate > 0 && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Kiraya</span><span>Rs {rate.toLocaleString('en-PK')}</span></div>
          <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Abhi diya</span><span>Rs {paid.toLocaleString('en-PK')}</span></div>
          <div className="flex justify-between font-semibold"><span>Baqi dena</span><span style={{ color: rate - paid > 0 ? 'var(--amber)' : 'var(--green)' }}>Rs {Math.max(rate - paid, 0).toLocaleString('en-PK')}</span></div>
        </div>
      )}
      {over && <p className="text-sm" style={{ color: 'var(--red)' }}>Diya hua kiraye se zyada hai.</p>}
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy || over || rate <= 0} className="w-full">{busy ? 'Saving…' : 'Kiraya likhein'}</Button>
    </form>
  )
}

function PayForm({ label, outstanding, onSubmit, busy, error }: { label: string; outstanding: number; onSubmit: (p: Record<string, unknown>) => void; busy: boolean; error: string }) {
  const [form, setForm] = useState({ payment_date: new Date().toISOString().slice(0, 10), amount: '', method: 'cash', bank_ref: '' })
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, amount: Number(form.amount) }) }} className="space-y-3">
      <OutstandingNote label={label} amount={outstanding} onFill={(rs) => set('amount', String(rs))} />
      <Field label="Date"><Input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} required /></Field>
      <Field label="Amount (Rs)"><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} required /></Field>
      <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Paisa dein'}</Button>
    </form>
  )
}
