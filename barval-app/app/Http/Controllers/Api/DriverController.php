<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use App\Http\Resources\DriverResource;
use App\Http\Resources\PaymentResource;
use App\Models\Driver;
use App\Models\Payment;
use App\Models\TransportTrip;
use App\Services\Payments\PaymentService;
use App\Support\Money;
use Illuminate\Http\Request;

class DriverController extends Controller
{
    use HasTableQuery;

    public function __construct(private PaymentService $payments) {}

    public function index(Request $request)
    {
        $query = Driver::query();
        $this->applyTableQuery($query, $request, ['name', 'phone', 'balance', 'vehicle_name'], ['name', 'phone', 'vehicle_name'], 'name');

        return DriverResource::collection($query->paginate($request->integer('per_page', 50)));
    }

    public function store(Request $request)
    {
        return new DriverResource(Driver::create($this->validateData($request)));
    }

    public function update(Request $request, Driver $driver)
    {
        $driver->update($this->validateData($request));

        return new DriverResource($driver);
    }

    /** Pay outstanding dues to a driver. */
    public function pay(Request $request, Driver $driver)
    {
        $data = $request->validate([
            'payment_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:method,bank'],
            'notes' => ['nullable', 'string'],
        ], [
            'bank_ref.required_if' => 'Bank payment par bank/reference likhna zaroori hai.',
        ]);
        $data['amount'] = Money::toPaisa($data['amount']);

        $payment = $this->payments->settleParty($driver, $data);

        return new PaymentResource($payment);
    }

    /** Give an advance to a driver (baqi ke bina — balance jama ho jata hai). */
    public function advance(Request $request, Driver $driver)
    {
        $data = $request->validate([
            'payment_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:method,bank'],
            'notes' => ['nullable', 'string'],
        ], [
            'bank_ref.required_if' => 'Bank payment par bank/reference likhna zaroori hai.',
        ]);
        $data['amount'] = Money::toPaisa($data['amount']);

        return new PaymentResource($this->payments->advanceToParty($driver, $data));
    }

    public function destroy(Driver $driver)
    {
        try {
            $driver->delete();
        } catch (\Illuminate\Database\QueryException) {
            return response()->json(['message' => 'Driver ka record use me hai — delete nahi ho sakta. Inactive karein.'], 422);
        }

        return response()->noContent();
    }

    public function ledger(Driver $driver)
    {
        $trips = TransportTrip::where('driver_id', $driver->id)->get()->map(fn (TransportTrip $t) => [
            'date' => $t->trip_date->toDateString(),
            'reference' => $t->reference,
            'description' => 'Trip charge',
            'credit' => (int) $t->rate,   // increases dues
            'debit' => (int) $t->paid,    // settled at trip time
        ]);

        $payments = Payment::where('party_type', $driver->getMorphClass())
            ->where('party_id', $driver->id)->get()->map(fn (Payment $p) => [
                'date' => $p->payment_date->toDateString(),
                'reference' => $p->reference,
                'description' => $p->notes ?: 'Payment made',
                'credit' => 0,
                'debit' => (int) $p->amount,
            ]);

        return response()->json([
            'driver' => new DriverResource($driver),
            'balance' => (int) $driver->balance,
            'rows' => $trips->concat($payments)->sortBy('date')->values(),
        ]);
    }

    private function validateData(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['required', 'string', 'max:50'],
            'license_no' => ['nullable', 'string', 'max:50'],
            'vehicle_name' => ['required', 'string', 'max:255'],
            'vehicle_plate' => ['nullable', 'string', 'max:50'],
            'is_active' => ['boolean'],
        ], [
            'phone.required' => 'Driver ka phone number zaroori hai.',
            'vehicle_name.required' => 'Gaadi ka naam zaroori hai.',
        ]);
    }
}
