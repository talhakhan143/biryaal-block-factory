<?php

namespace App\Services\Reseller;

use App\Models\ResellerDispatch;
use App\Models\ResellerPayment;
use App\Models\ResellerSale;
use App\Support\Sequence;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Resellers Point delivery (challan) — a full copy of the block factory dispatch
 * flow but on its OWN tables. Drivers and vehicles are the shared entities
 * (identity only). Kiraya is reseller money: the paid portion goes out of the
 * reseller cash log (reseller_payments); the shared driver's balance is NEVER
 * touched, so there is zero conflict with the block factory transport ledger.
 * Stock already left at sale time, so a challan does not change stock.
 */
class ResellerDispatchService
{
    /**
     * @param  array{reseller_sale_id?:string,customer_id?:string,driver_id?:string,vehicle_id?:string,dispatch_date:string,notes?:string,items:array<int,array{reseller_item_id:string,quantity:float}>,trip_rate?:int,trip_paid?:int,method?:string,bank_ref?:string}  $data
     */
    public function create(array $data): ResellerDispatch
    {
        return DB::transaction(function () use ($data) {
            $customerId = $data['customer_id'] ?? null;
            if (! $customerId && ! empty($data['reseller_sale_id'])) {
                $customerId = ResellerSale::find($data['reseller_sale_id'])?->customer_id;
            }

            $rate = (int) ($data['trip_rate'] ?? 0);
            $paid = (int) ($data['trip_paid'] ?? 0);

            $dispatch = ResellerDispatch::create([
                'reference' => Sequence::next('RDSP'),
                'reseller_sale_id' => $data['reseller_sale_id'] ?? null,
                'customer_id' => $customerId,
                'driver_id' => $data['driver_id'] ?? null,
                'vehicle_id' => $data['vehicle_id'] ?? null,
                'trip_rate' => $rate,
                'trip_paid' => $paid,
                'dispatch_date' => $data['dispatch_date'],
                'status' => 'delivered', // challan banna = maal ja raha
                'delivered_at' => now(),
                'notes' => $data['notes'] ?? null,
                'created_by' => Auth::id(),
            ]);

            foreach ($data['items'] as $line) {
                $dispatch->items()->create([
                    'reseller_item_id' => $line['reseller_item_id'],
                    'quantity' => (float) $line['quantity'],
                ]);
            }

            // Kiraya jo driver ko abhi diya — reseller cash OUT (driver balance untouched).
            if ($paid > 0) {
                ResellerPayment::create([
                    'reference' => Sequence::next('RPAY'),
                    'direction' => ResellerPayment::OUT,
                    'reseller_dispatch_id' => $dispatch->id,
                    'payment_date' => $data['dispatch_date'],
                    'amount' => $paid,
                    'method' => $data['method'] ?? 'cash',
                    'bank_ref' => $data['bank_ref'] ?? null,
                    'notes' => 'Challan kiraya',
                    'created_by' => Auth::id(),
                ]);
            }

            return $dispatch->load('items.item', 'customer', 'driver', 'vehicle');
        });
    }
}
