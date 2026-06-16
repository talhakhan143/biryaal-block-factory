<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RawMaterialResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'unit' => $this->unit,
            'current_qty' => (float) $this->current_qty,
            'low_stock_threshold' => (float) $this->low_stock_threshold,
            'is_low' => (float) $this->current_qty <= (float) $this->low_stock_threshold,
            'is_active' => (bool) $this->is_active,
        ];
    }
}
