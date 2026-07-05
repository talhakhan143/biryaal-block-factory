<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ResellerSaleItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reseller_item_id' => $this->reseller_item_id,
            'item_name' => $this->whenLoaded('item', fn () => $this->item->name),
            'unit' => $this->whenLoaded('item', fn () => $this->item->unit),
            'quantity' => (float) $this->quantity,
            'unit_price' => (int) $this->unit_price,
            'unit_cost' => (int) $this->unit_cost,
            'line_total' => (int) $this->line_total,
        ];
    }
}
