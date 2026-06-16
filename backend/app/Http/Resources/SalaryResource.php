<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SalaryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'staff_id' => $this->staff_id,
            'staff_name' => $this->whenLoaded('staff', fn () => $this->staff->name),
            'month' => $this->month,
            'amount' => (int) $this->amount,
            'paid' => (int) $this->paid,
            'balance' => (int) $this->balance,
            'status' => $this->status,
            'created_at' => $this->created_at,
        ];
    }
}
