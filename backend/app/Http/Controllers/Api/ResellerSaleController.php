<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use App\Http\Resources\ResellerPaymentResource;
use App\Http\Resources\ResellerSaleResource;
use App\Models\ResellerSale;
use App\Services\Reseller\ResellerSalesService;
use App\Support\Money;
use Illuminate\Http\Request;

class ResellerSaleController extends Controller
{
    use HasTableQuery;

    public function __construct(private ResellerSalesService $service) {}

    public function index(Request $request)
    {
        $query = ResellerSale::query()
            ->with('customer')
            ->when($request->customer_id, fn ($q, $id) => $q->where('customer_id', $id))
            ->when($request->status, fn ($q, $s) => $q->where('status', $s));

        $this->applyTableQuery(
            $query,
            $request,
            ['sale_date', 'total', 'balance', 'status'],
            ['invoice_no'],
            'sale_date',
            ['customer' => ['name']],
        );

        return ResellerSaleResource::collection($query->paginate($request->integer('per_page', 15)));
    }

    public function show(ResellerSale $resellerSale)
    {
        return new ResellerSaleResource($resellerSale->load('items.item', 'customer'));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'customer_id' => ['nullable', 'uuid', 'exists:customers,id', 'required_if:type,credit'],
            'sale_date' => ['required', 'date'],
            'type' => ['required', 'in:cash,credit'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'transport_fare' => ['nullable', 'numeric', 'min:0'],
            'paid' => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:payment_method,bank'],
            'notes' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.reseller_item_id' => ['required', 'uuid', 'exists:reseller_items,id'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.unit_price' => ['nullable', 'numeric', 'min:0'],
        ], [
            'customer_id.required_if' => 'Udhaar wale bill ke liye customer zaroori hai.',
            'bank_ref.required_if' => 'Bank payment par bank/reference likhna zaroori hai.',
        ]);

        foreach (['discount', 'transport_fare', 'paid'] as $f) {
            if (isset($data[$f])) {
                $data[$f] = Money::toPaisa($data[$f]);
            }
        }
        foreach ($data['items'] as &$it) {
            if (isset($it['unit_price'])) {
                $it['unit_price'] = Money::toPaisa($it['unit_price']);
            }
        }
        unset($it);

        return new ResellerSaleResource($this->service->createSale($data));
    }

    public function receive(Request $request, ResellerSale $resellerSale)
    {
        $data = $request->validate([
            'payment_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:method,bank'],
        ], ['bank_ref.required_if' => 'Bank payment par bank/reference likhna zaroori hai.']);
        $data['amount'] = Money::toPaisa($data['amount']);

        $payment = $this->service->receiveForSale($resellerSale, $data);

        return (new ResellerSaleResource($resellerSale->fresh()->load('items.item', 'customer')))
            ->additional(['payment' => new ResellerPaymentResource($payment->load(['supplier', 'customer', 'sale', 'purchase', 'rental', 'salesReturn']))]);
    }

    public function destroy(ResellerSale $resellerSale)
    {
        $this->service->voidSale($resellerSale);

        return response()->noContent();
    }
}
