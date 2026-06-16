<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PaymentResource;
use App\Http\Resources\SalaryResource;
use App\Models\Salary;
use App\Services\Payroll\PayrollService;
use App\Support\Money;
use Illuminate\Http\Request;

class SalaryController extends Controller
{
    public function __construct(private PayrollService $service) {}

    public function index(Request $request)
    {
        $salaries = Salary::query()
            ->with('staff')
            ->when($request->staff_id, fn ($q, $id) => $q->where('staff_id', $id))
            ->when($request->month, fn ($q, $m) => $q->where('month', $m))
            ->when($request->status, fn ($q, $s) => $q->where('status', $s))
            ->latest('month')
            ->paginate($request->integer('per_page', 15));

        return SalaryResource::collection($salaries);
    }

    /** Generate (accrue) a monthly salary for a staff member. */
    public function store(Request $request)
    {
        $data = $request->validate([
            'staff_id' => ['required', 'uuid', 'exists:staff,id'],
            'month' => ['required', 'string', 'regex:/^\d{4}-\d{2}$/'],
            'amount' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string'],
        ]);
        if (isset($data['amount'])) {
            $data['amount'] = Money::toPaisa($data['amount']);
        }

        return new SalaryResource($this->service->generate($data)->load('staff'));
    }

    public function pay(Request $request, Salary $salary)
    {
        $data = $request->validate([
            'payment_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255'],
        ]);
        $data['amount'] = Money::toPaisa($data['amount']);

        return new PaymentResource($this->service->pay($salary, $data));
    }
}
