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
            // Supplier ko sirf maal ka bill. Kiraya agar driver ko gaya to wo
            // is me se nikal jata hai aur driver ke khate me chala jata hai.
            'supplier_bill' => $this->supplierBill(),
            'paid_amount' => (int) $this->paid_amount,
            'payment_status' => $this->payment_status,
            'freight_driver' => $this->when($this->relationLoaded('trip'), fn () => $this->trip ? [
                'trip_reference' => $this->trip->reference,
                'driver_id' => $this->trip->driver_id,
                'driver_name' => $this->trip->driver?->name,
                'vehicle' => $this->trip->vehicle_label,
                'rate' => (int) $this->trip->rate,
                'paid' => (int) $this->trip->paid,
                'balance' => (int) $this->trip->balance,
                'status' => $this->trip->status,
            ] : null),
            'bank_ref' => $this->bank_ref,
            'notes' => $this->notes,
            'created_at' => $this->created_at,
        ];
    }
}
