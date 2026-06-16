<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PaymentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'direction' => $this->direction,
            'party_type' => class_basename($this->party_type),
            'party_id' => $this->party_id,
            'party_name' => $this->whenLoaded('party', fn () => $this->party?->name),
            'payment_date' => $this->payment_date?->toDateString(),
            'amount' => (int) $this->amount,
            'method' => $this->method,
            'notes' => $this->notes,
            'created_at' => $this->created_at,
        ];
    }
}
