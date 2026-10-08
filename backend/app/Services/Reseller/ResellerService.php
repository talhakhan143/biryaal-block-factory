<?php

namespace App\Services\Reseller;

use App\Models\Customer;
use App\Models\Driver;
use App\Models\ResellerDispatch;
use App\Models\ResellerItem;
use App\Models\ResellerPayment;
use App\Models\ResellerPurchase;
use App\Models\ResellerRental;
use App\Models\ResellerSale;
use App\Models\ResellerSupplier;
use App\Support\Sequence;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Resellers Point business logic. Fully self-contained books, no posting to
 * the block factory ledger. Money is tracked via supplier balances, purchase
 * paid_amount, rental paid_amount and the reseller_payments cash log.
 */
class ResellerService
{
    /**
     * Buy stock from a reseller supplier. Increases item stock, updates the
     * item's moving-average cost, and bills the supplier (udhaar for the unpaid
     * part). All money values arrive as integer paisa.
     *
     * @param  array{reseller_supplier_id:string,reseller_item_id:string,purchase_date:string,quantity:float,unit_cost:int,transport_cost?:int,loading_cost?:int,unloading_cost?:int,paid_amount?:int,method?:string,bank_ref?:string,notes?:string}  $data
     */
    public function recordPurchase(array $data): ResellerPurchase
    {
        return DB::transaction(function () use ($data) {
            $supplier = ResellerSupplier::findOrFail($data['reseller_supplier_id']);
            $item = ResellerItem::findOrFail($data['reseller_item_id']);

            $qty = (float) $data['quantity'];
            $extras = (int) ($data['transport_cost'] ?? 0)
                + (int) ($data['loading_cost'] ?? 0)
                + (int) ($data['unloading_cost'] ?? 0);
            $totalCost = (int) round($qty * $data['unit_cost']) + $extras;
            $paid = (int) ($data['paid_amount'] ?? 0);
            $credit = $totalCost - $paid;

            $purchase = ResellerPurchase::create([
                'reference' => Sequence::next('RPUR'),
                'reseller_supplier_id' => $supplier->id,
                'reseller_item_id' => $item->id,
                'purchase_date' => $data['purchase_date'],
                'quantity' => $qty,
                'unit_cost' => $data['unit_cost'],
                'transport_cost' => $data['transport_cost'] ?? 0,
                'loading_cost' => $data['loading_cost'] ?? 0,
                'unloading_cost' => $data['unloading_cost'] ?? 0,
                'total_cost' => $totalCost,
                'paid_amount' => $paid,
                'payment_status' => $this->purchaseStatus($totalCost, $paid),
                'bank_ref' => $data['bank_ref'] ?? null,
                'notes' => $data['notes'] ?? null,
                'created_by' => Auth::id(),
            ]);

            // moving-average landed cost, on stock BEFORE this batch
            $oldQty = (float) $item->stock_qty;
            $oldAvg = (int) $item->avg_cost;
            $newQty = $oldQty + $qty;
            if ($newQty > 0) {
                $item->avg_cost = (int) round(($oldQty * $oldAvg + $totalCost) / $newQty);
            }
            $item->stock_qty = $newQty;
            // Retail (customer) price bhi khareed ke waqt set/update ho, margin ke liye
            if (isset($data['sale_price']) && (int) $data['sale_price'] > 0) {
                $item->sale_price = (int) $data['sale_price'];
            }
            $item->save();

            if ($credit > 0) {
                $supplier->increment('balance', $credit);
            }

            if ($paid > 0) {
                $this->logPayment(ResellerPayment::OUT, $paid, $data['purchase_date'], [
                    'reseller_supplier_id' => $supplier->id,
                    'reseller_purchase_id' => $purchase->id,
                    'method' => $data['method'] ?? 'cash',
                    'bank_ref' => $data['bank_ref'] ?? null,
                ]);
            }

            return $purchase;
        });
    }

    /**
     * Pay (part of) a purchase bill to its supplier.
     *
     * @param  array{amount:int,payment_date:string,method?:string,bank_ref?:string}  $data
     */
    public function payPurchase(ResellerPurchase $purchase, array $data): ResellerPayment
    {
        return DB::transaction(function () use ($purchase, $data) {
            $remaining = (int) $purchase->total_cost - (int) $purchase->paid_amount;
            $amount = min((int) $data['amount'], $remaining);
            if ($amount <= 0) {
                throw new InvalidArgumentException('Is bill ka koi baqi nahi.');
            }

            $paid = (int) $purchase->paid_amount + $amount;
            $purchase->update([
                'paid_amount' => $paid,
                'payment_status' => $this->purchaseStatus((int) $purchase->total_cost, $paid),
            ]);
            $purchase->supplier->decrement('balance', $amount);

            return $this->logPayment(ResellerPayment::OUT, $amount, $data['payment_date'], [
                'reseller_supplier_id' => $purchase->reseller_supplier_id,
                'reseller_purchase_id' => $purchase->id,
                'method' => $data['method'] ?? 'cash',
                'bank_ref' => $data['bank_ref'] ?? null,
            ]);
        });
    }

