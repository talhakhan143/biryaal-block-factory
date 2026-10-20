<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DispatchResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'customer' => new CustomerResource($this->whenLoaded('customer')),
            'customer_id' => $this->customer_id,
            'sale_id' => $this->sale_id,
            'vehicle' => new VehicleResource($this->whenLoaded('vehicle')),
            'driver' => new DriverResource($this->whenLoaded('driver')),
            'dispatch_date' => $this->dispatch_date?->toDateString(),
            // Jis bill ki ye delivery hai.
            'sale' => $this->whenLoaded('sale', fn () => $this->sale ? [
                'id' => $this->sale->id,
                'invoice_no' => $this->sale->invoice_no,
            ] : null),
            // Is delivery ka kiraya: kitna bana, kitna diya, kitna baqi.
            'trip' => $this->whenLoaded('trip', fn () => $this->trip ? [
                'id' => $this->trip->id,
                'reference' => $this->trip->reference,
                'rate' => (int) $this->trip->rate,
                'paid' => (int) $this->trip->paid,
                'balance' => (int) $this->trip->balance,
                'status' => $this->trip->status,
            ] : null),
            'status' => $this->status,
            'notes' => $this->notes,
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($i) => [
                'id' => $i->id,
                'product_id' => $i->product_id,
                'product_name' => $i->product?->name,
                'quantity' => (int) $i->quantity,
            ])),
            'created_at' => $this->created_at,
        ];
    }
}
