<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\DispatchResource;
use App\Models\Dispatch;
use App\Services\Dispatch\DispatchService;
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
        ]);

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
