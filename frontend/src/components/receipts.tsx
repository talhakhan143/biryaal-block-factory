import InvoiceSheet from './InvoiceSheet'

/**
 * Har paise ke len den ki chhapne wali parchi.
 *
 * Aik hi usool: jahan paisa haath badalta hai, wahan bande ke haath me kaghaz
 * jaana chahiye. Is liye har parchi yahin se banti hai, taake har jagah aik
 * jaisi dikhe aur kisi page par kuch bhool na jaye.
 *
 * Har component wahi row leta hai jo list ya mutation ka jawab deta hai, is
 * liye koi naya API call nahi karna parta.
 */

const via = (method?: string | null, bankRef?: string | null) =>
  method ? `${String(method).toUpperCase()}${bankRef ? ` (${bankRef})` : ''}` : undefined

/** "PUR-000012 ka hisaab" jaisi line, jab paisa kisi aik bill ka ho. */
const againstLine = (against?: { type: string; reference?: string | null } | null) => {
  if (!against?.reference) return null
  const what: Record<string, string> = {
    Sale: 'is bill ka paisa',
    MaterialPurchase: 'is khareed ka paisa',
    TransportTrip: 'is kiraye ka paisa',
    Salary: 'is tankhwa ka paisa',
    ResellerSale: 'is bill ka paisa',
    ResellerPurchase: 'is khareed ka paisa',
    ResellerRental: 'is kiraye ka paisa',
  }
  return `${against.reference}: ${what[against.type] ?? 'is sauday ka paisa'}`
}

export interface PaymentDoc {
  reference: string
  /** Factory: 'receipt' | 'payment'. Resellers Point: 'in' | 'out'. Dono chalte hain. */
  direction: string
  party_name?: string | null
  payment_date: string
  amount: number
  method?: string | null
  bank_ref?: string | null
  notes?: string | null
  against?: { type: string; reference?: string | null } | null
}

/**
 * Paise ki rasid. Customer se paisa mile to "Receipt", kisi ko diya jaye to
 * "Voucher": kaghaz par saaf likha hota hai ke paisa kis taraf gaya.
 */
export function PaymentReceipt({
  payment, party, subtitle, reason, extraTotals = [], onClose,
}: {
  payment: PaymentDoc
  /** Agar API se naam na aaye to page khud bata deta hai. */
  party?: string
  subtitle?: string
  /** Kis cheez ka paisa, jab `against` na ho (jaise "Mazdoori"). */
  reason?: string
  /** Aur koi line jo is parchi par maani rakhti ho, jaise "Kul advance jama". */
  extraTotals?: { label: string; value: number }[]
  onClose: () => void
}) {
  // Factory 'receipt'/'payment' likhta hai, Resellers Point 'in'/'out'. Agar
  // sirf aik shakal maan li jaye to doosri taraf parchi ulti chhap jati hai.
  const incoming = payment.direction === 'receipt' || payment.direction === 'in'
  const detail = againstLine(payment.against) ?? reason ?? (incoming ? 'Paisa mila' : 'Paisa diya')

  return (
    <InvoiceSheet
      subtitle={subtitle}
      docType={incoming ? 'Payment Receipt' : 'Payment Voucher'}
      number={payment.reference}
      date={payment.payment_date}
      customer={payment.party_name || party || 'Walk-in'}
      partyLabel={incoming ? 'Paisa mila' : 'Paisa diya'}
      meta={via(payment.method, payment.bank_ref)}
      lines={[{ name: detail, qty: '', total: payment.amount }]}
      showQty={false}
      showRate={false}
      totals={[
        { label: incoming ? 'Kul paisa mila' : 'Kul paisa diya', value: payment.amount, strong: true },
        ...extraTotals,
      ]}
      footNote={payment.notes || undefined}
      onClose={onClose}
    />
  )
}

export interface PurchaseDoc {
  reference: string
  purchase_date: string
  supplier?: { name: string } | null
  raw_material?: { name: string } | null
  item?: { name: string; unit?: string } | null
  quantity: number
  unit_cost?: number
  loading_cost?: number
  unloading_cost?: number
  transport_cost?: number
  total_cost: number
  supplier_bill?: number
  paid_amount: number
  bank_ref?: string | null
  notes?: string | null
}

