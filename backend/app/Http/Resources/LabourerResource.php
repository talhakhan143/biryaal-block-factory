<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LabourerResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'phone' => $this->phone,
            'daily_wage' => (int) $this->daily_wage,
            'balance' => (int) $this->balance,
            'is_active' => (bool) $this->is_active,
        ];
    }
}
