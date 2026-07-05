<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ResellerRentalResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $accrued = $this->currentAccrued();
        $paid = (int) $this->paid_amount;

        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'customer' => new CustomerResource($this->whenLoaded('customer')),
            'customer_id' => $this->customer_id,
            'item_name' => $this->item_name,
            'unit' => $this->unit,
            'quantity' => (float) $this->quantity,
            'per_day_rate' => (int) $this->per_day_rate,
            'start_date' => $this->start_date?->toDateString(),
            'return_date' => $this->return_date?->toDateString(),
            'days' => $this->chargeableDays(),
            'accrued_total' => $accrued,
            'paid_amount' => $paid,
            'outstanding' => max($accrued - $paid, 0),
            'status' => $this->status,
            'notes' => $this->notes,
            'created_at' => $this->created_at,
        ];
    }
}
