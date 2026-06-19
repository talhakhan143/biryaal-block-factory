<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StockMovementResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'product' => new ProductResource($this->whenLoaded('product')),
            'product_id' => $this->product_id,
            'type' => $this->type,
            'bucket' => $this->bucket,
            'quantity' => (int) $this->quantity,
            'note' => $this->note,
            'created_at' => $this->created_at,
        ];
    }
}
