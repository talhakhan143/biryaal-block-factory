<?php

namespace App\Services\Customers;

use App\Models\Account;
use App\Models\Adjustment;
use App\Models\Customer;
use App\Models\Dispatch;
use App\Models\Payment;
use App\Models\Sale;
use App\Models\SalesReturn;
use App\Services\Accounting\PartyStatement;
use Illuminate\Support\Collection;

/**
 * Everything that ever happened with one customer, in one place.
 *
 * BLOCK FACTORY ONLY. Resellers Point runs its own books on its own screens
 * (see ResellerCustomerHistoryService); the two are never mixed, even though
 * they share the `customers` table.
 *
 * The running balance here IS `customers.balance`, moved by exactly four
 * events: sales, receipts, sales returns refunded to account, and manual
 * customer adjustments. Money stays integer paisa throughout.
 */
class CustomerHistoryService
{
    public function __construct(private PartyStatement $statement) {}

    /**
     * Factory statement rows, oldest first, each carrying the running balance
     * after it.
     *
     * Built from the LEDGER (every journal line that touches 1100 Accounts
     * Receivable for this customer's documents), not from the documents
     * themselves. That matters: a receipt is spread back over open invoices by
     * PaymentService::allocateToCustomerSales, so `sales.paid` keeps changing
     * after the sale and crediting it here would count the same money twice.
     * A journal line is written once and never moves, so the running total
     * lands exactly on `customers.balance`.
     *
     * @return array<int,array<string,mixed>>
     */
    public function factoryLedger(Customer $customer): array
    {
        return $this->ledgerRows(
            $this->sales($customer),
            $this->receipts($customer),
            $this->returns($customer),
            $this->adjustments($customer),
        );
    }

    /**
     * @param  Collection<int,Sale>  $sales
     * @param  Collection<int,Payment>  $receipts
     * @param  Collection<int,SalesReturn>  $returns
     * @param  Collection<int,Adjustment>  $adjustments
     * @return array<int,array<string,mixed>>
     */
    private function ledgerRows(Collection $sales, Collection $receipts, Collection $returns, Collection $adjustments): array
    {
        // Sale ki rows document se banti hain, journal se nahi. Journal par
        // sirf udhaar wala hissa hota hai, aur khate me poora bill nazar aana
        // chahiye: "maal diya 35,500, paisa mila 20,000, baqi 15,500".
        return $this->statement->rows(
            Account::RECEIVABLE,
            $this->moneyDocs($receipts, $returns, $adjustments),
            'debit',
            $this->saleRows($sales),
        );
    }

    /**
     * Har bikri aik row: poora bill charge me, aur jo paisa usi waqt counter
     * par mila wo credit me. Dono ka farq wahi hai jo receivable par chadha,
     * is liye running total bilkul theek rehta hai. Cash bikri me dono barabar
     * hote hain, yani baqi par asar sifar magar khate me mojood.
     *
     * @param  Collection<int,Sale>  $sales
     * @return array<int,array<string,mixed>>
     */
    private function saleRows(Collection $sales): array
    {
        $cashAtSale = $this->statement
            ->lines([Account::CASH, Account::BANK], [Sale::class => ['sale', $sales->pluck('invoice_no', 'id')]], 'entry:id,source_type,source_id')
            ->groupBy(fn ($line) => $line->entry?->source_id)
            ->map(fn ($lines) => (int) $lines->sum('debit') - (int) $lines->sum('credit'));

        return $sales->map(fn (Sale $s) => [
            'date' => $s->sale_date?->toDateString(),
            'at' => $s->created_at?->format('YmdHisu'),
            'type' => 'sale',
            'reference' => $s->invoice_no,
            'journal_ref' => $s->invoice_no,
            'description' => $s->type === 'cash' ? 'Maal diya, paisa usi waqt mila' : 'Udhaar par maal diya',
            'debit' => (int) $s->total,
            'credit' => (int) ($cashAtSale[$s->id] ?? 0),
            'link_id' => $s->id,
        ])->values()->all();
    }

    /**
     * Journal se banne wali rows: receipt, return aur adjustment. Sale yahan
     * nahi hai kyunki uski row upar document se banti hai.
     *
     * @return array<class-string,array{0:string,1:Collection}>
     */
    private function moneyDocs(Collection $receipts, Collection $returns, Collection $adjustments): array
    {
        return [
            Payment::class => ['receipt', $receipts->pluck('reference', 'id')],
            SalesReturn::class => ['return', $returns->pluck('reference', 'id')],
            Adjustment::class => ['adjustment', $adjustments->pluck('reference', 'id')],
        ];
    }

