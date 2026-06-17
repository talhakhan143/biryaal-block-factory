<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\DispatchResource;
use App\Models\Dispatch;
use App\Models\Sale;
use App\Services\Dispatch\DispatchService;
use App\Support\Money;
use Illuminate\Http\Request;

class DispatchController extends Controller
{
    public function __construct(private DispatchService $service) {}

    public function index(Request $request)
    {
        $dispatches = Dispatch::query()
            ->with(['customer', 'vehicle', 'driver'])
            ->when($request->status, fn ($q, $s) => $q->where('status', $s))
            ->when($request->from, fn ($q, $d) => $q->whereDate('dispatch_date', '>=', $d))
            ->when($request->to, fn ($q, $d) => $q->whereDate('dispatch_date', '<=', $d))
            ->latest('dispatch_date')
            ->paginate($request->integer('per_page', 15));

        return DispatchResource::collection($dispatches);
    }

    /** Sales (POS orders) that have not been dispatched yet. */
    public function pending()
    {
        $sales = Sale::with(['customer', 'items.product'])
            ->whereDoesntHave('dispatches')
            ->latest('sale_date')
            ->limit(100)
            ->get()
            ->map(fn (Sale $s) => [
                'sale_id' => $s->id,
                'invoice_no' => $s->invoice_no,
                'sale_date' => $s->sale_date->toDateString(),
                'customer_id' => $s->customer_id,
                'customer_name' => $s->customer?->name ?? 'Walk-in',
                'total' => (int) $s->total,
                'transport_fare' => (int) $s->transport_fare,
                'items' => $s->items->map(fn ($i) => [
                    'product_id' => $i->product_id,
                    'product_name' => $i->product?->name,
                    'quantity' => (int) $i->quantity,
                ]),
            ]);

        return response()->json(['data' => $sales]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'customer_id' => ['nullable', 'uuid', 'exists:customers,id'],
            'sale_id' => ['nullable', 'uuid', 'exists:sales,id'],
            'vehicle_id' => ['nullable', 'uuid', 'exists:vehicles,id'],
            'driver_id' => ['nullable', 'uuid', 'exists:drivers,id'],
            'dispatch_date' => ['required', 'date'],
            'notes' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'uuid', 'exists:products,id'],
            'items.*.quantity' => ['required', 'integer', 'gt:0'],
            // optional transport trip created with the dispatch
            'trip_rate' => ['nullable', 'numeric', 'min:0'],
            'trip_paid' => ['nullable', 'numeric', 'min:0'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255'],
        ]);

        if (isset($data['trip_rate'])) {
            $data['trip_rate'] = Money::toPaisa($data['trip_rate']);
        }
        if (isset($data['trip_paid'])) {
            $data['trip_paid'] = Money::toPaisa($data['trip_paid']);
        }

        return new DispatchResource($this->service->create($data));
    }

    public function show(Dispatch $dispatch)
    {
        return new DispatchResource($dispatch->load(['customer', 'vehicle', 'driver', 'items.product']));
    }

    public function deliver(Dispatch $dispatch)
    {
        return new DispatchResource($this->service->markDelivered($dispatch)->load(['customer', 'vehicle', 'driver']));
    }
}
