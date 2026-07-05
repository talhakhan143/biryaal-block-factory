<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ResellerPurchaseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'supplier' => new ResellerSupplierResource($this->whenLoaded('supplier')),
            'reseller_supplier_id' => $this->reseller_supplier_id,
            'item' => new ResellerItemResource($this->whenLoaded('item')),
            'reseller_item_id' => $this->reseller_item_id,
            'purchase_date' => $this->purchase_date?->toDateString(),
            'quantity' => (float) $this->quantity,
            'unit_cost' => (int) $this->unit_cost,
            'transport_cost' => (int) $this->transport_cost,
            'loading_cost' => (int) $this->loading_cost,
            'unloading_cost' => (int) $this->unloading_cost,
            'total_cost' => (int) $this->total_cost,
            'paid_amount' => (int) $this->paid_amount,
            'payment_status' => $this->payment_status,
            'bank_ref' => $this->bank_ref,
            'notes' => $this->notes,
            'created_at' => $this->created_at,
        ];
    }
}
