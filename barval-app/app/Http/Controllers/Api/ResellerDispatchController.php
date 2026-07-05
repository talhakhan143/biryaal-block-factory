<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use App\Http\Resources\ResellerDispatchResource;
use App\Models\ResellerDispatch;
use App\Models\ResellerSale;
use App\Services\Reseller\ResellerDispatchService;
use App\Support\Money;
use Illuminate\Http\Request;

class ResellerDispatchController extends Controller
{
    use HasTableQuery;

    public function __construct(private ResellerDispatchService $service) {}

    public function index(Request $request)
    {
        $query = ResellerDispatch::query()
            ->with(['customer', 'driver', 'vehicle', 'sale'])
            ->when($request->status, fn ($q, $s) => $q->where('status', $s));

        $this->applyTableQuery(
            $query,
            $request,
            ['dispatch_date', 'reference', 'status'],
            ['reference'],
            'dispatch_date',
            ['customer' => ['name'], 'driver' => ['name']],
        );

        return ResellerDispatchResource::collection($query->paginate($request->integer('per_page', 15)));
    }

    /** Reseller sales with items still left to deliver (partial allowed). */
    public function pending()
    {
        $sales = ResellerSale::with(['customer', 'items.item', 'dispatches.items'])
            ->latest('sale_date')
            ->limit(200)
            ->get();

        $orders = [];
        foreach ($sales as $s) {
            $dispatched = [];
            foreach ($s->dispatches as $disp) {
                foreach ($disp->items as $di) {
                    $dispatched[$di->reseller_item_id] = ($dispatched[$di->reseller_item_id] ?? 0) + (float) $di->quantity;
                }
            }

            $remaining = [];
            foreach ($s->items as $i) {
                $left = (float) $i->quantity - ($dispatched[$i->reseller_item_id] ?? 0);
                if ($left > 0) {
                    $remaining[] = [
                        'reseller_item_id' => $i->reseller_item_id,
                        'item_name' => $i->item?->name,
                        'unit' => $i->item?->unit,
                        'quantity' => $left,
                    ];
                }
            }

            if (! empty($remaining)) {
                $orders[] = [
                    'reseller_sale_id' => $s->id,
                    'invoice_no' => $s->invoice_no,
                    'sale_date' => $s->sale_date->toDateString(),
                    'customer_id' => $s->customer_id,
                    'customer_name' => $s->customer?->name ?? 'Walk-in',
                    'total' => (int) $s->total,
                    'transport_fare' => (int) $s->transport_fare,
                    'items' => $remaining,
                ];
            }
        }

        return response()->json(['data' => $orders]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'reseller_sale_id' => ['required', 'uuid', 'exists:reseller_sales,id'],
            'customer_id' => ['nullable', 'uuid', 'exists:customers,id'],
            'driver_id' => ['required', 'uuid', 'exists:drivers,id'],
            'vehicle_id' => ['nullable', 'uuid', 'exists:vehicles,id'],
            'dispatch_date' => ['required', 'date'],
            'notes' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.reseller_item_id' => ['required', 'uuid', 'exists:reseller_items,id'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'trip_rate' => ['nullable', 'numeric', 'min:0'],
            'trip_paid' => ['nullable', 'numeric', 'min:0', 'lte:trip_rate'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:method,bank'],
        ], [
            'reseller_sale_id.required' => 'Dispatch sirf kisi bikri ke against hota hai.',
            'driver_id.required' => 'Driver chunna zaroori hai — challan gaadi par jata hai.',
            'trip_paid.lte' => 'Driver ko diya gaya paisa kiraye se zyada nahi ho sakta.',
            'bank_ref.required_if' => 'Bank payment par bank/reference likhna zaroori hai.',
        ]);

        foreach (['trip_rate', 'trip_paid'] as $f) {
            if (isset($data[$f])) {
                $data[$f] = Money::toPaisa($data[$f]);
            }
        }

        return new ResellerDispatchResource($this->service->create($data));
    }

    public function show(ResellerDispatch $resellerDispatch)
    {
        return new ResellerDispatchResource($resellerDispatch->load('items.item', 'customer', 'driver', 'vehicle', 'sale'));
    }
}
