<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use App\Models\Payment;
use App\Models\Sale;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    use HasTableQuery;

    public function index(Request $request)
    {
        $query = Customer::query()
            ->when($request->boolean('has_dues'), fn ($q) => $q->where('balance', '>', 0));

        $this->applyTableQuery($query, $request, ['name', 'balance', 'phone'], ['name', 'phone'], 'name');

        return CustomerResource::collection($query->paginate($request->integer('per_page', 15)));
    }

    public function store(Request $request)
    {
        $customer = Customer::create($request->validate($this->rules()));

        return new CustomerResource($customer);
    }

    public function show(Customer $customer)
    {
        return new CustomerResource($customer);
    }

    public function update(Request $request, Customer $customer)
    {
        $customer->update($request->validate($this->rules()));

        return new CustomerResource($customer);
    }

    public function destroy(Customer $customer)
    {
        $customer->delete();

        return response()->noContent();
    }

    /** Customer statement: sales (debit) and receipts (credit). */
    public function ledger(Customer $customer)
    {
        $sales = $customer->sales()->get()->map(fn (Sale $s) => [
            'date' => $s->sale_date->toDateString(),
            'type' => 'sale',
            'reference' => $s->invoice_no,
            'description' => 'Sale invoice',
            'debit' => (int) $s->total,         // increases receivable
            'credit' => (int) $s->paid,         // immediate payment
        ]);

        $receipts = $customer->payments()->get()->map(fn (Payment $p) => [
            'date' => $p->payment_date->toDateString(),
            'type' => 'receipt',
            'reference' => $p->reference,
            'description' => 'Payment received',
            'debit' => 0,
            'credit' => (int) $p->amount,       // reduces receivable
        ]);

        $rows = $sales->concat($receipts)->sortBy('date')->values();

        return response()->json([
            'customer' => new CustomerResource($customer),
            'balance' => (int) $customer->balance,
            'rows' => $rows,
        ]);
    }

    private function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
