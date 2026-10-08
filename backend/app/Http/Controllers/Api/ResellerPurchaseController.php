<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use App\Http\Resources\ResellerPaymentResource;
use App\Http\Resources\ResellerPurchaseResource;
use App\Models\ResellerPurchase;
use App\Services\Reseller\ResellerService;
use App\Support\Money;
use Illuminate\Http\Request;

class ResellerPurchaseController extends Controller
{
    use HasTableQuery;

    public function __construct(private ResellerService $service) {}

    public function index(Request $request)
    {
        $query = ResellerPurchase::query()
            ->with(['supplier', 'item'])
            ->when($request->reseller_supplier_id, fn ($q, $id) => $q->where('reseller_supplier_id', $id))
            ->when($request->payment_status, fn ($q, $s) => $q->where('payment_status', $s));

        $this->applyTableQuery(
            $query,
            $request,
            ['purchase_date', 'total_cost', 'quantity', 'payment_status'],
            ['reference'],
            'purchase_date',
            ['supplier' => ['name'], 'item' => ['name']],
        );

        return ResellerPurchaseResource::collection($query->paginate($request->integer('per_page', 15)));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'reseller_supplier_id' => ['required', 'uuid', 'exists:reseller_suppliers,id'],
            'reseller_item_id' => ['required', 'uuid', 'exists:reseller_items,id'],
            'purchase_date' => ['required', 'date'],
            'quantity' => ['required', 'numeric', 'gt:0'],
            'unit_cost' => ['required', 'numeric', 'min:0'],
            'sale_price' => ['nullable', 'numeric', 'min:0'], // retail (customer) rate
            'transport_cost' => ['nullable', 'numeric', 'min:0'],
            'loading_cost' => ['nullable', 'numeric', 'min:0'],
            'unloading_cost' => ['nullable', 'numeric', 'min:0'],
            'paid_amount' => ['nullable', 'numeric', 'min:0'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:method,bank'],
            'notes' => ['nullable', 'string'],
        ], ['bank_ref.required_if' => 'Bank payment par bank/reference likhna zaroori hai.']);

        foreach (['unit_cost', 'sale_price', 'transport_cost', 'loading_cost', 'unloading_cost', 'paid_amount'] as $f) {
            if (isset($data[$f])) {
                $data[$f] = Money::toPaisa($data[$f]);
            }
        }

        return new ResellerPurchaseResource($this->service->recordPurchase($data)->load(['supplier', 'item']));
    }

    public function pay(Request $request, ResellerPurchase $resellerPurchase)
    {
        $data = $request->validate([
            'payment_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:method,bank'],
        ], ['bank_ref.required_if' => 'Bank payment par bank/reference likhna zaroori hai.']);
        $data['amount'] = Money::toPaisa($data['amount']);

        $payment = $this->service->payPurchase($resellerPurchase, $data);

        return (new ResellerPurchaseResource($resellerPurchase->fresh()->load(['supplier', 'item'])))
            ->additional(['payment' => new ResellerPaymentResource($payment->load(['supplier', 'customer', 'sale', 'purchase', 'rental', 'salesReturn']))]);
    }
}
