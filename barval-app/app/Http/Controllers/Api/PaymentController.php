<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use App\Http\Resources\CustomerResource;
use App\Http\Resources\PaymentResource;
use App\Models\Customer;
use App\Models\Driver;
use App\Models\Labourer;
use App\Models\Payment;
use App\Models\Salary;
use App\Models\Staff;
use App\Models\Supplier;
use App\Services\Payments\PaymentService;
use App\Support\Money;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    use HasTableQuery;

    public function __construct(private PaymentService $service) {}

    public function index(Request $request)
    {
        $query = Payment::query()
            ->with(['party', 'allocatable'])
            ->when($request->direction, fn ($q, $d) => $q->where('direction', $d))
            ->when($request->from, fn ($q, $d) => $q->whereDate('payment_date', '>=', $d))
            ->when($request->to, fn ($q, $d) => $q->whereDate('payment_date', '<=', $d));

        $this->applyTableQuery(
            $query,
            $request,
            ['payment_date', 'amount', 'direction', 'method', 'reference'],
            ['reference', 'notes'],
            'payment_date',
            [],
            ['party' => [Customer::class, Supplier::class, Driver::class, Labourer::class, Staff::class]],
        );

        return PaymentResource::collection($query->paginate($request->integer('per_page', 15)));
    }

    /**
     * Every party we owe money to, in one list, suppliers, drivers, labourers
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
                'name' => ($sal->staff?->name ?? 'Staff').', '.$sal->month,
                'balance' => (int) $sal->balance,
            ]));

        return response()->json(['data' => $rows->sortByDesc('balance')->values()]);
    }

    /**
     * Everyone who is holding an advance from us, i.e. a NEGATIVE balance,
     * money we paid before any dues existed. Returned as a positive `advance`
     * amount. These work off automatically as future wages/charges accrue.
     */
    public function advances()
    {
        $rows = collect();

        Driver::where('balance', '<', 0)->get(['id', 'name', 'balance'])
            ->each(fn ($d) => $rows->push(['type' => 'driver', 'id' => $d->id, 'name' => $d->name, 'advance' => (int) abs((int) $d->balance)]));

        Labourer::where('balance', '<', 0)->get(['id', 'name', 'balance'])
            ->each(fn ($l) => $rows->push(['type' => 'labourer', 'id' => $l->id, 'name' => $l->name, 'advance' => (int) abs((int) $l->balance)]));

        Supplier::where('balance', '<', 0)->get(['id', 'name', 'balance'])
            ->each(fn ($s) => $rows->push(['type' => 'supplier', 'id' => $s->id, 'name' => $s->name, 'advance' => (int) abs((int) $s->balance)]));

        Salary::with('staff:id,name')->where('balance', '<', 0)->get()
            ->each(fn ($sal) => $rows->push([
                'type' => 'salary',
                'id' => $sal->id,
                'name' => ($sal->staff?->name ?? 'Staff').', '.$sal->month,
                'advance' => (int) abs((int) $sal->balance),
            ]));

        // Customer ka advance ulti taraf ka hai: wo paisa humne diya nahi, pakad
        // rakha hai. Is liye alag list me jata hai, warna "advance diye" ka
        // matlab hi badal jata hai aur hisaab ulta parh liya jata hai.
        $received = Customer::where('balance', '<', 0)
            ->orderBy('balance')
            ->get(['id', 'name', 'phone', 'balance'])
            ->map(fn (Customer $c) => [
                'id' => $c->id,
                'name' => $c->name,
                'phone' => $c->phone,
                'advance' => (int) abs((int) $c->balance),
            ])
            ->values();

        return response()->json([
            'data' => $rows->sortByDesc('advance')->values(),
            'received' => $received,
        ]);
    }

    /** Galat likhi hui payment wapas lena. Khata aur bills purani haalat par. */
    public function destroy(Payment $payment)
    {
        $this->service->reverse($payment);

        return response()->noContent();
    }

    /** Rakam, tareekh ya tareeqa theek karna. Reference wahi rehta hai. */
    public function update(Request $request, Payment $payment)
    {
        $data = $request->validate([
            'payment_date' => ['sometimes', 'required', 'date'],
            'amount' => ['sometimes', 'required', 'numeric', 'gt:0'],
            'method' => ['sometimes', 'required', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:method,bank'],
            'notes' => ['nullable', 'string'],
        ], [
            'bank_ref.required_if' => 'Bank payment par bank/reference likhna zaroori hai.',
        ]);
        if (isset($data['amount'])) {
            $data['amount'] = Money::toPaisa($data['amount']);
        }

        return new PaymentResource($this->service->update($payment, $data)->load(['party', 'allocatable']));
    }

    /**
     * Advance from a customer: paisa pehle, maal baad me. Har agli sale khud
     * is me se kat jati hai, kyunki dono aik hi receivable account par chalti
     * hain. Receipt ki tarah hi `payments.receive` par hai.
     */
    public function advance(Request $request, Customer $customer)
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

        $payment = $this->service->advanceFromCustomer($customer, $data);

        return (new PaymentResource($payment->load(['party', 'allocatable'])))
            ->additional(['customer' => new CustomerResource($customer->fresh())])
            ->response()
            ->setStatusCode(201);
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

        return new PaymentResource($payment->load(['party', 'allocatable']));
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

        return new PaymentResource($payment->load(['party', 'allocatable']));
    }
}
