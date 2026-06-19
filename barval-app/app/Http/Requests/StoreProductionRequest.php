<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreProductionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'product_id' => ['required', 'uuid', 'exists:products,id'],
            'production_date' => ['required', 'date'],
            'shift' => ['nullable', 'in:day,night'],
            'quantity_produced' => ['required', 'integer', 'gt:0'],
            'curing_days' => ['nullable', 'integer', 'min:0', 'max:60'],
            'supervisor_id' => ['nullable', 'integer', 'exists:users,id'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
