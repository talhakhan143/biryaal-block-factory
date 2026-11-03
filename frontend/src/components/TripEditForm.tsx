import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useList, type Paginated } from '../lib/hooks'
import { formatPaisa } from '../lib/money'
import { Button, Field, Input, MethodField, Modal, MoneyInput, Note, Select } from './ui'

interface DriverOption {
  id: string
  name: string
  vehicle_name?: string
}

/** Kiraya kis khareed ka tha, ye batane ke liye. */
interface PurchaseOption {
  id: string
  reference: string
  purchase_date: string
  supplier?: { name: string } | null
  raw_material?: { name: string } | null
}

export interface EditableTrip {
  id: string
  reference: string
  kind?: string
  trip_date: string
  rate: number
  paid: number
  driver?: { id: string; name: string } | null
  vehicle_label?: string | null
  notes?: string | null
  for?: { reference?: string | null } | null
}

/**
 * Galat likha hua kiraya theek karna.
 *
 * Nayi trip nahi banti, wahi row badalti hai, is liye jo parchi driver ko de
 * di gayi thi us ka reference wahi rehta hai. Backend andar se purana asar
 * hata kar naya lagata hai, to kharcha, cash aur driver ka khata teeno khud
 * nayi rakam par aa jate hain.
 *
 * Aik hi jagah rehta hai taake "Maal ka Kiraya" aur "Transport Trips" dono
 * page par bilkul aik jaisa dikhe.
 */
