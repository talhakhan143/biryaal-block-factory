<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SupplierResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'phone' => $this->phone,
            'address' => $this->address,
            'notes' => $this->notes,
            'balance' => (int) $this->balance,
            'is_active' => (bool) $this->is_active,
            'created_at' => $this->created_at,
        ];
    }
}
