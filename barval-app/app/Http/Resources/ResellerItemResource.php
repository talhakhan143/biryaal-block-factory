<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ResellerItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $qty = (float) $this->stock_qty;

        return [
            'id' => $this->id,
            'name' => $this->name,
            'unit' => $this->unit,
            'sale_price' => (int) $this->sale_price,
            'avg_cost' => (int) $this->avg_cost,
            'stock_qty' => $qty,
            'stock_value' => (int) round($qty * (int) $this->avg_cost),
            'low_stock_threshold' => (float) $this->low_stock_threshold,
            'is_active' => (bool) $this->is_active,
            'created_at' => $this->created_at,
        ];
    }
}
