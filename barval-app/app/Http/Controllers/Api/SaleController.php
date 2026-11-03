<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
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
    use HasTableQuery;

    public function __construct(private SaleService $service, private PaymentService $payments) {}

    public function index(Request $request)
    {
        $query = Sale::query()
            ->with(['customer', 'dispatches:id,sale_id,reference,dispatch_date,status,driver_id', 'dispatches.driver:id,name'])
            ->when($request->customer_id, fn ($q, $id) => $q->where('customer_id', $id))
            ->when($request->type, fn ($q, $t) => $q->where('type', $t))
            ->when($request->status, fn ($q, $s) => $q->where('status', $s))
            ->when($request->from, fn ($q, $d) => $q->whereDate('sale_date', '>=', $d))
            ->when($request->to, fn ($q, $d) => $q->whereDate('sale_date', '<=', $d));

        $this->applyTableQuery(
            $query,
            $request,
            sortable: ['sale_date', 'invoice_no', 'type', 'total', 'paid', 'balance', 'status'],
            searchable: ['invoice_no'],
            defaultSort: 'sale_date',
            searchRelations: ['customer' => ['name']],
        );

        return SaleResource::collection($query->paginate($request->integer('per_page', 15)));
    }

    public function store(StoreSaleRequest $request)
    {
        $sale = $this->service->create($this->toPaisa($request->validated()));

        return new SaleResource($sale);
    }

    /** Galat likha hua bill theek karna. Invoice number wahi rehta hai. */
    public function update(StoreSaleRequest $request, Sale $sale)
    {
        $data = $this->toPaisa($request->validated());

        return new SaleResource($this->service->update($sale, $data));
    }

    /** Rupay se paisa, sirf controller ki hadd par. */
    private function toPaisa(array $data): array
    {
        foreach (['discount', 'transport_fare', 'paid'] as $field) {
            if (isset($data[$field])) {
                $data[$field] = Money::toPaisa($data[$field]);
            }
        }
        foreach ($data['items'] as &$item) {
            if (isset($item['unit_price'])) {
                $item['unit_price'] = Money::toPaisa($item['unit_price']);
            }
        }
        unset($item);

        return $data;
    }

    public function show(Sale $sale)
    {
        return new SaleResource($sale->load(['items.product', 'customer']));
    }

    /** Delete a wrongly-entered sale (reverses stock, receivable and ledger). */
    public function destroy(Sale $sale)
    {
        $this->service->void($sale);

        return response()->noContent();
    }

    /** Receive (part of) the outstanding balance on this invoice. */
    public function receive(Request $request, Sale $sale)
    {
        $data = $request->validate([
            'payment_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:method,bank'],
        ], [
            'bank_ref.required_if' => 'Bank payment par bank/reference likhna zaroori hai.',
        ]);
        $data['amount'] = Money::toPaisa($data['amount']);

        return new PaymentResource(($this->payments->receiveForSale($sale, $data))->load(['party', 'allocatable']));
    }
}
