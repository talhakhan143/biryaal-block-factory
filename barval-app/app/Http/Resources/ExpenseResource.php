<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ExpenseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'expense_date' => $this->expense_date?->toDateString(),
            'category' => $this->category,
            'amount' => (int) $this->amount,
            'method' => $this->method,
            'bank_ref' => $this->bank_ref,
            'title' => $this->title,
            'notes' => $this->notes,
            'created_at' => $this->created_at,
        ];
    }
}