/** Maal khareedne ka bill. Factory aur Resellers Point, dono ka aik hi shape. */
export function PurchaseBill({ purchase, subtitle, onClose }: { purchase: PurchaseDoc; subtitle?: string; onClose: () => void }) {
  const unit = purchase.unit_cost ?? 0
  const goods = Math.round(purchase.quantity * unit)
  const bill = purchase.supplier_bill ?? purchase.total_cost
  const extras: { label: string; value: number }[] = [
    { label: 'Kiraya', value: purchase.transport_cost ?? 0 },
    { label: 'Loading', value: purchase.loading_cost ?? 0 },
    { label: 'Unloading', value: purchase.unloading_cost ?? 0 },
  ].filter((e) => e.value > 0)

  return (
    <InvoiceSheet
      subtitle={subtitle}
      docType="Purchase Bill"
      number={purchase.reference}
      date={purchase.purchase_date}
      customer={purchase.supplier?.name ?? 'Supplier'}
      partyLabel="Maal is se liya"
      meta={purchase.bank_ref ? `BANK (${purchase.bank_ref})` : undefined}
      lines={[{
        name: purchase.raw_material?.name ?? purchase.item?.name ?? 'Maal',
        qty: purchase.item?.unit ? `${purchase.quantity} ${purchase.item.unit}` : String(purchase.quantity),
        rate: unit,
        total: goods,
      }]}
      totals={[
        { label: 'Maal', value: goods },
        ...extras,
        { label: 'Kul lagat', value: purchase.total_cost, strong: true },
        ...(bill !== purchase.total_cost ? [{ label: 'Supplier ko dena', value: bill }] : []),
        { label: 'Diya', value: purchase.paid_amount },
        { label: 'Baqi', value: Math.max(bill - purchase.paid_amount, 0) },
      ]}
      footNote={purchase.notes || undefined}
      onClose={onClose}
    />
  )
}

export interface ExpenseDoc {
  reference: string
  expense_date: string
  category?: string | null
  title?: string | null
  amount: number
  method?: string | null
  bank_ref?: string | null
  notes?: string | null
}

/** Kharche ki parchi. */
export function ExpenseVoucher({ expense, onClose }: { expense: ExpenseDoc; onClose: () => void }) {
  return (
    <InvoiceSheet
      docType="Expense Voucher"
      number={expense.reference}
      date={expense.expense_date}
      customer={expense.category || 'Kharcha'}
      partyLabel="Kis mad me"
      meta={via(expense.method, expense.bank_ref)}
      lines={[{ name: expense.title || expense.category || 'Kharcha', qty: '', total: expense.amount }]}
      showQty={false}
      showRate={false}
      totals={[{ label: 'Kul kharcha', value: expense.amount, strong: true }]}
      footNote={expense.notes || undefined}
      onClose={onClose}
    />
  )
}

export interface TripDoc {
  reference: string
  trip_date: string
  kind?: string
  driver?: { name: string } | null
  vehicle_label?: string | null
  from_location?: string | null
  to_location?: string | null
  rate: number
  paid: number
  balance: number
  notes?: string | null
}

/** Driver ke kiraye ki parchi: maal laane ka ho ya bhejne ka. */
export function KirayaVoucher({ trip, onClose }: { trip: TripDoc; onClose: () => void }) {
  const inbound = trip.kind === 'in'
  const route = [trip.from_location, trip.to_location].filter(Boolean).join(' se ')

  return (
    <InvoiceSheet
      docType="Kiraya Voucher"
      number={trip.reference}
      date={trip.trip_date}
      customer={trip.driver?.name ?? 'Driver'}
      partyLabel="Driver"
      meta={inbound ? 'Maal laaya' : 'Maal bheja'}
      details={[trip.vehicle_label || '', route].filter(Boolean)}
      lines={[{
        name: inbound ? 'Maal laane ka kiraya' : 'Maal bhejne ka kiraya',
        qty: '',
        total: trip.rate,
      }]}
      showQty={false}
      showRate={false}
      totals={[
        { label: 'Kiraya', value: trip.rate, strong: true },
        { label: 'Diya', value: trip.paid },
        { label: 'Baqi', value: Math.max(trip.balance, 0) },
      ]}
      footNote={trip.notes || undefined}
      onClose={onClose}
    />
  )
}

export interface ReturnDoc {
  reference: string
  return_date: string
  customer?: { name: string } | null
  return_value: number
  deduction: number
  refund_amount: number
  refund_mode?: string | null
  notes?: string | null
  items?: { product_name?: string; item_name?: string; quantity: number; unit_price: number; line_total: number }[]
}

