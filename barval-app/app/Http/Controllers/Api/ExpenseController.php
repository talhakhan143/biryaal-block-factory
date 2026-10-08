<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use App\Http\Resources\ExpenseResource;
use App\Models\Expense;
use App\Services\Expenses\CostSummaryService;
use App\Services\Expenses\ExpenseService;
use App\Support\Money;
use Illuminate\Contracts\Auth\Access\Gate as GateContract;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

class ExpenseController extends Controller
{
    use HasTableQuery;

    public function __construct(private ExpenseService $service, private CostSummaryService $costs) {}

    public function index(Request $request)
    {
        $query = $this->filtered($request);

        $this->applyTableQuery($query, $request, ['expense_date', 'amount', 'category'], ['category', 'title', 'reference'], 'expense_date');

        return ExpenseResource::collection($query->paginate($request->integer('per_page', 15)));
    }

    /**
     * What the filtered list adds up to, plus every OTHER cost that hit the
     * ledger in the same window and can never show on this page (salaries,
     * labour wages, manual cash-out). Without this, a cost figure on the
     * dashboard has no page that can explain it.
     */
    public function summary(Request $request, GateContract $gate)
    {
        $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'category' => ['nullable', 'in:electricity,diesel,maintenance,internet,other'],
        ]);

        $direct = $this->filtered($request);
        $byCategory = (clone $direct)
            ->reorder()
            ->selectRaw('category, COUNT(*) as entries, COALESCE(SUM(amount),0) as total')
            ->groupBy('category')
            ->get()
            ->map(fn ($r) => ['category' => $r->category, 'entries' => (int) $r->entries, 'total' => (int) $r->total])
            ->sortByDesc('total')
            ->values();

        // Doosray kharch sirf date range ke hisaab se nikalte hain. Category ya
        // search lagi ho to wo filter un par lag hi nahi sakta, is liye unhein
        // dikhana gumraah karega.
        $scoped = ! $request->filled('category') && ! $request->filled('search');
        // Salary aur labour cost hai; Sales User ko deliberately nahi dikhti
        // (usi wajah se usay accounting.view nahi diya gaya).
        $maySeeAllCosts = $gate->allows('accounting.view');
        $other = $scoped && $maySeeAllCosts
            ? $this->costs->bySource($request->from, $request->to)->reject(fn ($r) => $r['key'] === 'Expense')->values()
            : collect();

        $directTotal = (int) (clone $direct)->reorder()->sum('amount');
        $otherTotal = (int) $other->sum('total');

        return response()->json([
            'from' => $request->from,
            'to' => $request->to,
            'direct' => [
                'entries' => (int) (clone $direct)->reorder()->count(),
                'total' => $directTotal,
                'by_category' => $byCategory,
            ],
            'other' => $other,
            'other_total' => $otherTotal,
            'other_available' => $scoped && $maySeeAllCosts,
            'grand_total' => $directTotal + $otherTotal,
        ]);
    }

    /** Shared filter so the list and its totals can never disagree. */
    private function filtered(Request $request): Builder
    {
        return Expense::query()
            ->when($request->category, fn ($q, $c) => $q->where('category', $c))
            ->when($request->from, fn ($q, $d) => $q->whereDate('expense_date', '>=', $d))
            ->when($request->to, fn ($q, $d) => $q->whereDate('expense_date', '<=', $d))
            ->when($request->search, fn ($q, $s) => $q->where(fn ($q) => $q
                ->orWhere('category', 'like', "%{$s}%")
                ->orWhere('title', 'like', "%{$s}%")
                ->orWhere('reference', 'like', "%{$s}%")));
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