    /** Full dossier: KPIs, the factory statement, and every document behind it. */
    public function history(Customer $customer): array
    {
        $sales = $this->sales($customer);
        $receipts = $this->receipts($customer);
        $returns = $this->returns($customer);
        $adjustments = $this->adjustments($customer);
        $dispatches = $this->dispatches($customer);

        // `received` ke liye saare documents chahiye, khate ke liye nahi.
        $docs = [
            Sale::class => ['sale', $sales->pluck('invoice_no', 'id')],
        ] + $this->moneyDocs($receipts, $returns, $adjustments);
        $ledger = $this->ledgerRows($sales, $receipts, $returns, $adjustments);
        $computed = $ledger === [] ? 0 : (int) end($ledger)['running'];
        $stored = (int) $customer->balance;

        $dates = collect([
            $sales->max('sale_date'),
            $receipts->max('payment_date'),
        ])->filter()->map(fn ($d) => $d->toDateString())->sort()->values();

        return [
            'customer' => $customer,
            'summary' => [
                'factory' => [
                    'sales_count' => $sales->count(),
                    'sales_total' => (int) $sales->sum('total'),
                    // Minus balance = customer ka paisa hamare paas pada hai.
                    'advance' => max(-$stored, 0),
                    // Kitne block uthaye, aur un me se kitne udhaar par.
                    'blocks' => (int) $sales->sum(fn (Sale $s) => (int) $s->items->sum('quantity')),
                    'blocks_on_credit' => (int) $sales->where('type', 'credit')
                        ->sum(fn (Sale $s) => (int) $s->items->sum('quantity')),
                    'credit_sales_count' => $sales->where('type', 'credit')->count(),
                    'credit_total' => (int) $sales->where('type', 'credit')->sum('total'),
                    // Cash ki legs se, documents ke paid column se nahi: wo badalta rehta hai.
                    'received' => $this->statement->net([Account::CASH, Account::BANK], $docs, 'debit'),
                    'returned' => (int) $returns->sum('refund_amount'),
                    'adjustments' => (int) $adjustments->sum(fn (Adjustment $a) => $a->mode === 'customer_charge' ? (int) $a->amount : -(int) $a->amount),
                    'dispatch_count' => $dispatches->count(),
                    // Lena wahi hai jo musbat ho. Minus wala hissa advance hai,
                    // wo upar alag se jata hai, warna "lena hai" minus me dikhta.
                    'outstanding' => max($stored, 0),
                    // Signed balance, khate ke milaan ke liye.
                    'balance' => $stored,
                ],
                'first_activity' => $dates->first(),
                'last_activity' => $dates->last(),
                // Statement ka jorh stored balance se match karna chahiye. Na kare
                // to UI warning dikhata hai, chup chaap galat figure nahi.
                'ledger_balance' => $computed,
                'reconciled' => $computed === $stored,
            ],
            'ledger' => $ledger,
            'sales' => $sales,
            'receipts' => $receipts,
            'returns' => $returns,
            'adjustments' => $adjustments,
            'dispatches' => $dispatches,
        ];
    }

    /** @return Collection<int,Sale> */
    private function sales(Customer $customer): Collection
    {
        return Sale::with('items.product:id,name,unit')
            ->where('customer_id', $customer->id)
            ->orderByDesc('sale_date')->orderByDesc('created_at')
            ->get();
    }

    /** @return Collection<int,Payment> */
    private function receipts(Customer $customer): Collection
    {
        return Payment::where('party_type', $customer->getMorphClass())
            ->where('party_id', $customer->id)
            ->where('direction', Payment::RECEIPT)
            ->orderByDesc('payment_date')->orderByDesc('created_at')
            ->get();
    }

    /** @return Collection<int,SalesReturn> */
    private function returns(Customer $customer): Collection
    {
        return SalesReturn::with('items.product:id,name')
            // Apna customer_id ho to wahi chalta hai. Jo row bina customer ke
            // bani ho (dono services usay allow karti hain) sirf wo invoice ke
            // zariye yahan aati hai, warna doosre customer ki row ghus jayegi.
            ->where(fn ($q) => $q->where('customer_id', $customer->id)
                ->orWhere(fn ($q) => $q->whereNull('customer_id')
                    ->whereIn('sale_id', Sale::where('customer_id', $customer->id)->select('id'))))
            ->orderByDesc('return_date')->orderByDesc('created_at')
            ->get();
    }

    /** @return Collection<int,Adjustment> */
    private function adjustments(Customer $customer): Collection
    {
        return Adjustment::where('party_type', $customer->getMorphClass())
            ->where('party_id', $customer->id)
            ->orderByDesc('adjustment_date')->orderByDesc('created_at')
            ->get();
    }

    /** @return Collection<int,Dispatch> */
    private function dispatches(Customer $customer): Collection
    {
        return Dispatch::with(['items.product:id,name', 'driver:id,name', 'vehicle:id,name,plate'])
            // Apna customer_id ho to wahi chalta hai. Jo row bina customer ke
            // bani ho (dono services usay allow karti hain) sirf wo invoice ke
            // zariye yahan aati hai, warna doosre customer ki row ghus jayegi.
            ->where(fn ($q) => $q->where('customer_id', $customer->id)
                ->orWhere(fn ($q) => $q->whereNull('customer_id')
                    ->whereIn('sale_id', Sale::where('customer_id', $customer->id)->select('id'))))
            ->orderByDesc('dispatch_date')->orderByDesc('created_at')
            ->get();
    }
}
