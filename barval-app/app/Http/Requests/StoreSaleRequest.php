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
            'customer_id' => ['nullable', 'uuid', 'exists:customers,id', 'required_if:type,credit'],
            'sale_date' => ['required', 'date'],
            'type' => ['required', 'in:cash,credit'],
            'discount' => ['nullable', 'numeric', 'min:0'],     // rupees
            'transport_fare' => ['nullable', 'numeric', 'min:0'], // rupees (customer pays freight)
            'paid' => ['nullable', 'numeric', 'min:0'],         // rupees (credit sales)
            'payment_method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:payment_method,bank'],
            'notes' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'uuid', 'exists:products,id'],
            'items.*.quantity' => ['required', 'integer', 'gt:0'],
            'items.*.unit_price' => ['nullable', 'numeric', 'min:0'], // rupees override
        ];
    }

    public function messages(): array
    {
        return [
            'customer_id.required_if' => 'Udhaar (credit) bikri ke liye customer chunna zaroori hai.',
            'bank_ref.required_if' => 'Bank payment par bank/reference likhna zaroori hai.',
        ];
    }
}
