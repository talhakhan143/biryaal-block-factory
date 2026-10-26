<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\Customer;
use App\Models\Driver;
use App\Models\Expense;
use App\Models\FinishedGoodsStock;
use App\Models\Labourer;
use App\Models\Payment;
use App\Models\ProductionBatch;
use App\Models\RawMaterial;
use App\Models\Salary;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        // Owner ki marzi: jo raqam usne Settings se chhupa di, wo yahin se nikal
        // jati hai. Screen ke paas khara banda devtools kholay to bhi kuch nahi.
        $chosen = $request->user()?->hiddenDashboardGroups() ?? [];

        // Jis ko accounting dekhne ki ijazat hi nahi, us ke browser tak raqam
        // pohanchni hi nahi chahiye. UI pehle se chhupa deta tha, magar JSON mein
        // khuli pari thi, aur counter wali machine isi account par chalti hai.
        $strip = $request->user()?->can('accounting.view') ? $chosen : User::DASHBOARD_GROUPS;

        $today = Carbon::today()->toDateString();
        $monthStart = Carbon::now()->startOfMonth()->toDateString();
        $monthEnd = Carbon::now()->endOfMonth()->toDateString();

        // ---- Today ----
        $todayProduction = (int) ProductionBatch::whereDate('production_date', $today)->sum('quantity_produced');
        $todaySales = (int) Sale::whereDate('sale_date', $today)->sum('total');
        $todayExpenses = (int) Expense::whereDate('expense_date', $today)->sum('amount');
        $todayBlocksSold = (int) SaleItem::whereHas('sale', fn ($q) => $q->whereDate('sale_date', $today))->sum('quantity');
        $todayMoneyIn = (int) Payment::where('direction', Payment::RECEIPT)->whereDate('payment_date', $today)->sum('amount');
        $todayMoneyOut = (int) Payment::where('direction', Payment::PAYMENT)->whereDate('payment_date', $today)->sum('amount');

        // ---- This month P&L (ledger-based). Cost = EVERY operating cost that
        //      hits the EXPENSE account: misc expenses + staff salaries + labour
        //      wages. Income = sales + other income/adjustments. ----
        $monthSalesTotal = (int) Sale::whereBetween('sale_date', [$monthStart, $monthEnd])->sum('total');
        $monthIncome = $this->accountNet(Account::SALES, 'credit', $monthStart, $monthEnd)
            + $this->accountNet(Account::OTHER_INCOME, 'credit', $monthStart, $monthEnd);
        $monthCost = $this->accountNet(Account::EXPENSE, 'debit', $monthStart, $monthEnd);
        $monthProfit = $monthIncome - $monthCost;

        // ---- Lifetime P&L + production ----
        $lifeIncome = $this->accountNet(Account::SALES, 'credit') + $this->accountNet(Account::OTHER_INCOME, 'credit');
        $lifeCost = $this->accountNet(Account::EXPENSE, 'debit');
        $lifeProfit = $lifeIncome - $lifeCost;
        $totalProduction = (int) ProductionBatch::sum('quantity_produced');
        $totalSold = (int) SaleItem::sum('quantity');

        // ---- Stock ----
        $stock = FinishedGoodsStock::select(
            DB::raw('COALESCE(SUM(curing_qty),0) curing'),
            DB::raw('COALESCE(SUM(ready_qty),0) ready'),
            DB::raw('COALESCE(SUM(damaged_qty),0) damaged'),
        )->first();

        // ---- Money owed vs advances. We split each party's signed balance:
        //      positive = we owe them (payable), negative = advance we've already
        //      paid (they work it off). Summing positives/negatives separately
        //      keeps both figures honest, the PAYABLE control account is just
        //      their net, so the books still reconcile. ----
        $receivables = (int) Customer::where('balance', '>', 0)->sum('balance');
        // Customers ka wo paisa jo hamare paas pehle se jama hai (minus balance).
        // Ye humara dena hai, lena nahi, is liye receivables se bilkul alag.
        $customerAdvances = (int) abs((int) Customer::where('balance', '<', 0)->sum('balance'));
        $payableBreakdown = [
            'suppliers' => (int) Supplier::where('balance', '>', 0)->sum('balance'),
            'drivers' => (int) Driver::where('balance', '>', 0)->sum('balance'),
            'labourers' => (int) Labourer::where('balance', '>', 0)->sum('balance'),
            'staff' => (int) Salary::where('balance', '>', 0)->sum('balance'),
        ];
        $payables = array_sum($payableBreakdown);
        $advanceBreakdown = [
            'suppliers' => (int) abs((int) Supplier::where('balance', '<', 0)->sum('balance')),
            'drivers' => (int) abs((int) Driver::where('balance', '<', 0)->sum('balance')),
            'labourers' => (int) abs((int) Labourer::where('balance', '<', 0)->sum('balance')),
            'staff' => (int) abs((int) Salary::where('balance', '<', 0)->sum('balance')),
        ];
        $advances = array_sum($advanceBreakdown);
        $dueCounts = [
            'customers' => Customer::where('balance', '>', 0)->count(),
            'customers_with_advance' => Customer::where('balance', '<', 0)->count(),
            'suppliers' => Supplier::where('balance', '>', 0)->count(),
            'drivers' => Driver::where('balance', '>', 0)->count(),
            'labourers' => Labourer::where('balance', '>', 0)->count(),
        ];

        // ---- Orders waiting to be dispatched (POS order not fully delivered) ----
        $pendingDispatch = $this->pendingDispatchCount();

        // ---- Low stock: raw materials + finished goods ----
        // Show when at/below threshold. Threshold 0 => alerts only when empty (qty <= 0).
        $lowMaterials = RawMaterial::where('is_active', true)
            ->whereColumn('current_qty', '<=', 'low_stock_threshold')
            ->get(['id', 'name', 'unit', 'current_qty', 'low_stock_threshold']);

        $lowReady = FinishedGoodsStock::with('product:id,name,low_stock_threshold')
            ->whereHas('product', fn ($q) => $q->where('low_stock_threshold', '>', 0))
            ->get()
            ->filter(fn ($s) => $s->product && $s->ready_qty <= (int) $s->product->low_stock_threshold)
            ->map(fn ($s) => [
                'id' => $s->product->id,
                'name' => $s->product->name,
                'ready_qty' => (int) $s->ready_qty,
                'threshold' => (int) $s->product->low_stock_threshold,
            ])->values();

        $cash = $this->accountBalance(Account::CASH);
        $bank = $this->accountBalance(Account::BANK);

        $payload = [
            'today' => [
                'production_qty' => $todayProduction,
                'blocks_sold' => $todayBlocksSold,
                'sales_total' => $todaySales,
                'expenses_total' => $todayExpenses,
                'money_in' => $todayMoneyIn,
                'money_out' => $todayMoneyOut,
            ],
            'month' => [
                'label' => Carbon::now()->format('F Y'),
                'sales_total' => $monthSalesTotal,
                'income' => $monthIncome,
                'expenses_total' => $monthCost, // all operating costs (expenses + salaries + labour)
                'net_profit' => $monthProfit,
            ],
            'totals' => [
                'production' => $totalProduction,
                'sold' => $totalSold,
                'income' => $lifeIncome,
                'cost' => $lifeCost,
                'net_profit' => $lifeProfit,
            ],
            'cash_in_hand' => $cash,
            'bank_balance' => $bank,
            'total_cash' => $cash + $bank,
            'receivables' => $receivables,
            'customer_advances' => $customerAdvances,
            'payables' => $payables,
            'payable_breakdown' => $payableBreakdown,
            'advances' => $advances,
            'advance_breakdown' => $advanceBreakdown,
            'due_counts' => $dueCounts,
            'pending_dispatch' => $pendingDispatch,
            'stock' => [
                'curing' => (int) $stock->curing,
                'ready' => (int) $stock->ready,
                'damaged' => (int) $stock->damaged,
            ],
            'low_stock_alerts' => $lowMaterials,
            'low_ready_alerts' => $lowReady,
        ];

        $payload = $this->applyPrivacy($payload, $strip);
        // Frontend ko batana zaroori hai kya chhupa hai, warna wo khaali tile dikhata rahega.
        // Sirf bande ki apni marzi, $strip nahi: jis ke paas accounting.view hi nahi wo
        // taala khol bhi nahi sakta, use chaar band taale dikhana bend gali hai.
        $payload['hidden'] = $chosen;

        return response()->json($payload);
    }

    /** Jo group chhupa hua hai uski raqam response se hi nikal deti hai, UI tak pohanchti bhi nahi. */
    private function applyPrivacy(array $payload, array $hidden): array
    {
        $map = [
            'sales' => ['today.sales_total', 'today.money_in', 'today.money_out', 'month.sales_total'],
            // Kharch (expenses) jaan bujh kar is list mein NAHI hai: owner ko wo
            // hamesha nazar aana chahiye, usne saaf kaha "expenses q hide kr rhe".
            // Aamdani aur munafa chhupe hue hain, is liye kharch dekh kar bhi
            // koi aamdani ka andaza nahi laga sakta.
            'income' => ['month.income', 'month.net_profit', 'totals.income', 'totals.cost', 'totals.net_profit'],
            'cash' => ['cash_in_hand', 'bank_balance', 'total_cash'],
            'dues' => [
                'receivables', 'customer_advances', 'payables', 'payable_breakdown',
                'advances', 'advance_breakdown',
            ],
        ];

        foreach ($hidden as $group) {
            // Anjaan slug aaye to chup chaap chhor do, dashboard girna nahi chahiye.
            Arr::forget($payload, $map[$group] ?? []);
        }

        return $payload;
    }

    /**
     * Count POS orders that still have blocks left to deliver. Done entirely in
     * SQL (per sale+product: ordered minus dispatched), no model hydration, so
     * it stays fast as data grows.
     */
    private function pendingDispatchCount(): int
    {
        return DB::table('sale_items as si')
            ->select('si.sale_id')
            ->groupBy('si.sale_id', 'si.product_id')
            ->havingRaw('SUM(si.quantity) - COALESCE((
                SELECT SUM(di.quantity) FROM dispatch_items di
                JOIN dispatches d ON d.id = di.dispatch_id
                WHERE d.sale_id = si.sale_id AND di.product_id = si.product_id
            ), 0) > 0')
            ->pluck('si.sale_id')
            ->unique()
            ->count();
    }

    private function accountBalance(string $code): int
    {
        $account = Account::where('code', $code)->first();

        return $account ? $account->balance() : 0;
    }

    /** Net movement of an account over an optional date range, by its normal side. */
    private function accountNet(string $code, string $side, ?string $from = null, ?string $to = null): int
    {
        $account = Account::where('code', $code)->first();
        if (! $account) {
            return 0;
        }

        $query = $account->lines()
            ->when($from || $to, fn ($q) => $q->whereHas('entry', function ($q) use ($from, $to) {
                $q->when($from, fn ($q, $d) => $q->whereDate('entry_date', '>=', $d))
                    ->when($to, fn ($q, $d) => $q->whereDate('entry_date', '<=', $d));
            }));

        return $side === 'credit'
            ? (int) $query->sum('credit') - (int) $query->sum('debit')
            : (int) $query->sum('debit') - (int) $query->sum('credit');
    }
}
