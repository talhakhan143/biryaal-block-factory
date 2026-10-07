/**
 * Har wo query key jo kisi paise wale event ke baad purani ho jati hai.
 *
 * Project me koi staleTime nahi hai aur refetchOnWindowFocus band hai, is liye
 * jo key invalidate hona bhool jaye wo screen remount tak galat figure dikhati
 * rehti hai. Isi liye ye list aik hi jagah rehti hai: nayi screen banaye to
 * sirf yahan register karein.
 */
export const MONEY_KEYS = [
  'customers', 'customer-history', 'customer-ledger',
  'sales', 'sale', 'payments', 'payables', 'advances',
  'purchases', 'suppliers', 'supplier-ledger',
  'drivers', 'transport-trips', 'dispatches-pending',
  'expenses', 'expenses/summary',
  'dashboard', 'cash-book', 'trial-balance', 'profit-loss', 'account-ledger',
  'products', 'raw-materials', 'inventory',
] as const

/** Reseller ki apni books, factory se bilkul alag. */
export const RESELLER_MONEY_KEYS = [
  'reseller/customers', 'reseller/sales', 'reseller/payments',
  'reseller/receivables', 'reseller/payables', 'reseller/rentals',
  'reseller/returns', 'reseller/items', 'reseller/purchases',
  'reseller/suppliers', 'reseller/dashboard',
] as const
