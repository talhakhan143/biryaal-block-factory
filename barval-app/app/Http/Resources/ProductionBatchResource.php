<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductionBatchResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'product' => new ProductResource($this->whenLoaded('product')),
            'product_id' => $this->product_id,
            'production_date' => $this->production_date?->toDateString(),
            'shift' => $this->shift,
            'quantity_produced' => (int) $this->quantity_produced,
            'curing_days' => $this->curing_days,
            'ready_at' => $this->ready_at?->toDateString(),
            'status' => $this->status,
            'supervisor' => $this->whenLoaded('supervisor', fn () => $this->supervisor?->name),
            'notes' => $this->notes,
            'created_at' => $this->created_at,
        ];
    }
}
