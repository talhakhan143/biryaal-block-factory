<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SalesReturnResource;
use App\Models\SalesReturn;
use App\Services\Sales\SalesReturnService;
use App\Support\Money;
use Illuminate\Http\Request;

class SalesReturnController extends Controller
{
    public function __construct(private SalesReturnService $service) {}

    public function index(Request $request)
    {
        $returns = SalesReturn::query()
            ->with('customer')
            ->when($request->from, fn ($q, $d) => $q->whereDate('return_date', '>=', $d))
            ->when($request->to, fn ($q, $d) => $q->whereDate('return_date', '<=', $d))
            ->latest('return_date')
            ->paginate($request->integer('per_page', 15));

        return SalesReturnResource::collection($returns);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'sale_id' => ['nullable', 'uuid', 'exists:sales,id'],
            'customer_id' => ['nullable', 'uuid', 'exists:customers,id'],
            'return_date' => ['required', 'date'],
            'deduction' => ['nullable', 'numeric', 'min:0'],
            'refund_mode' => ['required', 'in:cash,bank,account'],
            'bank_ref' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'uuid', 'exists:products,id'],
            'items.*.quantity' => ['required', 'integer', 'gt:0'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
        ]);

        if (isset($data['deduction'])) {
            $data['deduction'] = Money::toPaisa($data['deduction']);
        }
        foreach ($data['items'] as &$item) {
            $item['unit_price'] = Money::toPaisa($item['unit_price']);
        }
        unset($item);

        return new SalesReturnResource($this->service->create($data));
    }

    public function show(SalesReturn $salesReturn)
    {
        return new SalesReturnResource($salesReturn->load('items.product', 'customer'));
    }
}