    /**
     * Lump payment to a supplier, settles their udhaar and spreads across
     * their unpaid purchase bills (oldest first).
     *
     * @param  array{amount:int,payment_date:string,method?:string,bank_ref?:string}  $data
     */
    public function paySupplier(ResellerSupplier $supplier, array $data): ResellerPayment
    {
        return DB::transaction(function () use ($supplier, $data) {
            $outstanding = (int) $supplier->balance;
            if ($outstanding <= 0) {
                throw new InvalidArgumentException('Is supplier ka koi baqi nahi.');
            }
            $amount = min((int) $data['amount'], $outstanding);
            if ($amount <= 0) {
                throw new InvalidArgumentException('Amount positive hona chahiye.');
            }

            // spread across unpaid bills, oldest first
            $remaining = $amount;
            $bills = ResellerPurchase::where('reseller_supplier_id', $supplier->id)
                ->whereColumn('paid_amount', '<', 'total_cost')
                ->orderBy('purchase_date')->orderBy('created_at')->get();
            foreach ($bills as $bill) {
                if ($remaining <= 0) {
                    break;
                }
                $due = (int) $bill->total_cost - (int) $bill->paid_amount;
                $apply = min($remaining, $due);
                $paid = (int) $bill->paid_amount + $apply;
                $bill->update([
                    'paid_amount' => $paid,
                    'payment_status' => $this->purchaseStatus((int) $bill->total_cost, $paid),
                ]);
                $remaining -= $apply;
            }

            $supplier->decrement('balance', $amount);

            return $this->logPayment(ResellerPayment::OUT, $amount, $data['payment_date'], [
                'reseller_supplier_id' => $supplier->id,
                'method' => $data['method'] ?? 'cash',
                'bank_ref' => $data['bank_ref'] ?? null,
            ]);
        });
    }

    /**
     * Start a kiraya (rental): customer takes items, per-day charge accrues.
     *
     * @param  array{customer_id:string,item_name:string,unit?:string,quantity?:float,per_day_rate:int,start_date:string,notes?:string}  $data
     */
    public function startRental(array $data): ResellerRental
    {
        $customer = Customer::findOrFail($data['customer_id']);

        return ResellerRental::create([
            'reference' => Sequence::next('KIR'),
            'customer_id' => $customer->id,
            'item_name' => $data['item_name'],
            'unit' => $data['unit'] ?? 'unit',
            'quantity' => (float) ($data['quantity'] ?? 1),
            'per_day_rate' => (int) $data['per_day_rate'],
            'start_date' => $data['start_date'],
            'status' => 'active',
            'notes' => $data['notes'] ?? null,
            'created_by' => Auth::id(),
        ]);
    }

    /** Return the items: freeze days + accrued total. */
    public function returnRental(ResellerRental $rental, string $returnDate): ResellerRental
    {
        if ($rental->status === 'returned') {
            throw new InvalidArgumentException('Ye kiraya pehle hi return ho chuka.');
        }

        $start = Carbon::parse($rental->start_date)->startOfDay();
        $end = Carbon::parse($returnDate)->startOfDay();
        if ($end->lt($start)) {
            throw new InvalidArgumentException('Return date start date se pehle nahi ho sakti.');
        }

        $days = $start->diffInDays($end) + 1; // inclusive
        $accrued = (int) round($days * (int) $rental->per_day_rate * (float) $rental->quantity);

        $rental->update([
            'return_date' => $returnDate,
            'days' => $days,
            'accrued_total' => $accrued,
            'status' => 'returned',
        ]);

        return $rental;
    }

    /**
     * Collect kiraya money from the customer.
     *
     * @param  array{amount:int,payment_date:string,method?:string,bank_ref?:string}  $data
     */
    public function collectRental(ResellerRental $rental, array $data): ResellerPayment
    {
        return DB::transaction(function () use ($rental, $data) {
            $due = $rental->currentAccrued() - (int) $rental->paid_amount;
            $amount = min((int) $data['amount'], max($due, 0));
            if ($amount <= 0) {
                throw new InvalidArgumentException('Is kiraye ka abhi koi baqi nahi.');
            }

            $rental->increment('paid_amount', $amount);

            return $this->logPayment(ResellerPayment::IN, $amount, $data['payment_date'], [
                'customer_id' => $rental->customer_id,
                'reseller_rental_id' => $rental->id,
                'method' => $data['method'] ?? 'cash',
                'bank_ref' => $data['bank_ref'] ?? null,
            ]);
        });
    }

