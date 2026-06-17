<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SupplierResource;
use App\Models\MaterialPurchase;
use App\Models\Payment;
use App\Models\Supplier;
use Illuminate\Http\Request;

class SupplierController extends Controller
{
    public function index(Request $request)
    {
        $suppliers = Supplier::query()
            ->when($request->search, fn ($q, $s) => $q->where('name', 'like', "%{$s}%")->orWhere('phone', 'like', "%{$s}%"))
            ->when($request->boolean('has_dues'), fn ($q) => $q->where('balance', '>', 0)->orderByDesc('balance'))
            ->when($request->boolean('active_only'), fn ($q) => $q->where('is_active', true))
            ->orderBy('name')
            ->paginate($request->integer('per_page', 15));

        return SupplierResource::collection($suppliers);
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules());
        $supplier = Supplier::create($data);

        return new SupplierResource($supplier);
    }

    public function show(Supplier $supplier)
    {
        return new SupplierResource($supplier);
    }

    public function update(Request $request, Supplier $supplier)
    {
        $supplier->update($request->validate($this->rules()));

        return new SupplierResource($supplier);
    }

    public function destroy(Supplier $supplier)
    {
        $supplier->delete();

        return response()->noContent();
    }

    /** Combined statement: purchases (debit to us) and payments (credit). */
    public function ledger(Supplier $supplier)
    {
        $purchases = $supplier->purchases()->get()->map(fn (MaterialPurchase $p) => [
            'date' => $p->purchase_date->toDateString(),
            'type' => 'purchase',
            'reference' => $p->reference,
            'description' => 'Material purchase',
            'credit' => (int) $p->total_cost,   // increases payable
            'debit' => 0,
        ]);

        $payments = $supplier->payments()->get()->map(fn (Payment $p) => [
            'date' => $p->payment_date->toDateString(),
            'type' => 'payment',
            'reference' => $p->reference,
            'description' => 'Payment made',
            'credit' => 0,
            'debit' => (int) $p->amount,        // reduces payable
        ]);

        $rows = $purchases->concat($payments)->sortBy('date')->values();

        return response()->json([
            'supplier' => new SupplierResource($supplier),
            'balance' => (int) $supplier->balance,
            'rows' => $rows,
        ]);
    }

    private function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
            'is_active' => ['boolean'],
        ];
    }
}
