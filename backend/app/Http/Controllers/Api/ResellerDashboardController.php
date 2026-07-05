<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ResellerItem;
use App\Models\ResellerPayment;
use App\Models\ResellerPurchase;
use App\Models\ResellerRental;
use App\Models\ResellerSale;
use App\Models\ResellerSaleItem;
use App\Models\ResellerSupplier;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Resellers Point dashboard — its own books, independent of the block factory.
 * All money in paisa.
 */
class ResellerDashboardController extends Controller
{
    public function index(Request $request)
    {
        $today = Carbon::today()->toDateString();

        // Cash flow (kiraya receipts IN, supplier payments OUT)
        $inToday = (int) ResellerPayment::where('direction', ResellerPayment::IN)->whereDate('payment_date', $today)->sum('amount');
        $outToday = (int) ResellerPayment::where('direction', ResellerPayment::OUT)->whereDate('payment_date', $today)->sum('amount');
        $inAll = (int) ResellerPayment::where('direction', ResellerPayment::IN)->sum('amount');
        $outAll = (int) ResellerPayment::where('direction', ResellerPayment::OUT)->sum('amount');

        // Payable = suppliers ko dena (udhaar) + drivers ki kiraya baqi
        $supplierPayable = (int) ResellerSupplier::sum('balance');
        $driverPayable = (int) \App\Models\ResellerDispatch::query()
            ->whereColumn('trip_paid', '<', 'trip_rate')
            ->selectRaw('COALESCE(SUM(trip_rate - trip_paid),0) as due')->value('due');
        $payable = $supplierPayable + $driverPayable;

        // Sales: revenue, margin (profit), receivable (unpaid balances)
        $salesToday = (int) ResellerSale::whereDate('sale_date', $today)->sum('total');
        $salesRevenue = (int) ResellerSale::sum('total');
        $salesReceivable = (int) ResellerSale::sum('balance');
        $salesCost = (int) ResellerSaleItem::get()->sum(fn (ResellerSaleItem $i) => (int) round((float) $i->quantity * (int) $i->unit_cost));
        $salesProfit = $salesRevenue - $salesCost;

        // Kiraya: accrue live for active rentals, sum outstanding = receivable
        $monthStart = Carbon::today()->startOfMonth();
        $todayD = Carbon::today();
        $rentals = ResellerRental::all();
        $kiryaEarned = 0;   // total accrued (income)
        $kiryaCollected = 0;
        $kiryaThisMonth = 0; // income attributable to the current month
        $receivable = 0;
        $activeCount = 0;
        foreach ($rentals as $r) {
            $accrued = $r->currentAccrued();
            $paid = (int) $r->paid_amount;
            $kiryaEarned += $accrued;
            $kiryaCollected += $paid;
            $receivable += max($accrued - $paid, 0);
            if ($r->status === 'active') {
                $activeCount++;
            }

            // days of THIS rental that fall inside the current month
            $rStart = Carbon::parse($r->start_date)->startOfDay();
            $rEnd = $r->status === 'returned' && $r->return_date
                ? Carbon::parse($r->return_date)->startOfDay()
                : $todayD->copy();
            $from = $rStart->greaterThan($monthStart) ? $rStart : $monthStart->copy();
            $to = $rEnd->lessThan($todayD) ? $rEnd : $todayD->copy();
            if ($to->greaterThanOrEqualTo($from)) {
                $days = $from->diffInDays($to) + 1;
                $kiryaThisMonth += (int) round($days * (int) $r->per_day_rate * (float) $r->quantity);
            }
        }

        // Stock value at moving-avg cost
        $items = ResellerItem::all();
        $stockValue = (int) $items->sum(fn (ResellerItem $i) => (int) round((float) $i->stock_qty * (int) $i->avg_cost));
        // Low: stock <= threshold. Threshold 0 => sirf khaali (qty <= 0) par alert.
        $lowItemsColl = $items->filter(fn (ResellerItem $i) => (float) $i->stock_qty <= (float) $i->low_stock_threshold);
        $lowStock = $lowItemsColl->count();
        $lowItems = $lowItemsColl->map(fn (ResellerItem $i) => [
            'id' => $i->id,
            'name' => $i->name,
            'unit' => $i->unit,
            'sale_price' => (int) $i->sale_price,
            'stock_qty' => (float) $i->stock_qty,
            'low_stock_threshold' => (float) $i->low_stock_threshold,
        ])->values();

        // Purchases: total maal khareeda (all-time cost) — for context
        $purchaseTotal = (int) ResellerPurchase::sum('total_cost');

        return response()->json([
            'data' => [
                'today' => [
                    'in' => $inToday,
                    'out' => $outToday,
                    'net' => $inToday - $outToday,
                ],
                'all' => [
                    'in' => $inAll,
                    'out' => $outAll,
                    'net' => $inAll - $outAll,
                ],
                'payable' => $payable,                       // suppliers ko dena
                'receivable' => $receivable + $salesReceivable, // kiraya + sale udhaar (customers se lena)
                'stock_value' => $stockValue,
                'low_stock_count' => $lowStock,
                'low_items' => $lowItems,
                'items_count' => $items->count(),
                'purchase_total' => $purchaseTotal,
                'sales' => [
                    'today' => $salesToday,
                    'revenue' => $salesRevenue,
                    'profit' => $salesProfit,
                    'receivable' => $salesReceivable,
                ],
                'kiraya' => [
                    'active' => $activeCount,
                    'earned' => $kiryaEarned,       // income (accrued, all time)
                    'this_month' => $kiryaThisMonth, // is mahine ki income
                    'collected' => $kiryaCollected,
                    'outstanding' => $receivable,
                ],
                // Total profit = sales margin + kiraya income earned.
                'profit' => $salesProfit + $kiryaEarned,
            ],
        ]);
    }
}
