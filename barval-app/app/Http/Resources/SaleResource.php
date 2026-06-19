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
            'created_at' => $this->created_at,
        ];
    }
}
