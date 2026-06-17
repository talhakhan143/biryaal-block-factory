<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TransportTripResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'vehicle' => new VehicleResource($this->whenLoaded('vehicle')),
            'vehicle_label' => $this->vehicle_label ?: $this->driver?->vehicle_name,
            'driver' => new DriverResource($this->whenLoaded('driver')),
            'trip_date' => $this->trip_date?->toDateString(),
            'from_location' => $this->from_location,
            'to_location' => $this->to_location,
            'rate' => (int) $this->rate,
            'paid' => (int) $this->paid,
            'balance' => (int) $this->balance,
            'status' => $this->status,
            'created_at' => $this->created_at,
        ];
    }
}
