<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DriverResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'phone' => $this->phone,
            'license_no' => $this->license_no,
            'vehicle_name' => $this->vehicle_name,
            'vehicle_plate' => $this->vehicle_plate,
            'balance' => (int) $this->balance,
            // Sirf tab jab list kisi aik kaam ki kism par chhani gayi ho.
            'kind_summary' => $this->when($this->kind_trips !== null, fn () => [
                'trips' => (int) $this->kind_trips,
                'kiraya' => (int) $this->kind_kiraya,
                'paid' => (int) $this->kind_paid,
                'due' => max((int) $this->kind_due, 0),
            ]),
            'is_active' => (bool) $this->is_active,
            'created_at' => $this->created_at,
        ];
    }
}
