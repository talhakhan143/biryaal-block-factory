<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\FinishedGoodsStock;
use App\Models\ProductionBatch;
use App\Models\RawMaterial;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Supplier;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function index()
    {
        $today = Carbon::today()->toDateString();

        $todayProduction = (int) ProductionBatch::whereDate('production_date', $today)->sum('quantity_produced');
        $todaySales = (int) Sale::whereDate('sale_date', $today)->sum('total');
        $todayExpenses = (int) Expense::whereDate('expense_date', $today)->sum('amount');
        // total block pieces sold today (across all today's invoices)
        $todayBlocksSold = (int) SaleItem::whereHas('sale', fn ($q) => $q->whereDate('sale_date', $today))->sum('quantity');

        $stock = FinishedGoodsStock::select(
            DB::raw('COALESCE(SUM(curing_qty),0) curing'),
            DB::raw('COALESCE(SUM(ready_qty),0) ready'),
            DB::raw('COALESCE(SUM(damaged_qty),0) damaged'),
        )->first();

        $lowMaterials = RawMaterial::where('is_active', true)
            ->whereColumn('current_qty', '<=', 'low_stock_threshold')
            ->where('low_stock_threshold', '>', 0)
            ->get(['id', 'name', 'unit', 'current_qty', 'low_stock_threshold']);

        return response()->json([
            'today' => [
                'production_qty' => $todayProduction,
                'blocks_sold' => $todayBlocksSold,
                'sales_total' => $todaySales,
                'expenses_total' => $todayExpenses,
            ],
            'cash_balance' => $this->accountBalance(Account::CASH) + $this->accountBalance(Account::BANK),
            'receivables' => (int) Customer::sum('balance'),
            'payables' => (int) Supplier::sum('balance'),
            'stock' => [
                'curing' => (int) $stock->curing,
                'ready' => (int) $stock->ready,
                'damaged' => (int) $stock->damaged,
            ],
            'low_stock_alerts' => $lowMaterials,
        ]);
    }

    private function accountBalance(string $code): int
    {
        $account = Account::where('code', $code)->first();

        return $account ? $account->balance() : 0;
    }
}
