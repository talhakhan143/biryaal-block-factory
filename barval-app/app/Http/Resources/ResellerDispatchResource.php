<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ResellerDispatchResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'reseller_sale_id' => $this->reseller_sale_id,
            'invoice_no' => $this->whenLoaded('sale', fn () => $this->sale?->invoice_no),
            'customer' => new ResellerCustomerResource($this->whenLoaded('customer')),
            'customer_id' => $this->customer_id,
            'driver' => new DriverResource($this->whenLoaded('driver')),
            'driver_id' => $this->driver_id,
            'vehicle' => new VehicleResource($this->whenLoaded('vehicle')),
            'vehicle_id' => $this->vehicle_id,
            'trip_rate' => (int) $this->trip_rate,
            'trip_paid' => (int) $this->trip_paid,
            'trip_balance' => (int) $this->trip_rate - (int) $this->trip_paid,
            'dispatch_date' => $this->dispatch_date?->toDateString(),
            'status' => $this->status,
            'delivered_at' => $this->delivered_at,
            'notes' => $this->notes,
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($i) => [
                'reseller_item_id' => $i->reseller_item_id,
                'item_name' => $i->item?->name,
                'unit' => $i->item?->unit,
                'quantity' => (float) $i->quantity,
            ])),
            'created_at' => $this->created_at,
        ];
    }
}
