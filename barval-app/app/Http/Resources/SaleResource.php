<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SaleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'invoice_no' => $this->invoice_no,
            'customer' => new CustomerResource($this->whenLoaded('customer')),
            'customer_id' => $this->customer_id,
            'sale_date' => $this->sale_date?->toDateString(),
            'type' => $this->type,
            'subtotal' => (int) $this->subtotal,
            'discount' => (int) $this->discount,
            'transport_fare' => (int) $this->transport_fare,
            'total' => (int) $this->total,
            'paid' => (int) $this->paid,
            'balance' => (int) $this->balance,
            'status' => $this->status,
            'payment_method' => $this->payment_method,
            'bank_ref' => $this->bank_ref,
            'notes' => $this->notes,
            'items' => SaleItemResource::collection($this->whenLoaded('items')),
            // Maal gaya ya abhi khada hai, aur kis ke hath gaya. Sales ki list
            // par yehi sab se pehle poocha jata hai.
            'delivery' => $this->whenLoaded('dispatches', fn () => $this->dispatches->map(fn ($d) => [
                'id' => $d->id,
                'reference' => $d->reference,
                'dispatch_date' => $d->dispatch_date?->toDateString(),
                'status' => $d->status,
                'driver_id' => $d->driver_id,
                'driver_name' => $d->driver?->name,
            ])->values()),
            'created_at' => $this->created_at,
        ];
    }
}
