<?php

namespace App\Services\Suppliers;

use App\Models\Account;
use App\Models\Adjustment;
use App\Models\MaterialPurchase;
use App\Models\Payment;
use App\Models\Supplier;
use App\Services\Accounting\PartyStatement;
use Illuminate\Support\Collection;

/**
 * Everything that ever happened with one supplier, in one place.
 *
 * Mirror of CustomerHistoryService, on the other side of the books: the
 * running balance here is `suppliers.balance`, moved by exactly three events,
 * purchases, payments out, and manual supplier adjustments.
 *
 * Like the customer statement, this is built from the LEDGER (journal lines on
 * 2000 Accounts Payable), not from the documents, because a lump payment is
 * spread back over open bills and `material_purchases.paid_amount` keeps
 * changing afterwards. A journal line is written once and never moves.
 *
 * Money stays integer paisa throughout.
 */
class SupplierHistoryService
{
    public function __construct(private PartyStatement $statement) {}

    /**
     * Statement rows, oldest first, each carrying the running balance after it.
     *
     * @return array<int,array<string,mixed>>
     */
    public function ledger(Supplier $supplier): array
    {
        return $this->rows($this->purchases($supplier), $this->payments($supplier), $this->adjustments($supplier));
    }

    /** KPIs, the statement, and every document behind it. */
    public function history(Supplier $supplier): array
    {
        $purchases = $this->purchases($supplier);
        $payments = $this->payments($supplier);
        $adjustments = $this->adjustments($supplier);

        $docs = $this->docs($purchases, $payments, $adjustments);
        $ledger = $this->rows($purchases, $payments, $adjustments);
        $computed = $ledger === [] ? 0 : (int) end($ledger)['running'];
        $stored = (int) $supplier->balance;

        // Jo kiraya driver ko gaya wo supplier ke bill me nahi, magar maal ki
        // lagat me shaamil hai. Dono alag alag dikhana zaroori hai.
        $landed = (int) $purchases->sum('total_cost');
        $billed = (int) $purchases->sum(fn (MaterialPurchase $p) => $p->supplierBill());

        $dates = collect([$purchases->max('purchase_date'), $payments->max('payment_date')])
            ->filter()->map(fn ($d) => $d->toDateString())->sort()->values();

        return [
            'supplier' => $supplier,
            'summary' => [
                'purchases_count' => $purchases->count(),
                'landed_total' => $landed,
                'billed_total' => $billed,
                'freight_to_drivers' => $landed - $billed,
                'paid' => $this->statement->net([Account::CASH, Account::BANK], $docs, 'credit'),
                'adjustments' => (int) $adjustments->sum(fn (Adjustment $a) => $a->mode === 'supplier_charge' ? (int) $a->amount : -(int) $a->amount),
                // Dena wahi jo musbat ho. Minus ka matlab humne zyada de diya.
                'outstanding' => max($stored, 0),
                'advance' => max(-$stored, 0),
                'balance' => $stored,
                'first_activity' => $dates->first(),
                'last_activity' => $dates->last(),
                'ledger_balance' => $computed,
                'reconciled' => $computed === $stored,
            ],
            'purchases' => $purchases,
            'payments' => $payments,
            'adjustments' => $adjustments,
            'ledger' => $ledger,
        ];
    }

    /**
     * @param  Collection<int,MaterialPurchase>  $purchases
     * @param  Collection<int,Payment>  $payments
     * @param  Collection<int,Adjustment>  $adjustments
     * @return array<int,array<string,mixed>>
     */
    private function rows(Collection $purchases, Collection $payments, Collection $adjustments): array
    {
        // Khareed ki rows document se banti hain, journal se nahi. Journal par
        // sirf udhaar wala hissa hota hai, aur khate me poora bill nazar aana
        // chahiye: "maal liya 50,000, paisa diya 20,000, baqi 30,000".
        return $this->statement->rows(
            Account::PAYABLE,
            [
                Payment::class => ['payment', $payments->pluck('reference', 'id')],
                Adjustment::class => ['adjustment', $adjustments->pluck('reference', 'id')],
            ],
            'credit',
            $this->purchaseRows($purchases),
        );
    }

    /**
     * @param  Collection<int,MaterialPurchase>  $purchases
     * @return array<int,array<string,mixed>>
     */
    private function purchaseRows(Collection $purchases): array
    {
        $cashAtBuy = $this->statement
            ->lines([Account::CASH, Account::BANK], [MaterialPurchase::class => ['purchase', $purchases->pluck('reference', 'id')]], 'entry:id,source_type,source_id')
            ->groupBy(fn ($line) => $line->entry?->source_id)
            ->map(fn ($lines) => (int) $lines->sum('credit') - (int) $lines->sum('debit'));

        return $purchases->map(fn (MaterialPurchase $p) => [
            'date' => $p->purchase_date?->toDateString(),
            'at' => $p->created_at?->format('YmdHisu'),
            'type' => 'purchase',
            'reference' => $p->reference,
            'journal_ref' => $p->reference,
            'description' => $p->supplierBill() <= (int) $p->paid_amount ? 'Maal liya, paisa usi waqt diya' : 'Udhaar par maal liya',
            'credit' => $p->supplierBill(),
            'debit' => (int) ($cashAtBuy[$p->id] ?? 0),
            'link_id' => $p->id,
        ])->values()->all();
    }

    /**
     * @return array<class-string,array{0:string,1:Collection}>
     */
    private function docs(Collection $purchases, Collection $payments, Collection $adjustments): array
    {
        return [
            MaterialPurchase::class => ['purchase', $purchases->pluck('reference', 'id')],
            Payment::class => ['payment', $payments->pluck('reference', 'id')],
            Adjustment::class => ['adjustment', $adjustments->pluck('reference', 'id')],
        ];
    }

    /** @return Collection<int,MaterialPurchase> */
    private function purchases(Supplier $supplier): Collection
    {
        return MaterialPurchase::with(['rawMaterial:id,name,unit', 'trip.driver:id,name'])
            ->where('supplier_id', $supplier->id)
            ->orderByDesc('purchase_date')->orderByDesc('created_at')
            ->get();
    }

    /** @return Collection<int,Payment> */
    private function payments(Supplier $supplier): Collection
    {
        return Payment::where('party_type', $supplier->getMorphClass())
            ->where('party_id', $supplier->id)
            ->where('direction', Payment::PAYMENT)
            ->orderByDesc('payment_date')->orderByDesc('created_at')
            ->get();
    }

    /** @return Collection<int,Adjustment> */
    private function adjustments(Supplier $supplier): Collection
    {
        return Adjustment::where('party_type', $supplier->getMorphClass())
            ->where('party_id', $supplier->id)
            ->orderByDesc('adjustment_date')->orderByDesc('created_at')
            ->get();
    }
}
