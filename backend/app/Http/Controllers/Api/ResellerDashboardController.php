<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ResellerDispatch;
use App\Models\ResellerItem;
use App\Models\ResellerPayment;
use App\Models\ResellerPurchase;
use App\Models\ResellerRental;
use App\Models\ResellerSale;
use App\Models\ResellerSaleItem;
use App\Models\ResellerSupplier;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;

/**
 * Resellers Point dashboard, its own books, independent of the block factory.
 * All money in paisa.
 */
class ResellerDashboardController extends Controller
{
    public function index(Request $request)
    {
        // Resellers Point ki books alag hain, magar dekhne wali aankhein wahi hain,
        // is liye Settings ka wahi ek switch is screen pe bhi chalta hai.
        $chosen = $request->user()?->hiddenDashboardGroups() ?? [];

        // Jis ko accounting dekhne ki ijazat hi nahi, us ke browser tak raqam
        // pohanchni hi nahi chahiye. UI pehle se chhupa deta tha, magar JSON mein
        // khuli pari thi, aur counter wali machine isi account par chalti hai.
        $strip = $request->user()?->can('accounting.view') ? $chosen : User::DASHBOARD_GROUPS;

        $today = Carbon::today()->toDateString();

        // Cash flow (kiraya receipts IN, supplier payments OUT)
        $inToday = (int) ResellerPayment::where('direction', ResellerPayment::IN)->whereDate('payment_date', $today)->sum('amount');
        $outToday = (int) ResellerPayment::where('direction', ResellerPayment::OUT)->whereDate('payment_date', $today)->sum('amount');
        $inAll = (int) ResellerPayment::where('direction', ResellerPayment::IN)->sum('amount');
        $outAll = (int) ResellerPayment::where('direction', ResellerPayment::OUT)->sum('amount');

        // Payable = suppliers ko dena (udhaar) + drivers ki kiraya baqi
        $supplierPayable = (int) ResellerSupplier::sum('balance');
        $driverPayable = (int) ResellerDispatch::query()
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

        // Purchases: total maal khareeda (all-time cost), for context
        $purchaseTotal = (int) ResellerPurchase::sum('total_cost');

        $data = [
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
        ];

        $data = $this->applyPrivacy($data, $strip);
        // Reseller ka payload 'data' ke andar hai, is liye 'hidden' bhi wahin baithta hai.
        // Sirf bande ki apni marzi, $strip nahi: jis ke paas accounting.view hi nahi wo
        // taala khol bhi nahi sakta, use chaar band taale dikhana bend gali hai.
        $data['hidden'] = $chosen;

        return response()->json(['data' => $data]);
    }

    /** Jo group chhupa hua hai uski raqam response se hi nikal deti hai, UI tak pohanchti bhi nahi. */
    private function applyPrivacy(array $data, array $hidden): array
    {
        $map = [
            'sales' => ['today.in', 'today.out', 'today.net', 'sales.today', 'sales.revenue'],
            // purchase_total (Total Khareed) is list mein nahi hai: wo kharch hai
            // aur owner ko kharch hamesha dikhna chahiye. Factory dashboard par
            // bhi expenses isi wajah se khule hain.
            'income' => [
                'sales.profit', 'profit',
                'kiraya.earned', 'kiraya.this_month', 'kiraya.collected',
            ],
            'cash' => ['all', 'stock_value'],
            'dues' => ['receivable', 'payable', 'sales.receivable', 'kiraya.outstanding'],
        ];

        foreach ($hidden as $group) {
            // Anjaan slug aaye to chup chaap chhor do, dashboard girna nahi chahiye.
            Arr::forget($data, $map[$group] ?? []);
        }

        // Poora khana chhup gaya to khali array JSON me [] ban jata hai aur type jhoot bolne
        // lagta hai (frontend object samajhta hai, list aati hai), is liye key hi nikal dete
        // hain. Container ke naam map ke dotted path se khud nikalte hain, hath se likhe to
        // kal koi naya khana add karega aur ye jaga bhoolni pakki hai. Sirf yehi container
        // dekhte hain, warna low_items jaisi asli khali list bhi sath ur jaye.
        $containers = [];
        foreach ($map as $paths) {
            foreach ($paths as $path) {
                $parts = explode('.', $path);
                if (count($parts) > 1) {
                    $containers[$parts[0]] = true;
                }
            }
        }

        foreach (array_keys($containers) as $key) {
            if (($data[$key] ?? null) === []) {
                unset($data[$key]);
            }
        }

        return $data;
    }
}
