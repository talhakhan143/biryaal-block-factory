<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePurchaseRequest;
use App\Http\Resources\MaterialPurchaseResource;
use App\Models\MaterialPurchase;
use App\Services\Purchasing\PurchaseService;
use App\Support\Money;
use Illuminate\Http\Request;

class MaterialPurchaseController extends Controller
{
    public function __construct(private PurchaseService $service) {}

    public function index(Request $request)
    {
        $purchases = MaterialPurchase::query()
            ->with(['supplier', 'rawMaterial'])
            ->when($request->supplier_id, fn ($q, $id) => $q->where('supplier_id', $id))
            ->when($request->payment_status, fn ($q, $s) => $q->where('payment_status', $s))
            ->when($request->from, fn ($q, $d) => $q->whereDate('purchase_date', '>=', $d))
            ->when($request->to, fn ($q, $d) => $q->whereDate('purchase_date', '<=', $d))
            ->latest('purchase_date')
            ->paginate($request->integer('per_page', 15));

        return MaterialPurchaseResource::collection($purchases);
    }

    public function store(StorePurchaseRequest $request)
    {
        $data = $request->validated();

        // convert rupee inputs to integer paisa
        foreach (['unit_cost', 'transport_cost', 'loading_cost', 'unloading_cost', 'paid_amount'] as $field) {
            if (isset($data[$field])) {
                $data[$field] = Money::toPaisa($data[$field]);
            }
        }

        $purchase = $this->service->record($data);

        return new MaterialPurchaseResource($purchase->load(['supplier', 'rawMaterial']));
    }

    public function show(MaterialPurchase $materialPurchase)
    {
        return new MaterialPurchaseResource($materialPurchase->load(['supplier', 'rawMaterial']));
    }
}
