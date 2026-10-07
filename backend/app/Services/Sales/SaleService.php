<?php

namespace App\Services\Sales;

use App\Models\Account;
use App\Models\Customer;
use App\Models\JournalEntry;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SalesReturn;
use App\Services\Accounting\CashAccountResolver;
use App\Services\Accounting\LedgerService;
use App\Services\Inventory\InventoryService;
use App\Support\Sequence;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class SaleService
{
    public function __construct(
        private LedgerService $ledger,
        private InventoryService $inventory,
    ) {}

    /**
     * @param  array{customer_id?:string,sale_date:string,type:string,discount?:int,paid?:int,payment_method?:string,notes?:string,items:array<int,array{product_id:string,quantity:int,unit_price?:int}>}  $data
     */
    public function create(array $data): Sale
    {
        if (empty($data['items'])) {
            throw new InvalidArgumentException('A sale must have at least one item.');
        }

        return DB::transaction(function () use ($data) {
            $customer = isset($data['customer_id'])
                ? Customer::findOrFail($data['customer_id'])
                : null;

            if (($data['type'] ?? 'cash') === 'credit' && ! $customer) {
                throw new InvalidArgumentException('Credit sales require a customer.');
            }

            // Build line items, resolving prices and validating stock.
            $resolved = [];
            $subtotal = 0;
            foreach ($data['items'] as $item) {
                $product = Product::findOrFail($item['product_id']);
                $qty = (int) $item['quantity'];
                $unitPrice = (int) ($item['unit_price'] ?? $product->sale_price);
                $lineTotal = $qty * $unitPrice;
                $subtotal += $lineTotal;

                $resolved[] = compact('product', 'qty', 'unitPrice', 'lineTotal');
            }

            $discount = (int) ($data['discount'] ?? 0);
            $fare = (int) ($data['transport_fare'] ?? 0); // freight paid by customer (pass-through)
            $goodsNet = $subtotal - $discount;
            if ($goodsNet < 0) {
                throw new InvalidArgumentException('Discount cannot exceed subtotal.');
            }
            $total = $goodsNet + $fare;

            $type = $data['type'] ?? 'cash';
            // Cash jo abhi counter par mila.
            $cashPaid = $type === 'cash' ? $total : (int) ($data['paid'] ?? 0);
            $cashPaid = min($cashPaid, $total);

            // Agar customer ka advance pada hai to baqi usi me se kat jata hai.
            // customers.balance minus me ho = utna paisa hum ne pakad rakha hai.
            $advanceHeld = $customer ? max(-(int) $customer->balance, 0) : 0;
            $advanceUsed = min($advanceHeld, $total - $cashPaid);

            $paid = $cashPaid + $advanceUsed;
            $balance = $total - $paid;

            // Receivable utna hi hilta hai jitna cash nahi mila. Advance usi
            // control account me credit para tha, is liye ye ghat usay khapa
            // deti hai aur bacha hua hissa naya udhaar ban jata hai.
            $receivableDelta = $total - $cashPaid;

            $sale = Sale::create([
                'invoice_no' => Sequence::next('INV'),
                'customer_id' => $customer?->id,
                'sale_date' => $data['sale_date'],
                'type' => $type,
                'subtotal' => $subtotal,
                'discount' => $discount,
                'transport_fare' => $fare,
                'total' => $total,
                'paid' => $paid,
                'balance' => $balance,
                'status' => $this->status($total, $paid),
                'payment_method' => $data['payment_method'] ?? ($paid > 0 ? 'cash' : null),
                'bank_ref' => $data['bank_ref'] ?? null,
                'notes' => $data['notes'] ?? null,
                'created_by' => Auth::id(),
            ]);

            foreach ($resolved as $line) {
                $sale->items()->create([
                    'product_id' => $line['product']->id,
                    'quantity' => $line['qty'],
                    'unit_price' => $line['unitPrice'],
                    'line_total' => $line['lineTotal'],
                ]);

                // decrement ready stock (throws if insufficient)
                $this->inventory->consumeReady($line['product'], $line['qty'], $sale);
            }

            if ($receivableDelta > 0 && $customer) {
                $customer->increment('balance', $receivableDelta);
            }

            // journal: Dr Cash/Bank (jo abhi mila) + Dr Receivable (baqi, advance samet); Cr Sales
            $cashAccount = CashAccountResolver::code($data['payment_method'] ?? 'cash');
            $lines = [];
            if ($cashPaid > 0) {
                $lines[] = ['account' => $cashAccount, 'debit' => $cashPaid];
            }
            if ($receivableDelta > 0) {
                $lines[] = ['account' => Account::RECEIVABLE, 'debit' => $receivableDelta, 'memo' => $customer?->name];
            }
            $lines[] = ['account' => Account::SALES, 'credit' => $goodsNet, 'memo' => 'Block sale'];
            if ($fare > 0) {
                // freight collected on behalf of the driver — a liability, not revenue
                $lines[] = ['account' => Account::TRANSPORT_CLEARING, 'credit' => $fare, 'memo' => 'Freight collected'];
            }

            $this->ledger->post(
                $data['sale_date'],
                "Sale {$sale->invoice_no}",
                $lines,
                $sale,
            );

            return $sale->load('items.product', 'customer');
        });
    }

    /**
     * Delete a wrongly-entered sale and unwind everything it touched:
     * blocks return to ready stock, the customer's receivable is reversed,
     * and the sale's balanced journal entry is removed (trial balance stays
     * balanced). Blocked once the goods are out or money has moved against it.
     */
    public function void(Sale $sale): void
    {
        DB::transaction(function () use ($sale) {
            if ($sale->dispatches()->exists()) {
                throw new InvalidArgumentException('Is order ki delivery (challan) ho chuki — pehle wo handle karein, phir delete.');
            }
            if (SalesReturn::where('sale_id', $sale->id)->exists()) {
                throw new InvalidArgumentException('Is invoice par block return mojood hai — delete nahi ho sakta.');
            }
            if ($sale->allocatedPayments()->exists()) {
                throw new InvalidArgumentException('Is invoice par alag se payment receive ho chuki — pehle wo reverse karein, phir delete.');
            }

            $sale->load('items.product', 'customer');

            // blocks back into ready stock
            foreach ($sale->items as $item) {
                if ($item->product) {
                    $this->inventory->reverseSale($item->product, (int) $item->quantity, $sale);
                }
            }

            $entries = JournalEntry::where('source_type', $sale->getMorphClass())
                ->where('source_id', $sale->id)
                ->with('lines.account')
                ->get();

            // Reverse exactly what the sale put on the receivable. Sale.balance
            // alone is not that number: an advance may have paid part of this
            // invoice, and that part still moved the control account.
            $receivableDelta = (int) $entries->flatMap->lines
                ->filter(fn ($l) => $l->account?->code === Account::RECEIVABLE)
                ->sum(fn ($l) => (int) $l->debit - (int) $l->credit);
            if ($receivableDelta > 0 && $sale->customer) {
                $sale->customer->decrement('balance', $receivableDelta);
            }

            // remove the sale's journal entry (+ lines) so the books net to zero
            $entries->each(function (JournalEntry $entry) {
                $entry->lines()->delete();
                $entry->delete();
            });

            $sale->items()->delete();
            $sale->delete();
        });
    }

    private function status(int $total, int $paid): string
    {
        if ($paid <= 0) {
            return 'unpaid';
        }

        return $paid >= $total ? 'paid' : 'partial';
    }
}
