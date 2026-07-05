<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ResellerSalesReturnResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'reseller_sale_id' => $this->reseller_sale_id,
            'customer' => new CustomerResource($this->whenLoaded('customer')),
            'customer_id' => $this->customer_id,
            'return_date' => $this->return_date?->toDateString(),
            'return_value' => (int) $this->return_value,
            'deduction' => (int) $this->deduction,
            'refund_amount' => (int) $this->refund_amount,
            'refund_mode' => $this->refund_mode,
            'notes' => $this->notes,
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($i) => [
                'reseller_item_id' => $i->reseller_item_id,
                'item_name' => $i->item?->name,
                'quantity' => (float) $i->quantity,
                'unit_price' => (int) $i->unit_price,
                'line_total' => (int) $i->line_total,
            ])),
            'created_at' => $this->created_at,
        ];
    }
}