    /**
     * Lump receipt from a customer, settles their reseller dues: sale udhaar
     * first (oldest), then kiraya (oldest). Only reseller books; customers.balance
     * (block factory) is never touched.
     *
     * @param  array{amount:int,payment_date:string,method?:string,bank_ref?:string}  $data
     */
    public function receiveFromCustomer(Customer $customer, array $data): ResellerPayment
    {
        return DB::transaction(function () use ($customer, $data) {
            $salesDue = (int) ResellerSale::where('customer_id', $customer->id)->sum('balance');
            $rentals = ResellerRental::where('customer_id', $customer->id)->get();
            $kiryaDue = (int) $rentals->sum(fn ($r) => max($r->currentAccrued() - (int) $r->paid_amount, 0));
            $outstanding = $salesDue + $kiryaDue;
            if ($outstanding <= 0) {
                throw new InvalidArgumentException('Is customer ka reseller me koi baqi nahi.');
            }
            $amount = min((int) $data['amount'], $outstanding);
            $remaining = $amount;

            // 1) sale invoices, oldest first
            foreach (ResellerSale::where('customer_id', $customer->id)->where('balance', '>', 0)
                ->orderBy('sale_date')->orderBy('created_at')->get() as $sale) {
                if ($remaining <= 0) {
                    break;
                }
                $apply = min($remaining, (int) $sale->balance);
                $paid = (int) $sale->paid + $apply;
                $sale->update(['paid' => $paid, 'balance' => (int) $sale->total - $paid, 'status' => $this->saleStatus((int) $sale->total, $paid)]);
                $remaining -= $apply;
            }
            // 2) kiraya, oldest first
            foreach ($rentals->sortBy('start_date')->sortBy('created_at') as $rental) {
                if ($remaining <= 0) {
                    break;
                }
                $due = max($rental->currentAccrued() - (int) $rental->paid_amount, 0);
                $apply = min($remaining, $due);
                if ($apply > 0) {
                    $rental->increment('paid_amount', $apply);
                    $remaining -= $apply;
                }
            }

            return $this->logPayment(ResellerPayment::IN, $amount, $data['payment_date'], [
                'customer_id' => $customer->id,
                'method' => $data['method'] ?? 'cash',
                'bank_ref' => $data['bank_ref'] ?? null,
            ]);
        });
    }

    /**
     * Pay a shared driver's OUTSTANDING reseller kiraya, spread across their
     * challans (oldest first). Reseller cash only; the block factory driver
     * balance is untouched.
     *
     * @param  array{amount:int,payment_date:string,method?:string,bank_ref?:string}  $data
     */
    public function payDriverKiraya(Driver $driver, array $data): ResellerPayment
    {
        return DB::transaction(function () use ($driver, $data) {
            $challans = ResellerDispatch::where('driver_id', $driver->id)
                ->whereColumn('trip_paid', '<', 'trip_rate')
                ->orderBy('dispatch_date')->orderBy('created_at')->get();
            $outstanding = (int) $challans->sum(fn ($c) => (int) $c->trip_rate - (int) $c->trip_paid);
            if ($outstanding <= 0) {
                throw new InvalidArgumentException('Is driver ka koi kiraya baqi nahi.');
            }
            $amount = min((int) $data['amount'], $outstanding);
            $remaining = $amount;

            foreach ($challans as $c) {
                if ($remaining <= 0) {
                    break;
                }
                $due = (int) $c->trip_rate - (int) $c->trip_paid;
                $apply = min($remaining, $due);
                $c->increment('trip_paid', $apply);
                $remaining -= $apply;
            }

            return $this->logPayment(ResellerPayment::OUT, $amount, $data['payment_date'], [
                'method' => $data['method'] ?? 'cash',
                'bank_ref' => $data['bank_ref'] ?? null,
                'notes' => 'Driver kiraya: '.$driver->name,
            ]);
        });
    }

    private function saleStatus(int $total, int $paid): string
    {
        if ($paid <= 0) {
            return 'unpaid';
        }

        return $paid >= $total ? 'paid' : 'partial';
    }

    private function logPayment(string $direction, int $amount, string $date, array $refs): ResellerPayment
    {
        return ResellerPayment::create(array_merge([
            'reference' => Sequence::next('RPAY'),
            'direction' => $direction,
            'payment_date' => $date,
            'amount' => $amount,
            'method' => 'cash',
            'created_by' => Auth::id(),
        ], $refs));
    }

    private function purchaseStatus(int $total, int $paid): string
    {
        if ($paid <= 0) {
            return 'unpaid';
        }

        return $paid >= $total ? 'paid' : 'partial';
    }
}
