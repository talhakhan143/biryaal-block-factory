<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use App\Http\Resources\CustomerResource;
use App\Http\Resources\DispatchResource;
use App\Http\Resources\PaymentResource;
use App\Http\Resources\SaleResource;
use App\Http\Resources\SalesReturnResource;
use App\Models\Customer;
use App\Services\Customers\CustomerHistoryService;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class CustomerController extends Controller
{
    use HasTableQuery;

    public function __construct(private CustomerHistoryService $history) {}

    public function index(Request $request)
    {
        $query = Customer::query()
            ->when($request->boolean('has_dues'), fn ($q) => $q->where('balance', '>', 0))
            // Minus balance = in ka paisa hamare paas jama hai.
            ->when($request->boolean('has_advance'), fn ($q) => $q->where('balance', '<', 0));

        $this->applyTableQuery($query, $request, ['name', 'balance', 'phone', 'created_at'], ['name', 'phone'], 'created_at');

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
        // Balance par kuch para ho to delete nahi. Minus balance ka matlab is
        // ka paisa hamare paas hai; usay list se gayab karna sab se bura hai.
        $balance = (int) $customer->balance;
        if ($balance > 0) {
            throw ValidationException::withMessages([
                'customer' => 'Is customer se '.Money::format($balance).' lena baqi hai. Pehle hisaab saaf karein, phir delete.',
            ]);
        }
        if ($balance < 0) {
            throw ValidationException::withMessages([
                'customer' => 'Is customer ka '.Money::format(-$balance).' advance hamare paas jama hai. Pehle wo adjust ya wapas karein, phir delete.',
            ]);
        }

        $customer->delete();

        return response()->noContent();
    }

    /**
     * Customer statement: every event that moves `customers.balance` (sales,
     * receipts, account refunds, manual adjustments) with a running balance.
     */
    public function ledger(Customer $customer)
    {
        return response()->json([
            'customer' => new CustomerResource($customer),
            'balance' => (int) $customer->balance,
            'rows' => $this->history->factoryLedger($customer),
        ]);
    }

    /**
     * Poori history: KPIs, khata, aur har document jo us ke peechay hai.
     * Sirf block factory ka. Resellers Point ka apna alag portal aur apna alag
     * endpoint hai; dono kabhi mix nahi hote.
     */
    public function history(Customer $customer)
    {
        $data = $this->history->history($customer);

        return response()->json([
            'customer' => new CustomerResource($data['customer']),
            'summary' => $data['summary'],
            'ledger' => $data['ledger'],
            'sales' => SaleResource::collection($data['sales']),
            'receipts' => PaymentResource::collection($data['receipts']),
            'returns' => SalesReturnResource::collection($data['returns']),
            'adjustments' => $data['adjustments']->map(fn ($a) => [
                'id' => $a->id,
                'reference' => $a->reference,
                'mode' => $a->mode,
                'adjustment_date' => $a->adjustment_date?->toDateString(),
                'amount' => (int) $a->amount,
                'reason' => $a->reason,
            ])->values(),
            'dispatches' => DispatchResource::collection($data['dispatches']),
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
