<?php

namespace App\Services\Reseller;

use App\Models\Customer;
use App\Models\ResellerPayment;
use App\Models\ResellerRental;
use App\Models\ResellerSale;
use App\Models\ResellerSalesReturn;
use Illuminate\Support\Collection;

/**
 * RESELLERS POINT ONLY. One customer's whole record on this side of the house.
 *
 * The `customers` table is shared with the block factory, but nothing else is:
 * these dues live on `reseller_sales.balance` and on accrued kiraya, never on
 * `customers.balance`, and none of it touches the factory ledger. The factory's
 * own history has its own service and its own screens.
 *
 * Money stays integer paisa throughout.
 */
class ResellerCustomerHistoryService
{
    /** Every customer who owes Resellers Point something, biggest first. */
    public function dues(?string $search = null): Collection
    {
        $saleDue = ResellerSale::query()
            ->selectRaw('customer_id, SUM(balance) as due, COUNT(*) as invoices')
            ->whereNotNull('customer_id')
            ->groupBy('customer_id')
            ->get()
            ->keyBy('customer_id');

        $rentals = ResellerRental::whereNotNull('customer_id')->get()->groupBy('customer_id');

        $paid = ResellerPayment::query()
            ->selectRaw('customer_id, SUM(amount) as total')
            ->where('direction', ResellerPayment::IN)
            ->whereNotNull('customer_id')
            ->groupBy('customer_id')
            ->pluck('total', 'customer_id');

        $ids = collect($saleDue->keys())->merge($rentals->keys())->merge($paid->keys())->unique()->values();

        return Customer::whereIn('id', $ids)
            ->when($search, fn ($q, $s) => $q->where(fn ($q) => $q
                ->where('name', 'like', "%{$s}%")->orWhere('phone', 'like', "%{$s}%")))
            ->orderBy('name')
            ->get()
            ->map(function (Customer $c) use ($saleDue, $rentals, $paid) {
                $sale = (int) ($saleDue[$c->id]->due ?? 0);
                $kiraya = (int) ($rentals->get($c->id, collect())
                    ->sum(fn (ResellerRental $r) => max($r->currentAccrued() - (int) $r->paid_amount, 0)));

                return [
                    'id' => $c->id,
                    'name' => $c->name,
                    'phone' => $c->phone,
                    'invoices' => (int) ($saleDue[$c->id]->invoices ?? 0),
                    'sale_due' => $sale,
                    'kiraya_due' => $kiraya,
                    'received' => (int) ($paid[$c->id] ?? 0),
                    'outstanding' => $sale + $kiraya,
                ];
            })
            ->sortByDesc('outstanding')
            ->values();
    }

    /** KPIs plus every reseller document for one customer. */
    public function history(Customer $customer): array
    {
        $sales = $this->sales($customer);
        $receipts = $this->receipts($customer);
        $returns = $this->returns($customer);
        $rentals = $this->rentals($customer);

        $saleDue = (int) $sales->sum('balance');
        $rentalAccrued = (int) $rentals->sum(fn (ResellerRental $r) => $r->currentAccrued());
        $rentalPaid = (int) $rentals->sum('paid_amount');
        $rentalDue = (int) $rentals->sum(fn (ResellerRental $r) => max($r->currentAccrued() - (int) $r->paid_amount, 0));

        $dates = collect([$sales->max('sale_date'), $receipts->max('payment_date'), $rentals->max('start_date')])
            ->filter()->map(fn ($d) => $d->toDateString())->sort()->values();

        return [
            'customer' => $customer,
            'summary' => [
                'sales_count' => $sales->count(),
                'sales_total' => (int) $sales->sum('total'),
                'sale_due' => $saleDue,
                // Receipts me mauqe par mila hua paisa bhi likha jata hai
                // (ResellerSalesService har paid par ek IN row banati hai),
                // is liye ye akela hi poora wasool shuda paisa hai.
                'received' => (int) $receipts->sum('amount'),
                'returned' => (int) $returns->sum('refund_amount'),
                'rental_count' => $rentals->count(),
                'rental_accrued' => $rentalAccrued,
                'rental_paid' => $rentalPaid,
                'rental_due' => $rentalDue,
                'outstanding' => $saleDue + $rentalDue,
                'first_activity' => $dates->first(),
                'last_activity' => $dates->last(),
            ],
            'sales' => $sales,
            'receipts' => $receipts,
            'returns' => $returns,
            'rentals' => $rentals->map(fn (ResellerRental $r) => [
                'id' => $r->id,
                'reference' => $r->reference,
                'item_name' => $r->item_name,
                'unit' => $r->unit,
                'quantity' => (float) $r->quantity,
                'per_day_rate' => (int) $r->per_day_rate,
                'start_date' => $r->start_date?->toDateString(),
                'return_date' => $r->return_date?->toDateString(),
                'days' => $r->chargeableDays(),
                'accrued' => $r->currentAccrued(),
                'paid_amount' => (int) $r->paid_amount,
                'due' => max($r->currentAccrued() - (int) $r->paid_amount, 0),
                'status' => $r->status,
            ])->values(),
        ];
    }

    /** @return Collection<int,ResellerSale> */
    private function sales(Customer $customer): Collection
    {
        return ResellerSale::with('items.item:id,name,unit')
            ->where('customer_id', $customer->id)
            ->orderByDesc('sale_date')->orderByDesc('created_at')
            ->get();
    }

    /** @return Collection<int,ResellerPayment> */
    private function receipts(Customer $customer): Collection
    {
        return ResellerPayment::where('customer_id', $customer->id)
            ->where('direction', ResellerPayment::IN)
            ->orderByDesc('payment_date')->orderByDesc('created_at')
            ->get();
    }

    /** @return Collection<int,ResellerSalesReturn> */
    private function returns(Customer $customer): Collection
    {
        return ResellerSalesReturn::where('customer_id', $customer->id)
            ->orderByDesc('return_date')->orderByDesc('created_at')
            ->get();
    }

    /** @return Collection<int,ResellerRental> */
    private function rentals(Customer $customer): Collection
    {
        return ResellerRental::where('customer_id', $customer->id)
            ->orderByDesc('start_date')->orderByDesc('created_at')
            ->get();
    }
}
