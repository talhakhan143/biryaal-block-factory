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
        $sortable = ['trip_date', 'rate', 'paid', 'balance', 'status', 'reference'];
        $sort = in_array($request->sort, $sortable, true) ? $request->sort : 'trip_date';
        $dir = $request->dir === 'asc' ? 'asc' : 'desc';

        $trips = TransportTrip::query()
            ->with(['vehicle', 'driver'])
            ->when($request->driver_id, fn ($q, $id) => $q->where('driver_id', $id))
            ->when($request->status, fn ($q, $s) => $q->where('status', $s))
            ->when($request->search, fn ($q, $s) => $q->where(function ($q) use ($s) {
                $q->where('reference', 'like', "%{$s}%")
                    ->orWhereHas('driver', fn ($q) => $q->where('name', 'like', "%{$s}%"))
                    ->orWhereHas('vehicle', fn ($q) => $q->where('name', 'like', "%{$s}%"));
            }))
            ->orderBy($sort, $dir)
            ->orderBy('created_at', 'desc') // newest-first tiebreak
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