/** Maal wapsi ki parchi. */
export function ReturnNote({ ret, subtitle, onClose }: { ret: ReturnDoc; subtitle?: string; onClose: () => void }) {
  const mode: Record<string, string> = {
    cash: 'Cash wapas kiya',
    bank: 'Bank se wapas kiya',
    credit: 'Khate me jama kiya',
    adjust: 'Khate me jama kiya',
  }

  return (
    <InvoiceSheet
      subtitle={subtitle}
      docType="Return Note"
      number={ret.reference}
      date={ret.return_date}
      customer={ret.customer?.name ?? 'Walk-in'}
      partyLabel="Maal is ne wapas kiya"
      meta={ret.refund_mode ? mode[ret.refund_mode] ?? String(ret.refund_mode) : undefined}
      lines={(ret.items ?? []).map((it) => ({
        name: it.product_name ?? it.item_name ?? 'Item',
        qty: String(it.quantity),
        rate: it.unit_price,
        total: it.line_total,
      }))}
      totals={[
        { label: 'Wapas aaye maal ki qeemat', value: ret.return_value },
        ...(ret.deduction > 0 ? [{ label: 'Katauti', value: ret.deduction, sign: '-' }] : []),
        { label: 'Wapas karna bana', value: ret.refund_amount, strong: true },
      ]}
      footNote={ret.notes || undefined}
      onClose={onClose}
    />
  )
}

export interface AdjustmentDoc {
  reference: string
  adjustment_date: string
  mode: string
  amount: number
  reason?: string | null
  notes?: string | null
  party?: { name: string } | null
  party_name?: string | null
}

/** Khate ki durusti (adjustment) ki parchi. */
export function AdjustmentVoucher({ adjustment, onClose }: { adjustment: AdjustmentDoc; onClose: () => void }) {
  const what: Record<string, string> = {
    customer_charge: 'Customer ke khate me charge laga',
    customer_credit: 'Customer ke khate me chhoot di',
    supplier_charge: 'Supplier ke khate me charge laga',
    supplier_credit: 'Supplier ke khate me chhoot di',
  }

  return (
    <InvoiceSheet
      docType="Adjustment Voucher"
      number={adjustment.reference}
      date={adjustment.adjustment_date}
      customer={adjustment.party?.name ?? adjustment.party_name ?? 'Khata'}
      partyLabel="Kis ke khate me"
      lines={[{ name: what[adjustment.mode] ?? adjustment.mode, qty: '', total: adjustment.amount }]}
      showQty={false}
      showRate={false}
      totals={[{ label: 'Rakam', value: adjustment.amount, strong: true }]}
      footNote={adjustment.reason || adjustment.notes || undefined}
      onClose={onClose}
    />
  )
}

export interface SalaryDoc {
  reference: string
  staff_name?: string | null
  month: string
  amount: number
  paid: number
  balance: number
}

/** Tankhwa ki parchi. */
export function SalarySlip({ salary, staff, onClose }: { salary: SalaryDoc; staff?: string; onClose: () => void }) {
  return (
    <InvoiceSheet
      docType="Salary Slip"
      number={salary.reference}
      date={salary.month}
      customer={salary.staff_name || staff || 'Staff'}
      partyLabel="Mulazim"
      meta={`Mahina ${salary.month}`}
      lines={[{ name: `${salary.month} ki tankhwa`, qty: '', total: salary.amount }]}
      showQty={false}
      showRate={false}
      totals={[
        { label: 'Tankhwa', value: salary.amount, strong: true },
        { label: 'Diya', value: salary.paid },
        { label: 'Baqi', value: Math.max(salary.balance, 0) },
      ]}
      onClose={onClose}
    />
  )
}

export interface RentalDoc {
  reference: string
  customer?: { name: string } | null
  item_name: string
  unit?: string | null
  quantity: number
  per_day_rate: number
  start_date: string
  return_date?: string | null
  days: number
  accrued_total: number
  paid_amount: number
  outstanding: number
  notes?: string | null
}

/** Resellers Point ka kiraya (rental) ki parchi. */
export function RentalVoucher({ rental, onClose }: { rental: RentalDoc; onClose: () => void }) {
  return (
    <InvoiceSheet
      subtitle="Resellers Point"
      docType="Kiraya Bill"
      number={rental.reference}
      date={rental.return_date || rental.start_date}
      customer={rental.customer?.name ?? 'Walk-in'}
      partyLabel="Kiraye par is ne liya"
      meta={`${rental.days} din`}
      details={[`${rental.start_date} se ${rental.return_date || 'ab tak'}`]}
      lines={[{
        name: `${rental.item_name} (${rental.quantity}${rental.unit ? ' ' + rental.unit : ''}) x ${rental.days} din`,
        qty: String(rental.days),
        rate: rental.per_day_rate,
        total: rental.accrued_total,
      }]}
      totals={[
        { label: 'Kul kiraya', value: rental.accrued_total, strong: true },
        { label: 'Mila', value: rental.paid_amount },
        { label: 'Baqi', value: rental.outstanding },
      ]}
      footNote={rental.notes || undefined}
      onClose={onClose}
    />
  )
}
