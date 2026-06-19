<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StorePurchaseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'supplier_id' => ['required', 'uuid', 'exists:suppliers,id'],
            'raw_material_id' => ['required', 'uuid', 'exists:raw_materials,id'],
            'purchase_date' => ['required', 'date'],
            'quantity' => ['required', 'numeric', 'gt:0'],
            'unit_cost' => ['required', 'numeric', 'min:0'],       // rupees
            'transport_cost' => ['nullable', 'numeric', 'min:0'],  // rupees
            'loading_cost' => ['nullable', 'numeric', 'min:0'],
            'unloading_cost' => ['nullable', 'numeric', 'min:0'],
            'paid_amount' => ['nullable', 'numeric', 'min:0'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:method,bank'],
            'notes' => ['nullable', 'string'],
        ];
    }

    public function messages(): array
    {
        return [
            'bank_ref.required_if' => 'Bank payment par bank/reference likhna zaroori hai.',
        ];
    }
}
