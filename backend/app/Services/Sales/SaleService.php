<?php

namespace App\Services\Sales;

use App\Models\Account;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Sale;
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
            $paid = $type === 'cash' ? $total : (int) ($data['paid'] ?? 0);
            $paid = min($paid, $total);
            $balance = $total - $paid;

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

            if ($balance > 0 && $customer) {
                $customer->increment('balance', $balance);
            }

            // journal: Dr Cash/Bank (paid) + Dr Receivable (balance); Cr Sales (total)
            $cashAccount = CashAccountResolver::code($data['payment_method'] ?? 'cash');
            $lines = [];
            if ($paid > 0) {
                $lines[] = ['account' => $cashAccount, 'debit' => $paid];
            }
            if ($balance > 0) {
                $lines[] = ['account' => Account::RECEIVABLE, 'debit' => $balance, 'memo' => $customer?->name];
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

    private function status(int $total, int $paid): string
    {
        if ($paid <= 0) {
            return 'unpaid';
        }

        return $paid >= $total ? 'paid' : 'partial';
    }
}
