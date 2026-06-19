<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ExpenseResource;
use App\Models\Expense;
use App\Services\Expenses\ExpenseService;
use App\Support\Money;
use Illuminate\Http\Request;

class ExpenseController extends Controller
{
    public function __construct(private ExpenseService $service) {}

    public function index(Request $request)
    {
        $expenses = Expense::query()
            ->when($request->category, fn ($q, $c) => $q->where('category', $c))
            ->when($request->from, fn ($q, $d) => $q->whereDate('expense_date', '>=', $d))
            ->when($request->to, fn ($q, $d) => $q->whereDate('expense_date', '<=', $d))
            ->latest('expense_date')
            ->paginate($request->integer('per_page', 15));

        return ExpenseResource::collection($expenses);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'expense_date' => ['required', 'date'],
            'category' => ['required', 'in:electricity,diesel,maintenance,internet,other'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:method,bank'],
            'title' => ['required', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
        ], [
            'bank_ref.required_if' => 'Bank payment par bank/reference likhna zaroori hai.',
        ]);
        $data['amount'] = Money::toPaisa($data['amount']);

        $expense = $this->service->record($data);

        return new ExpenseResource($expense);
    }

    public function show(Expense $expense)
    {
        return new ExpenseResource($expense);
    }
}
