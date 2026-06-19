<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PaymentResource;
use App\Models\Driver;
use App\Models\Labourer;
use App\Models\Payment;
use App\Models\Salary;
use App\Models\Supplier;
use App\Services\Payments\PaymentService;
use App\Support\Money;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    public function __construct(private PaymentService $service) {}

    public function index(Request $request)
    {
        $sortable = ['payment_date', 'amount', 'direction', 'method', 'reference'];
        $sort = in_array($request->sort, $sortable, true) ? $request->sort : 'payment_date';
        $dir = $request->dir === 'asc' ? 'asc' : 'desc';

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
            ->orderBy($sort, $dir)
            ->orderBy('created_at', 'desc')
            ->paginate($request->integer('per_page', 15));

        return PaymentResource::collection($payments);
    }

    /**
     * Every party we owe money to, in one list — suppliers, drivers, labourers
     * and unpaid staff salaries. So no single person is left out of payables.
     */
    public function payables()
    {
        $rows = collect();

        Supplier::where('balance', '>', 0)->get(['id', 'name', 'balance'])
            ->each(fn ($s) => $rows->push(['type' => 'supplier', 'id' => $s->id, 'name' => $s->name, 'balance' => (int) $s->balance]));

        Driver::where('balance', '>', 0)->get(['id', 'name', 'balance'])
            ->each(fn ($d) => $rows->push(['type' => 'driver', 'id' => $d->id, 'name' => $d->name, 'balance' => (int) $d->balance]));

        Labourer::where('balance', '>', 0)->get(['id', 'name', 'balance'])
            ->each(fn ($l) => $rows->push(['type' => 'labourer', 'id' => $l->id, 'name' => $l->name, 'balance' => (int) $l->balance]));

        Salary::with('staff:id,name')->where('balance', '>', 0)->get()
            ->each(fn ($sal) => $rows->push([
                'type' => 'salary',
                'id' => $sal->id,
                'name' => ($sal->staff?->name ?? 'Staff').' — '.$sal->month,
                'balance' => (int) $sal->balance,
            ]));

        return response()->json(['data' => $rows->sortByDesc('balance')->values()]);
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
