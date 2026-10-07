<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use App\Http\Resources\PaymentResource;
use App\Http\Resources\TransportTripResource;
use App\Models\TransportTrip;
use App\Services\Payments\PaymentService;
use App\Services\Transport\TransportService;
use App\Support\Money;
use Illuminate\Http\Request;

class TransportController extends Controller
{
    use HasTableQuery;

    public function __construct(private TransportService $service, private PaymentService $payments) {}

    public function index(Request $request)
    {
        $query = TransportTrip::query()
            ->with(['vehicle', 'driver'])
            ->when($request->driver_id, fn ($q, $id) => $q->where('driver_id', $id))
            ->when($request->kind, fn ($q, $k) => $q->where('kind', $k))
            ->when($request->status, fn ($q, $s) => $q->where('status', $s));

        $this->applyTableQuery(
            $query,
            $request,
            ['trip_date', 'rate', 'paid', 'balance', 'status', 'reference'],
            ['reference', 'vehicle_label', 'from_location', 'to_location'],
            'trip_date',
            ['driver' => ['name'], 'vehicle' => ['name', 'plate']],
        );

        return TransportTripResource::collection($query->paginate($request->integer('per_page', 15)));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'vehicle_id' => ['nullable', 'uuid', 'exists:vehicles,id'],
            'driver_id' => ['required', 'uuid', 'exists:drivers,id'],
            'dispatch_id' => ['nullable', 'uuid', 'exists:dispatches,id'],
            'material_purchase_id' => ['nullable', 'uuid', 'exists:material_purchases,id'],
            'kind' => ['nullable', 'in:in,out'],
            'trip_date' => ['required', 'date'],
            'from_location' => ['nullable', 'string', 'max:255'],
            'to_location' => ['nullable', 'string', 'max:255'],
            'rate' => ['required', 'numeric', 'gt:0'],
            'paid' => ['nullable', 'numeric', 'min:0', 'lte:rate'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:method,bank'],
            'notes' => ['nullable', 'string'],
        ], [
            'bank_ref.required_if' => 'Bank payment par bank/reference likhna zaroori hai.',
        ]);
        $data['rate'] = Money::toPaisa($data['rate']);
        if (isset($data['paid'])) {
            $data['paid'] = Money::toPaisa($data['paid']);
        }

        return new TransportTripResource($this->service->recordTrip($data)->load(['vehicle', 'driver']));
    }

    /** Pay (part of) a trip's fare to its driver. */
    public function pay(Request $request, TransportTrip $transportTrip)
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

        return new PaymentResource($this->payments->payForTrip($transportTrip, $data));
    }
}
