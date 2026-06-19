<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StaffResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'role' => $this->role,
            'phone' => $this->phone,
            'monthly_salary' => (int) $this->monthly_salary,
            'is_active' => (bool) $this->is_active,
        ];
    }
}
