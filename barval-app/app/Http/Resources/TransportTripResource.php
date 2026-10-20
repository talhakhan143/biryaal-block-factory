<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TransportTripResource extends JsonResource
{
    /**
     * Ye trip kis ke kaam ki thi.
     *
     * Maal bhejne wali trip kisi customer ki delivery se judi hoti hai, maal
     * laane wali kisi supplier ki khareed se. Jo relation load na ho us ka
     * naam null jata hai, magar id phir bhi mil jati hai.
     *
     * @return array{side:string,name:?string,customer_id:?string,supplier_id:?string,reference:?string}|null
     */
    private function forWhom(): ?array
    {
        if ($this->dispatch_id) {
            $d = $this->relationLoaded('dispatch') ? $this->dispatch : null;

            // Purane challan par customer khali reh gaya tha, us soorat me
            // bill ke zariye wahi banda mil jata hai.
            $customer = $d?->customer ?? $d?->sale?->customer;

            return [
                'side' => 'customer',
                'name' => $customer?->name,
                'customer_id' => $d?->customer_id ?? $d?->sale?->customer_id,
                'supplier_id' => null,
                'reference' => $d?->sale?->invoice_no ?? $d?->reference,
            ];
        }

        if ($this->material_purchase_id) {
            $p = $this->relationLoaded('materialPurchase') ? $this->materialPurchase : null;

            return [
                'side' => 'supplier',
                'name' => $p?->supplier?->name,
                'customer_id' => null,
                'supplier_id' => $p?->supplier_id,
                'reference' => $p?->reference,
            ];
        }

        return null;
    }

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'vehicle' => new VehicleResource($this->whenLoaded('vehicle')),
            'vehicle_label' => $this->vehicle_label ?: $this->driver?->vehicle_name,
            'driver' => new DriverResource($this->whenLoaded('driver')),
            'kind' => $this->kind,
            'trip_date' => $this->trip_date?->toDateString(),
            'notes' => $this->notes,
            'from_location' => $this->from_location,
            'to_location' => $this->to_location,
            'rate' => (int) $this->rate,
            'paid' => (int) $this->paid,
            'balance' => (int) $this->balance,
            'status' => $this->status,
            // Har trip kisi na kisi ka kaam hai. Yahan se seedha us bande ki
            // page tak jaya ja sakta hai.
            'for' => $this->forWhom(),
            'created_at' => $this->created_at,
        ];
    }
}
