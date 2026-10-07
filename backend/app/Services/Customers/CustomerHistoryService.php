<?php

namespace App\Services\Customers;

use App\Models\Account;
use App\Models\Adjustment;
use App\Models\Customer;
use App\Models\Dispatch;
use App\Models\JournalLine;
use App\Models\Payment;
use App\Models\Sale;
use App\Models\SalesReturn;
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
        // Har document type ke apne ids, taake (source_type, source_id) ka jorh
        // theek match ho aur kisi doosray document ki row na aa jaye.
        $docs = [
            Sale::class => ['sale', $sales->pluck('invoice_no', 'id')],
            Payment::class => ['receipt', $receipts->pluck('reference', 'id')],
            SalesReturn::class => ['return', $returns->pluck('reference', 'id')],
            Adjustment::class => ['adjustment', $adjustments->pluck('reference', 'id')],
        ];

        $lines = $this->linesOn([Account::RECEIVABLE], $docs, 'entry:id,reference,entry_date,description,source_type,source_id,created_at')
            ->filter(fn (JournalLine $l) => $l->entry !== null)
            // Date pehle, phir jis tarteeb se post hui. Dono ko aik string me
            // jorh kar sort karte hain taake aik hi din ki rows bhi stable rahen.
            ->sortBy(fn (JournalLine $l) => $l->entry->entry_date?->toDateString().'|'.$l->entry->created_at?->format('YmdHisu'))
            ->values();

        $running = 0;

        return $lines->map(function (JournalLine $line) use (&$running, $docs) {
            $entry = $line->entry;
            [$type, $ids] = $docs[$entry->source_type] ?? ['other', collect()];
            $debit = (int) $line->debit;
            $credit = (int) $line->credit;
            $running += $debit - $credit;

            return [
                'date' => $entry->entry_date?->toDateString(),
                'type' => $type,
                'reference' => $ids->get($entry->source_id) ?? $entry->reference,
                'journal_ref' => $entry->reference,
                'description' => $entry->description,
                'debit' => $debit,
                'credit' => $credit,
                'running' => $running,
                'link_id' => $entry->source_id,
            ];
        })->all();
    }

    /** Full dossier: KPIs, the factory statement, and every document behind it. */
    public function history(Customer $customer): array
    {
        $sales = $this->sales($customer);
        $receipts = $this->receipts($customer);
        $returns = $this->returns($customer);
        $adjustments = $this->adjustments($customer);
        $dispatches = $this->dispatches($customer);

        $docs = [
            Sale::class => ['sale', $sales->pluck('invoice_no', 'id')],
            Payment::class => ['receipt', $receipts->pluck('reference', 'id')],
            SalesReturn::class => ['return', $returns->pluck('reference', 'id')],
            Adjustment::class => ['adjustment', $adjustments->pluck('reference', 'id')],
        ];
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
                    'received' => $this->cashReceived($docs),
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

    /**
     * Journal lines on the given accounts that belong to this customer's own
     * documents. `$docs` maps a model class to [label, id => reference].
     *
     * @param  string[]  $codes
     * @param  array<class-string,array{0:string,1:Collection}>  $docs
     * @return Collection<int,JournalLine>
     */
    private function linesOn(array $codes, array $docs, ?string $with = null): Collection
    {
        $accounts = Account::whereIn('code', $codes)->pluck('id');
        $live = array_filter($docs, fn (array $d) => $d[1]->isNotEmpty());
        if ($accounts->isEmpty() || $live === []) {
            return collect();
        }

        return JournalLine::query()
            ->when($with, fn ($q, $w) => $q->with($w))
            ->whereIn('account_id', $accounts)
            ->where(function ($q) use ($live) {
                foreach ($live as $class => [, $ids]) {
                    $q->orWhereHas('entry', fn ($e) => $e->where('source_type', $class)->whereIn('source_id', $ids->keys()));
                }
            })
            ->get();
    }

    /**
     * Cash that actually came in from this customer, net of cash/bank refunds.
     *
     * Read off the Cash and Bank legs rather than added up from the documents:
     * a sale's `paid` column keeps growing as later receipts are allocated back
     * onto it, so sales.paid + receipts would count the same rupee twice.
     *
     * @param  array<class-string,array{0:string,1:Collection}>  $docs
     */
    private function cashReceived(array $docs): int
    {
        $lines = $this->linesOn([Account::CASH, Account::BANK], $docs);

        return (int) $lines->sum('debit') - (int) $lines->sum('credit');
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
