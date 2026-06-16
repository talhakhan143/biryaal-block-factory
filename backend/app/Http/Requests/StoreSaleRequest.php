<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreSaleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'customer_id' => ['nullable', 'uuid', 'exists:customers,id'],
            'sale_date' => ['required', 'date'],
            'type' => ['required', 'in:cash,credit'],
            'discount' => ['nullable', 'numeric', 'min:0'],     // rupees
            'paid' => ['nullable', 'numeric', 'min:0'],         // rupees (credit sales)
            'payment_method' => ['nullable', 'in:cash,bank'],
            'notes' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'uuid', 'exists:products,id'],
            'items.*.quantity' => ['required', 'integer', 'gt:0'],
            'items.*.unit_price' => ['nullable', 'numeric', 'min:0'], // rupees override
        ];
    }
}
