<?php

namespace App\Services\Sales;

use App\Models\Account;
use App\Models\Customer;
use App\Models\Product;
use App\Models\SalesReturn;
use App\Services\Accounting\CashAccountResolver;
use App\Services\Accounting\LedgerService;
use App\Services\Inventory\InventoryService;
use App\Support\Sequence;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class SalesReturnService
{
    public function __construct(
        private LedgerService $ledger,
        private InventoryService $inventory,
    ) {}

    /**
     * Record a block return: blocks go back to ready stock and the customer is
     * refunded the goods value minus any deduction (kiraya / handling) the
     * factory keeps. Reverses revenue for the refunded portion only.
     *
     * @param  array{sale_id?:string,customer_id?:string,return_date:string,deduction?:int,refund_mode?:string,bank_ref?:string,notes?:string,items:array<int,array{product_id:string,quantity:int,unit_price:int}>}  $data
     */
    public function create(array $data): SalesReturn
    {
        if (empty($data['items'])) {
            throw new InvalidArgumentException('Return must have at least one item.');
        }

        return DB::transaction(function () use ($data) {
            $customer = isset($data['customer_id']) ? Customer::find($data['customer_id']) : null;

            $resolved = [];
            $returnValue = 0;
            foreach ($data['items'] as $item) {
                $product = Product::findOrFail($item['product_id']);
                $qty = (int) $item['quantity'];
                $unitPrice = (int) $item['unit_price'];
                $lineTotal = $qty * $unitPrice;
                $returnValue += $lineTotal;
                $resolved[] = compact('product', 'qty', 'unitPrice', 'lineTotal');
            }

            $deduction = (int) ($data['deduction'] ?? 0);
            if ($deduction > $returnValue) {
                throw new InvalidArgumentException('Deduction cannot exceed return value.');
            }
            $refund = $returnValue - $deduction;
            $mode = $data['refund_mode'] ?? 'cash';

            $return = SalesReturn::create([
                'reference' => Sequence::next('RET'),
                'sale_id' => $data['sale_id'] ?? null,
                'customer_id' => $customer?->id,
                'return_date' => $data['return_date'],
                'return_value' => $returnValue,
                'deduction' => $deduction,
                'refund_amount' => $refund,
                'refund_mode' => $mode,
                'bank_ref' => $data['bank_ref'] ?? null,
                'notes' => $data['notes'] ?? null,
                'created_by' => Auth::id(),
            ]);

            foreach ($resolved as $line) {
                $return->items()->create([
                    'product_id' => $line['product']->id,
                    'quantity' => $line['qty'],
                    'unit_price' => $line['unitPrice'],
                    'line_total' => $line['lineTotal'],
                ]);
                // blocks back into ready stock
                $this->inventory->recordReturn($line['product'], $line['qty'], $return);
            }

            // Reverse revenue by the refunded amount; the deduction stays earned.
            if ($refund > 0) {
                $creditAccount = $mode === 'account'
                    ? Account::RECEIVABLE      // reduce what the customer owes us
                    : CashAccountResolver::code($mode); // cash/bank paid back out

                if ($mode === 'account' && $customer) {
                    $customer->decrement('balance', $refund);
                }

                $this->ledger->post(
                    $data['return_date'],
                    "Block return {$return->reference}",
                    [
                        ['account' => Account::SALES, 'debit' => $refund, 'memo' => 'Sales return'],
                        ['account' => $creditAccount, 'credit' => $refund, 'memo' => $customer?->name],
                    ],
                    $return,
                );
            }

            return $return->load('items.product', 'customer');
        });
    }
}
