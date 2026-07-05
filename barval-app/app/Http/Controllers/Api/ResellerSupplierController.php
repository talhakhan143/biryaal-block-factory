<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use App\Http\Resources\ResellerSupplierResource;
use App\Models\ResellerSupplier;
use App\Services\Reseller\ResellerService;
use App\Support\Money;
use Illuminate\Http\Request;

class ResellerSupplierController extends Controller
{
    use HasTableQuery;

    public function __construct(private ResellerService $service) {}

    public function index(Request $request)
    {
        $query = ResellerSupplier::query()
            ->when($request->boolean('active_only'), fn ($q) => $q->where('is_active', true));

        $this->applyTableQuery($query, $request, ['name', 'balance'], ['name', 'phone'], 'name');

        return ResellerSupplierResource::collection($query->paginate($request->integer('per_page', 100)));
    }

    public function store(Request $request)
    {
        return new ResellerSupplierResource(ResellerSupplier::create($request->validate($this->rules())));
    }

    public function update(Request $request, ResellerSupplier $resellerSupplier)
    {
        $resellerSupplier->update($request->validate($this->rules()));

        return new ResellerSupplierResource($resellerSupplier);
    }

    /** Pay off (part of) a supplier's udhaar — spread across their bills. */
    public function pay(Request $request, ResellerSupplier $resellerSupplier)
    {
        $data = $request->validate([
            'payment_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:method,bank'],
        ], ['bank_ref.required_if' => 'Bank payment par bank/reference likhna zaroori hai.']);
        $data['amount'] = Money::toPaisa($data['amount']);

        $this->service->paySupplier($resellerSupplier, $data);

        return new ResellerSupplierResource($resellerSupplier->fresh());
    }

    public function destroy(ResellerSupplier $resellerSupplier)
    {
        if ((int) $resellerSupplier->balance !== 0) {
            return response()->json(['message' => 'Is supplier ka hisab baqi hai — pehle clear karein.'], 422);
        }
        $resellerSupplier->delete();

        return response()->noContent();
    }

    private function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'address' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:255'],
            'is_active' => ['boolean'],
        ];
    }
}
