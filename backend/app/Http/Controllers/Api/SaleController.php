<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSaleRequest;
use App\Http\Resources\PaymentResource;
use App\Http\Resources\SaleResource;
use App\Models\Sale;
use App\Services\Payments\PaymentService;
use App\Services\Sales\SaleService;
use App\Support\Money;
use Illuminate\Http\Request;

class SaleController extends Controller
{
    public function __construct(private SaleService $service, private PaymentService $payments) {}

    public function index(Request $request)
    {
        $sales = Sale::query()
            ->with('customer')
            ->when($request->customer_id, fn ($q, $id) => $q->where('customer_id', $id))
            ->when($request->type, fn ($q, $t) => $q->where('type', $t))
            ->when($request->status, fn ($q, $s) => $q->where('status', $s))
            ->when($request->search, fn ($q, $s) => $q->where('invoice_no', 'like', "%{$s}%"))
            ->when($request->from, fn ($q, $d) => $q->whereDate('sale_date', '>=', $d))
            ->when($request->to, fn ($q, $d) => $q->whereDate('sale_date', '<=', $d))
            ->latest('sale_date')
            ->paginate($request->integer('per_page', 15));

        return SaleResource::collection($sales);
    }

    public function store(StoreSaleRequest $request)
    {
        $data = $request->validated();

        if (isset($data['discount'])) {
            $data['discount'] = Money::toPaisa($data['discount']);
        }
        if (isset($data['paid'])) {
            $data['paid'] = Money::toPaisa($data['paid']);
        }
        foreach ($data['items'] as &$item) {
            if (isset($item['unit_price'])) {
                $item['unit_price'] = Money::toPaisa($item['unit_price']);
            }
        }
        unset($item);

        $sale = $this->service->create($data);

        return new SaleResource($sale);
    }

    public function show(Sale $sale)
    {
        return new SaleResource($sale->load(['items.product', 'customer']));
    }

    /** Receive (part of) the outstanding balance on this invoice. */
    public function receive(Request $request, Sale $sale)
    {
        $data = $request->validate([
            'payment_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255'],
        ]);
        $data['amount'] = Money::toPaisa($data['amount']);

        return new PaymentResource($this->payments->receiveForSale($sale, $data));
    }
}
