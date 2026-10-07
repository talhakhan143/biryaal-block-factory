<?php

namespace App\Services\Sales;

use App\Models\Customer;
use App\Models\Sale;

/**
 * Keeps a customer's invoices in step with their balance.
 *
 * `customers.balance` is the ledger-backed truth; `sales.paid` is only a
 * convenience so the Sales screen can show which bill is settled. Anything
 * that moves the balance without touching invoices (an advance taken while
 * bills are open, a void that frees an advance back into the pool) leaves
 * those two telling different stories, and the money in the gap can then be
 * neither collected nor refunded.
 *
 * So after any such event, rebuild the whole picture from the balance:
 * oldest invoice first, until the paid pool runs out.
 */
class InvoiceAllocator
{
    /** @return int how many invoice rows actually changed */
    public function rebuild(Customer $customer): int
    {
        $sales = Sale::where('customer_id', $customer->getKey())
            ->orderBy('sale_date')->orderBy('created_at')
            ->get();

        if ($sales->isEmpty()) {
            return 0;
        }

        // Jitna paisa invoices par lag chuka hai. Minus balance (advance) ka
        // matlab sab bills poore hain aur upar se paisa bacha hua hai, is liye
        // balance ko sifar par clamp karte hain.
        $pool = max(0, (int) $sales->sum('total') - max((int) $customer->balance, 0));
        $changed = 0;

        foreach ($sales as $sale) {
            $total = (int) $sale->total;
            $apply = max(0, min($pool, $total));
            $status = $apply <= 0 ? 'unpaid' : ($apply >= $total ? 'paid' : 'partial');

            if ((int) $sale->paid !== $apply || $sale->status !== $status) {
                $sale->update(['paid' => $apply, 'balance' => $total - $apply, 'status' => $status]);
                $changed++;
            }

            $pool -= $apply;
        }

        return $changed;
    }
}
