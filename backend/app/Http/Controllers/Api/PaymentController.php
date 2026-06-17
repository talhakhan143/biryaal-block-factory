<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PaymentResource;
use App\Models\Payment;
use App\Services\Payments\PaymentService;
use App\Support\Money;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    public function __construct(private PaymentService $service) {}

    public function index(Request $request)
    {
        $payments = Payment::query()
            ->with('party')
            ->when($request->search, function ($q, $s) {
                $q->where('reference', 'like', "%{$s}%")
                    ->orWhereHasMorph(
                        'party',
                        [\App\Models\Customer::class, \App\Models\Supplier::class, \App\Models\Driver::class, \App\Models\Labourer::class, \App\Models\Staff::class],
                        fn ($q) => $q->where('name', 'like', "%{$s}%"),
                    );
            })
            ->when($request->direction, fn ($q, $d) => $q->where('direction', $d))
            ->when($request->from, fn ($q, $d) => $q->whereDate('payment_date', '>=', $d))
            ->when($request->to, fn ($q, $d) => $q->whereDate('payment_date', '<=', $d))
            ->latest('payment_date')
            ->paginate($request->integer('per_page', 15));

        return PaymentResource::collection($payments);
    }

    public function receipt(Request $request)
    {
        $data = $request->validate([
            'customer_id' => ['required', 'uuid', 'exists:customers,id'],
            'payment_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:method,bank'],
            'notes' => ['nullable', 'string'],
        ], [
            'bank_ref.required_if' => 'Bank payment par bank/reference likhna zaroori hai.',
        ]);
        $data['amount'] = Money::toPaisa($data['amount']);

        $payment = $this->service->receiveFromCustomer($data);

        return new PaymentResource($payment->load('party'));
    }

    public function payment(Request $request)
    {
        $data = $request->validate([
            'supplier_id' => ['required', 'uuid', 'exists:suppliers,id'],
            'payment_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:method,bank'],
            'notes' => ['nullable', 'string'],
        ], [
            'bank_ref.required_if' => 'Bank payment par bank/reference likhna zaroori hai.',
        ]);
        $data['amount'] = Money::toPaisa($data['amount']);

        $payment = $this->service->payToSupplier($data);

        return new PaymentResource($payment->load('party'));
    }
}
