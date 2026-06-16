<?php

namespace App\Services\Dispatch;

use App\Models\Dispatch;
use App\Support\Sequence;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Dispatch is a delivery / challan document. Stock is already decremented at
 * the point of sale, so dispatch records logistics only (no stock or ledger move).
 */
class DispatchService
{
    /**
     * @param  array{customer_id?:string,sale_id?:string,vehicle_id?:string,driver_id?:string,dispatch_date:string,notes?:string,items:array<int,array{product_id:string,quantity:int}>}  $data
     */
    public function create(array $data): Dispatch
    {
        return DB::transaction(function () use ($data) {
            $dispatch = Dispatch::create([
                'reference' => Sequence::next('DSP'),
                'customer_id' => $data['customer_id'] ?? null,
                'sale_id' => $data['sale_id'] ?? null,
                'vehicle_id' => $data['vehicle_id'] ?? null,
                'driver_id' => $data['driver_id'] ?? null,
                'dispatch_date' => $data['dispatch_date'],
                'status' => 'pending',
                'notes' => $data['notes'] ?? null,
                'created_by' => Auth::id(),
            ]);

            foreach ($data['items'] as $item) {
                $dispatch->items()->create([
                    'product_id' => $item['product_id'],
                    'quantity' => (int) $item['quantity'],
                ]);
            }

            return $dispatch->load('items.product');
        });
    }

    public function markDelivered(Dispatch $dispatch): Dispatch
    {
        $dispatch->update(['status' => 'delivered']);

        return $dispatch;
    }
}
