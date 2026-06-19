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
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Salary;
use App\Models\Supplier;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function index()
    {
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

        // ---- This month (rough P&L: goods sales minus expenses) ----
        $monthGoods = (int) Sale::whereBetween('sale_date', [$monthStart, $monthEnd])->sum(DB::raw('subtotal - discount'));
        $monthSalesTotal = (int) Sale::whereBetween('sale_date', [$monthStart, $monthEnd])->sum('total');
        $monthExpenses = (int) Expense::whereBetween('expense_date', [$monthStart, $monthEnd])->sum('amount');

        // ---- Lifetime ----
        $totalProduction = (int) ProductionBatch::sum('quantity_produced');
        $totalSold = (int) SaleItem::sum('quantity');

        // ---- Stock ----
        $stock = FinishedGoodsStock::select(
            DB::raw('COALESCE(SUM(curing_qty),0) curing'),
            DB::raw('COALESCE(SUM(ready_qty),0) ready'),
            DB::raw('COALESCE(SUM(damaged_qty),0) damaged'),
        )->first();

        // ---- Money owed (from the ledger control accounts — covers EVERY party) ----
        $receivables = $this->accountBalance(Account::RECEIVABLE);
        $payables = $this->accountBalance(Account::PAYABLE);
        $payableBreakdown = [
            'suppliers' => (int) Supplier::where('balance', '>', 0)->sum('balance'),
            'drivers' => (int) Driver::where('balance', '>', 0)->sum('balance'),
            'labourers' => (int) Labourer::where('balance', '>', 0)->sum('balance'),
            'staff' => (int) Salary::where('balance', '>', 0)->sum('balance'),
        ];
        $dueCounts = [
            'customers' => Customer::where('balance', '>', 0)->count(),
            'suppliers' => Supplier::where('balance', '>', 0)->count(),
            'drivers' => Driver::where('balance', '>', 0)->count(),
            'labourers' => Labourer::where('balance', '>', 0)->count(),
        ];

        // ---- Orders waiting to be dispatched (POS order not fully delivered) ----
        $pendingDispatch = $this->pendingDispatchCount();

        // ---- Low stock: raw materials + finished goods ----
        $lowMaterials = RawMaterial::where('is_active', true)
            ->whereColumn('current_qty', '<=', 'low_stock_threshold')
            ->where('low_stock_threshold', '>', 0)
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

        return response()->json([
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
                'expenses_total' => $monthExpenses,
                'net_profit' => $monthGoods - $monthExpenses, // goods sales − expenses (freight is pass-through)
            ],
            'totals' => [
                'production' => $totalProduction,
                'sold' => $totalSold,
            ],
            'cash_in_hand' => $this->accountBalance(Account::CASH),
            'bank_balance' => $this->accountBalance(Account::BANK),
            'receivables' => $receivables,
            'payables' => $payables,
            'payable_breakdown' => $payableBreakdown,
            'due_counts' => $dueCounts,
            'pending_dispatch' => $pendingDispatch,
            'stock' => [
                'curing' => (int) $stock->curing,
                'ready' => (int) $stock->ready,
                'damaged' => (int) $stock->damaged,
            ],
            'low_stock_alerts' => $lowMaterials,
            'low_ready_alerts' => $lowReady,
        ]);
    }

    /**
     * Count POS orders that still have blocks left to deliver. Done entirely in
     * SQL (per sale+product: ordered minus dispatched) — no model hydration, so
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
}
