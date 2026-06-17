<?php

namespace App\Services\Dispatch;

use App\Models\Dispatch;
use App\Models\Driver;
use App\Services\Transport\TransportService;
use App\Support\Sequence;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Dispatch = delivery/challan. Stock is already decremented at the point of sale,
 * so dispatch records logistics only. Creating a dispatch marks it delivered and,
 * if a trip fare is given, auto-creates the transport trip for the driver.
 */
class DispatchService
{
    public function __construct(private TransportService $transport) {}

    /**
     * @param  array{customer_id?:string,sale_id?:string,driver_id?:string,vehicle_id?:string,dispatch_date:string,notes?:string,items:array<int,array{product_id:string,quantity:int}>,trip_rate?:int,trip_paid?:int,method?:string,bank_ref?:string}  $data
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
                'status' => 'delivered', // creating the challan means it's going out
                'notes' => $data['notes'] ?? null,
                'created_by' => Auth::id(),
            ]);

            foreach ($data['items'] as $item) {
                $dispatch->items()->create([
                    'product_id' => $item['product_id'],
                    'quantity' => (int) $item['quantity'],
                ]);
            }

            // Auto-create the transport trip when a fare is provided.
            $rate = (int) ($data['trip_rate'] ?? 0);
            if ($rate > 0 && ! empty($data['driver_id'])) {
                $driver = Driver::find($data['driver_id']);
                $this->transport->recordTrip([
                    'driver_id' => $data['driver_id'],
                    'vehicle_label' => $driver?->vehicle_name,
                    'dispatch_id' => $dispatch->id,
                    'trip_date' => $data['dispatch_date'],
                    'rate' => $rate,
                    'paid' => (int) ($data['trip_paid'] ?? 0),
                    'method' => $data['method'] ?? 'cash',
                    'bank_ref' => $data['bank_ref'] ?? null,
                    'to_location' => null,
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
