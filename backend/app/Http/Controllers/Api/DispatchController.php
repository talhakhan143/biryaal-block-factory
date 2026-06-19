<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use App\Http\Resources\DispatchResource;
use App\Models\Dispatch;
use App\Models\Sale;
use App\Services\Dispatch\DispatchService;
use App\Support\Money;
use Illuminate\Http\Request;

class DispatchController extends Controller
{
    use HasTableQuery;

    public function __construct(private DispatchService $service) {}

    public function index(Request $request)
    {
        $query = Dispatch::query()
            ->with(['customer', 'vehicle', 'driver'])
            ->when($request->status, fn ($q, $s) => $q->where('status', $s))
            ->when($request->from, fn ($q, $d) => $q->whereDate('dispatch_date', '>=', $d))
            ->when($request->to, fn ($q, $d) => $q->whereDate('dispatch_date', '<=', $d));

        $this->applyTableQuery(
            $query,
            $request,
            sortable: ['dispatch_date', 'reference', 'status'],
            searchable: ['reference'],
            defaultSort: 'dispatch_date',
            searchRelations: ['customer' => ['name'], 'driver' => ['name'], 'vehicle' => ['name']],
        );

        return DispatchResource::collection($query->paginate($request->integer('per_page', 15)));
    }

    /** Sales (POS orders) with blocks still left to deliver (partial allowed). */
    public function pending()
    {
        $sales = Sale::with(['customer', 'items.product', 'dispatches.items'])
            ->latest('sale_date')
            ->limit(200)
            ->get();

        $orders = [];
        foreach ($sales as $s) {
            // how much of each product already dispatched for this sale
            $dispatched = [];
            foreach ($s->dispatches as $disp) {
                foreach ($disp->items as $di) {
                    $dispatched[$di->product_id] = ($dispatched[$di->product_id] ?? 0) + (int) $di->quantity;
                }
            }

            $remainingItems = [];
            foreach ($s->items as $i) {
                $left = (int) $i->quantity - ($dispatched[$i->product_id] ?? 0);
                if ($left > 0) {
                    $remainingItems[] = [
                        'product_id' => $i->product_id,
                        'product_name' => $i->product?->name,
                        'quantity' => $left,   // remaining to deliver
                    ];
                }
            }

            if (! empty($remainingItems)) {
                $orders[] = [
                    'sale_id' => $s->id,
                    'invoice_no' => $s->invoice_no,
                    'sale_date' => $s->sale_date->toDateString(),
                    'customer_id' => $s->customer_id,
                    'customer_name' => $s->customer?->name ?? 'Walk-in',
                    'total' => (int) $s->total,
                    'transport_fare' => (int) $s->transport_fare,
                    'items' => $remainingItems,
                ];
            }
        }

        return response()->json(['data' => $orders]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            // a challan is always the delivery of a POS order on a vehicle:
            // order, driver and kiraya are all mandatory — no empty challans.
            'customer_id' => ['nullable', 'uuid', 'exists:customers,id'],
            'sale_id' => ['required', 'uuid', 'exists:sales,id'],
            'vehicle_id' => ['nullable', 'uuid', 'exists:vehicles,id'],
            'driver_id' => ['required', 'uuid', 'exists:drivers,id'],
            'dispatch_date' => ['required', 'date'],
            'notes' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'uuid', 'exists:products,id'],
            'items.*.quantity' => ['required', 'integer', 'gt:0'],
            'trip_rate' => ['required', 'numeric', 'gt:0'],
            'trip_paid' => ['nullable', 'numeric', 'min:0', 'lte:trip_rate'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:method,bank'],
        ], [
            'bank_ref.required_if' => 'Bank payment par bank/reference likhna zaroori hai.',
            'sale_id.required' => 'Dispatch sirf kisi POS order ke against hota hai.',
            'driver_id.required' => 'Driver chunna zaroori hai — challan gaadi par jata hai.',
            'trip_rate.required' => 'Kiraya (trip rate) likhna zaroori hai.',
            'trip_rate.gt' => 'Kiraya 0 se zyada hona chahiye.',
            'trip_paid.lte' => 'Driver ko diya gaya paisa kiraye se zyada nahi ho sakta.',
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
