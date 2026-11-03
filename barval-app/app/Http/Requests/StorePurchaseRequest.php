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
            'unit_cost' => ['required', 'numeric', 'min:0'],   // rupees
            'loading_cost' => ['nullable', 'numeric', 'min:0'],
            'unloading_cost' => ['nullable', 'numeric', 'min:0'],
            'paid_amount' => ['nullable', 'numeric', 'min:0'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:method,bank'],
            'notes' => ['nullable', 'string'],

            // Maal laane wala driver. Kiraya is bill me NAHI chadhta, uski apni
            // alag trip banti hai driver ke naam, taake wo aik hi dafa ginna jaye.
            'driver_id' => ['nullable', 'uuid', 'exists:drivers,id', 'required_with:freight_rate'],
            'freight_rate' => ['nullable', 'numeric', 'min:0', 'required_with:driver_id'],  // rupees
            'freight_paid' => ['nullable', 'numeric', 'min:0', 'lte:freight_rate'],
        ];
    }

    public function messages(): array
    {
        return [
            'bank_ref.required_if' => 'Bank payment par bank/reference likhna zaroori hai.',
            'freight_rate.required_with' => 'Driver chuna hai to uska kiraya bhi likhein.',
            'driver_id.required_with' => 'Kiraya likha hai to laane wala driver bhi chunein.',
            'freight_paid.lte' => 'Driver ko kiraye se zyada paisa nahi diya ja sakta.',
        ];
    }
}
