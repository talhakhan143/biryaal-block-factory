<?php

namespace App\Http\Controllers\Api;

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
    public function __construct(private TransportService $service, private PaymentService $payments) {}

    public function index(Request $request)
    {
        $trips = TransportTrip::query()
            ->with(['vehicle', 'driver'])
            ->when($request->driver_id, fn ($q, $id) => $q->where('driver_id', $id))
            ->when($request->status, fn ($q, $s) => $q->where('status', $s))
            ->latest('trip_date')
            ->paginate($request->integer('per_page', 15));

        return TransportTripResource::collection($trips);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'vehicle_id' => ['nullable', 'uuid', 'exists:vehicles,id'],
            'driver_id' => ['required', 'uuid', 'exists:drivers,id'],
            'dispatch_id' => ['nullable', 'uuid', 'exists:dispatches,id'],
            'trip_date' => ['required', 'date'],
            'from_location' => ['nullable', 'string', 'max:255'],
            'to_location' => ['nullable', 'string', 'max:255'],
            'rate' => ['required', 'numeric', 'gt:0'],
            'paid' => ['nullable', 'numeric', 'min:0', 'lte:rate'],
            'method' => ['nullable', 'in:cash,bank'],
            'notes' => ['nullable', 'string'],
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
            'bank_ref' => ['nullable', 'string', 'max:255'],
        ]);
        $data['amount'] = Money::toPaisa($data['amount']);

        return new PaymentResource($this->payments->payForTrip($transportTrip, $data));
    }
}
