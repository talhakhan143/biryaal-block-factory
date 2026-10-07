<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use App\Http\Resources\MaterialPurchaseResource;
use App\Http\Resources\PaymentResource;
use App\Http\Resources\SupplierResource;
use App\Models\Payment;
use App\Models\Supplier;
use App\Services\Suppliers\SupplierHistoryService;
use Illuminate\Http\Request;

class SupplierController extends Controller
{
    use HasTableQuery;

    public function __construct(private SupplierHistoryService $history) {}

    public function index(Request $request)
    {
        $query = Supplier::query()
            ->when($request->boolean('has_dues'), fn ($q) => $q->where('balance', '>', 0))
            ->when($request->boolean('active_only'), fn ($q) => $q->where('is_active', true));

        $this->applyTableQuery($query, $request, ['name', 'balance', 'phone', 'is_active'], ['name', 'phone'], 'name');

        return SupplierResource::collection($query->paginate($request->integer('per_page', 15)));
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

    /**
     * Supplier statement: har wo cheez jo hamare dene ko hilati hai (bills,
     * payments, manual adjustments), running total ke sath.
     */
    public function ledger(Supplier $supplier)
    {
        return response()->json([
            'supplier' => new SupplierResource($supplier),
            'balance' => (int) $supplier->balance,
            'rows' => $this->history->ledger($supplier),
        ]);
    }

    /** Poori history: KPIs, khata, aur har bill aur payment jo us ke peechay hai. */
    public function history(Supplier $supplier)
    {
        $data = $this->history->history($supplier);

        return response()->json([
            'supplier' => new SupplierResource($data['supplier']),
            'summary' => $data['summary'],
            'ledger' => $data['ledger'],
            'purchases' => MaterialPurchaseResource::collection($data['purchases']),
            'payments' => PaymentResource::collection($data['payments']),
            'adjustments' => $data['adjustments']->map(fn ($a) => [
                'id' => $a->id,
                'reference' => $a->reference,
                'mode' => $a->mode,
                'adjustment_date' => $a->adjustment_date?->toDateString(),
                'amount' => (int) $a->amount,
                'reason' => $a->reason,
            ])->values(),
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
