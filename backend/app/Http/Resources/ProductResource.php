<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'sku' => $this->sku,
            'size' => $this->size,
            'unit' => $this->unit,
            'default_curing_days' => $this->default_curing_days,
            'sale_price' => (int) $this->sale_price,
            'low_stock_threshold' => $this->low_stock_threshold,
            'is_active' => (bool) $this->is_active,
            'stock' => $this->whenLoaded('stock', fn () => [
                'curing_qty' => (int) $this->stock->curing_qty,
                'ready_qty' => (int) $this->stock->ready_qty,
                'damaged_qty' => (int) $this->stock->damaged_qty,
            ]),
        ];
    }
}
