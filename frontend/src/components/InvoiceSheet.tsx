import { formatPaisa } from '../lib/money'
import { Button } from './ui'

export interface InvoiceLine { name: string; qty: string; rate?: number; total?: number }
export interface InvoiceTotal { label: string; value: number; strong?: boolean; sign?: string }

interface Props {
  subtitle?: string        // e.g. "Resellers Point" (omit for block factory)
  docType: string          // "Sales Invoice" | "Dispatch Challan" …
  number: string
  date: string
  customer: string
  meta?: string            // right-side small line (payment / type)
  details?: string[]       // extra left lines under customer (Driver, Kiraya, …)
  lines: InvoiceLine[]
  showRates?: boolean      // false = challan (only # / Item / Qty)
  totals?: InvoiceTotal[]  // omit for a challan
  onClose: () => void
}

/**
 * Full A4-page invoice/challan. Screen preview mimics an A4 sheet; the shared
 * @media print CSS (print-area) prints it across a real A4 page.
 */
export default function InvoiceSheet({ subtitle, docType, number, date, customer, meta, details, lines, showRates = true, totals, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/50 p-4" onClick={onClose}>
      <div
        className="print-area my-4 w-full rounded-lg bg-white text-slate-900 shadow-2xl"
        style={{ maxWidth: '800px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-10">
          {/* Header */}
          <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Baryal Block Factory" className="h-20 w-auto object-contain" />
              <div>
                <div className="text-2xl font-extrabold leading-tight text-slate-900">Baryal Block Factory</div>
                {subtitle && <div className="text-sm font-semibold text-slate-500">{subtitle}</div>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-extrabold uppercase tracking-wide text-slate-800">{docType}</div>
              <div className="mt-1 font-mono text-sm text-slate-700">{number}</div>
              <div className="text-sm text-slate-500">{date}</div>
            </div>
          </div>

          {/* Bill To / meta */}
          <div className="mt-6 flex items-start justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Bill To</div>
              <div className="text-base font-semibold text-slate-900">{customer}</div>
              {details && details.length > 0 && (
                <div className="mt-1 space-y-0.5 text-sm text-slate-600">
                  {details.map((d, i) => <div key={i}>{d}</div>)}
                </div>
              )}
            </div>
            {meta && <div className="text-right text-sm text-slate-500">{meta}</div>}
          </div>

          {/* Items */}
          <table className="mt-6 w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Item</th>
                <th className="px-3 py-2 text-right font-semibold">Qty</th>
                {showRates && <th className="px-3 py-2 text-right font-semibold">Rate</th>}
                {showRates && <th className="px-3 py-2 text-right font-semibold">Amount</th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-slate-200">
                  <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">{l.name}</td>
                  <td className="px-3 py-2 text-right">{l.qty}</td>
                  {showRates && <td className="px-3 py-2 text-right">{formatPaisa(l.rate ?? 0)}</td>}
                  {showRates && <td className="px-3 py-2 text-right font-medium">{formatPaisa(l.total ?? 0)}</td>}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          {totals && totals.length > 0 && (
            <div className="mt-6 flex justify-end">
              <div className="w-72 space-y-1 text-sm">
                {totals.map((t, i) => (
                  <div key={i} className={`flex justify-between ${t.strong ? 'border-t border-slate-300 pt-2 text-base font-bold' : ''}`}>
                    <span className={t.strong ? 'text-slate-900' : 'text-slate-500'}>{t.label}</span>
                    <span>{t.sign ?? ''}{formatPaisa(t.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signature line for challan (no totals) */}
          {(!totals || totals.length === 0) && (
            <div className="mt-16 flex justify-between text-xs text-slate-400">
              <span>Received by ____________________</span>
              <span>Signature ____________________</span>
            </div>
          )}

          {/* Footer */}
          <div className="mt-10 border-t border-slate-200 pt-3 text-center text-[11px] text-slate-400">
            Software Developed by Talha Khan, WhatsApp 0336-8469404
          </div>
        </div>

        <div className="no-print flex gap-2 border-t border-slate-100 p-4">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Close</Button>
          <Button className="flex-1" onClick={() => window.print()}>Print</Button>
        </div>
      </div>
    </div>
  )
}
