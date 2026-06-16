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
            'balance' => (int) $this->balance,
            'is_active' => (bool) $this->is_active,
        ];
    }
}