export default function TripEditForm({
  trip, onSubmit, busy, error,
}: {
  trip: EditableTrip
  onSubmit: (p: Record<string, unknown>) => void
  busy: boolean
  error: string
}) {
  const inbound = trip.kind === 'in'
  const drivers = useList<DriverOption>('drivers', { per_page: 200 })
  // Khareed ki list sirf maal laane wali trip par chahiye, is liye useList ki
  // jagah seedha useQuery: maal bhejne wali trip par call hi nahi jati.
  const purchaseParams = { per_page: 200 }
  const purchases = useQuery({
    queryKey: ['purchases', purchaseParams],
    queryFn: async () => (await api.get<Paginated<PurchaseOption>>('/purchases', { params: purchaseParams })).data,
    enabled: inbound,
  })

  const [form, setForm] = useState({
    trip_date: trip.trip_date,
    driver_id: trip.driver?.id ?? '',
    vehicle_label: trip.vehicle_label ?? '',
    rate: String((trip.rate ?? 0) / 100),
    paid: String((trip.paid ?? 0) / 100),
    notes: trip.notes ?? '',
    method: 'cash',
    bank_ref: '',
    material_purchase_id: '',
  })
  // Khareed ka khana sirf tab bhejte hain jab banda khud usay chhoo le. Row se
  // humein sirf us khareed ka reference milta hai, id nahi, aur agar wo list me
  // na mile to bina chhue bhejne se maujooda link chup chaap tut jata hai.
  const [linkTouched, setLinkTouched] = useState(false)
  const set = (k: string, v: string) => setForm({ ...form, [k]: v })

  const rate = Number(form.rate) || 0
  const paid = Number(form.paid) || 0
  const over = paid > rate && rate > 0
  const bad = !Number.isFinite(rate) || rate <= 0 || over || !form.driver_id
  // Paisa badla ho to hi poochte hain ke kaise diya. Na badla ho to purana
  // tareeqa chhuta hi nahi, warna bank ka likha paisa cash me chala jata hai.
  const paidChanged = Math.round(paid * 100) !== (trip.paid ?? 0)
  const askMethod = paidChanged && paid > 0

  // Jis khareed se trip judi hui hai wo list me reference se dhoondte hain.
  const linked = trip.for?.reference
    ? purchases.data?.data.find((p) => p.reference === trip.for?.reference)
    : undefined
  const selectedLink = linkTouched ? form.material_purchase_id : (linked?.id ?? '')

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (bad) return
        onSubmit({
          trip_date: form.trip_date,
          driver_id: form.driver_id,
          vehicle_label: form.vehicle_label || null,
          notes: form.notes || null,
          rate,
          paid,
          ...(askMethod ? { method: form.method, bank_ref: form.bank_ref } : {}),
          ...(inbound && linkTouched ? { material_purchase_id: form.material_purchase_id || null } : {}),
        })
      }}
      className="space-y-3"
    >
      <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Parchi</span><span className="font-mono text-xs">{trip.reference}</span></div>
        <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Abhi likha hua kiraya</span><span className="font-semibold">{formatPaisa(trip.rate ?? 0)}</span></div>
        <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Simt</span><span>{inbound ? 'Maal laaya' : 'Maal bheja'}</span></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={form.trip_date} onChange={(e) => set('trip_date', e.target.value)} required /></Field>
        <Field label="Kiraya (Rs)"><MoneyInput value={form.rate} onChange={(v) => set('rate', v)} autoFocus required /></Field>
      </div>

      <Field label="Driver">
        <Select value={form.driver_id} onChange={(e) => set('driver_id', e.target.value)} required>
          <option value="">Driver chunein</option>
          {drivers.data?.data.map((d) => (
            <option key={d.id} value={d.id}>{d.name}{d.vehicle_name ? ` (${d.vehicle_name})` : ''}</option>
          ))}
        </Select>
      </Field>

      <Field label="Gaari (marzi se)"><Input value={form.vehicle_label} onChange={(e) => set('vehicle_label', e.target.value)} placeholder="Hino 6-wheeler" /></Field>

      {inbound && (
        <Field label="Kis khareed ka maal hai (marzi se)">
          <Select
            value={selectedLink}
            onChange={(e) => { setLinkTouched(true); set('material_purchase_id', e.target.value) }}
          >
            <option value="">Kisi khareed se nahi joda</option>
            {purchases.data?.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.reference} · {p.supplier?.name ?? 'bina naam'} · {p.raw_material?.name ?? ''} ({p.purchase_date})
              </option>
            ))}
          </Select>
        </Field>
      )}

      {inbound && trip.for?.reference && !linked && !linkTouched && (
        <Note tone="amber">
          Ye trip <strong>{trip.for.reference}</strong> se juri hui hai, magar wo khareed is list me nahi aayi.
          Us khana ko chhuein ge to hi link badlega.
        </Note>
      )}

      <Field label="Kya laaya / likhna ho to (marzi se)"><Input value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Raiti 10 trolley, Chenab se" /></Field>
      <Field label="Abhi diya (Rs)"><MoneyInput value={form.paid} onChange={(v) => set('paid', v)} /></Field>
      {askMethod && <MethodField method={form.method} bankRef={form.bank_ref} onChange={(m, b) => setForm({ ...form, method: m, bank_ref: b })} />}

      {rate > 0 && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Naya kiraya</span><span>Rs {rate.toLocaleString('en-PK')}</span></div>
          <div className="flex justify-between"><span style={{ color: 'var(--muted)' }}>Diya</span><span>Rs {paid.toLocaleString('en-PK')}</span></div>
          <div className="flex justify-between font-semibold"><span>Baqi dena</span><span style={{ color: rate - paid > 0 ? 'var(--amber)' : 'var(--green)' }}>Rs {Math.max(rate - paid, 0).toLocaleString('en-PK')}</span></div>
        </div>
      )}

      {over && <p className="text-sm" style={{ color: 'var(--red)' }}>Diya hua kiraye se zyada hai.</p>}
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button type="submit" disabled={busy || bad} className="w-full">{busy ? 'Saving…' : 'Save karein'}</Button>
    </form>
  )
}

/** Dono page par aik hi modal, aik hi shakal. */
export function TripEditModal({
  trip, onClose, onSubmit, busy, error,
}: {
  trip: EditableTrip
  onClose: () => void
  onSubmit: (p: Record<string, unknown>) => void
  busy: boolean
  error: string
}) {
  return (
    <Modal title={`Kiraya theek karein: ${trip.reference}`} onClose={onClose}>
      <TripEditForm trip={trip} onSubmit={onSubmit} busy={busy} error={error} />
    </Modal>
  )
}
