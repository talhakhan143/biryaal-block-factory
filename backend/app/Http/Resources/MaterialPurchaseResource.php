<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MaterialPurchaseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'supplier' => new SupplierResource($this->whenLoaded('supplier')),
            'supplier_id' => $this->supplier_id,
            'raw_material' => new RawMaterialResource($this->whenLoaded('rawMaterial')),
            'raw_material_id' => $this->raw_material_id,
            'purchase_date' => $this->purchase_date?->toDateString(),
            'quantity' => (float) $this->quantity,
            'unit_cost' => (int) $this->unit_cost,
            'transport_cost' => (int) $this->transport_cost,
            'loading_cost' => (int) $this->loading_cost,
            'unloading_cost' => (int) $this->unloading_cost,
            'total_cost' => (int) $this->total_cost,
            'paid_amount' => (int) $this->paid_amount,
            'payment_status' => $this->payment_status,
            'notes' => $this->notes,
            'created_at' => $this->created_at,
        ];
    }
}
