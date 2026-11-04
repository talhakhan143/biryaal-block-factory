import { api } from './api'

type Confirm = (opts: {
  title?: string
  message: React.ReactNode
  confirmText?: string
  tone?: 'danger' | 'primary'
  requireText?: string
}) => Promise<boolean>

type Kind = 'customer' | 'supplier' | 'driver'

const RESOURCE: Record<Kind, string> = {
  customer: 'customers',
  supplier: 'suppliers',
  driver: 'drivers',
}

/** Owner Urdu parhta hai, is liye warning Urdu zaban me hai. */
const KIND_UR: Record<Kind, string> = {
  customer: 'کسٹمر',
  supplier: 'سپلائر',
  driver: 'ڈرائیور',
}

/** Server ki ginti ke naam, Urdu me. */
const COUNT_UR: Record<string, string> = {
  bills: 'بل',
  challan: 'چالان',
  wapsi: 'واپسی',
  khareed: 'خریداری',
  trips: 'ٹرپ',
  payments: 'ادائیگیاں',
}

/**
 * Bande ko poora mitane se pehle ki warning.
 *
 * Owner ka faisla: koi recycle bin nahi, seedha delete, aur warning Urdu me
 * ho. Is liye yahan pehle server se poochte hain ke kya kya sath jayega, phir
 * wo ginti warning me likh dete hain, aur bande se "delete" likhwate hain
 * taake galti se click na ho jaye.
 */
export async function confirmPurge(
  confirm: Confirm,
  { kind, id, name }: { kind: Kind; id: string; name: string },
): Promise<boolean> {
  let counts: Record<string, number> = {}
  try {
    counts = (await api.get<{ data: Record<string, number> }>(`/${RESOURCE[kind]}/${id}/delete-preview`)).data.data
  } catch {
    // Ginti na mile to bhi warning dikhani hai, bas ginti ke baghair.
  }

  const list = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${COUNT_UR[k] ?? k}`)

  return confirm({
    title: `${KIND_UR[kind]} کو ہمیشہ کے لیے مٹا دیں؟`,
    tone: 'danger',
    confirmText: 'ہمیشہ کے لیے مٹا دیں',
    requireText: 'delete',
    message: (
      <div dir="rtl" className="space-y-2 text-right" style={{ lineHeight: 1.9 }}>
        <p style={{ color: 'var(--text)' }}>
          <span className="font-bold">{name}</span> اور اس کا سارا حساب کتاب مٹ جائے گا۔
        </p>
        {list.length > 0 && (
          <p className="font-semibold" style={{ color: 'var(--red)' }}>
            اس کے ساتھ یہ بھی جائیں گے: {list.join('، ')}
          </p>
        )}
        <p style={{ color: 'var(--text)' }}>
          ایسا ہو جائے گا جیسے یہ بندہ کبھی آیا ہی نہ ہو۔ جو پیسہ اس سے ملا تھا یا اسے دیا تھا، وہ بھی کیش سے نکل جائے گا۔
        </p>
        <p className="font-bold" style={{ color: 'var(--red)' }}>
          یہ واپس نہیں آئے گا۔ کوئی ری سائیکل بن نہیں ہے۔
        </p>
      </div>
    ),
  })
}
