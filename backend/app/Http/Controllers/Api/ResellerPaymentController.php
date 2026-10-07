<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Driver;
use App\Models\ResellerDispatch;
use App\Models\ResellerPayment;
use App\Models\ResellerRental;
use App\Models\ResellerSale;
use App\Models\ResellerSupplier;
use App\Services\Reseller\ResellerService;
use App\Support\Money;
use Illuminate\Http\Request;

/**
 * Resellers Point money hub — mirrors the block factory Payments page. Every
 * party we owe (payable) and everyone who owes us (receivable) in one place,
 * each with a settle action. Fully self-contained reseller books.
 */
class ResellerPaymentController extends Controller
{
    use HasTableQuery;

    public function __construct(private ResellerService $service) {}

    /** Money in/out history. */
    public function index(Request $request)
    {
        $query = ResellerPayment::query()
            ->with(['supplier', 'customer'])
            ->when($request->direction, fn ($q, $d) => $q->where('direction', $d));

        $this->applyTableQuery(
            $query,
            $request,
            ['payment_date', 'amount', 'direction', 'method', 'reference'],
            ['reference', 'notes'],
            'payment_date',
            ['supplier' => ['name'], 'customer' => ['name']],
        );

        $payments = $query->paginate($request->integer('per_page', 15));

        return response()->json([
            'data' => $payments->map(fn (ResellerPayment $p) => [
                'id' => $p->id,
                'reference' => $p->reference,
                'direction' => $p->direction,
                'party' => $p->supplier?->name ?? $p->customer?->name ?? $p->notes ?? '—',
                'amount' => (int) $p->amount,
                'method' => $p->method,
                'payment_date' => $p->payment_date?->toDateString(),
            ]),
            'meta' => ['current_page' => $payments->currentPage(), 'last_page' => $payments->lastPage(), 'total' => $payments->total()],
        ]);
    }

    /** Everyone we owe: suppliers (udhaar) + drivers (kiraya baqi). */
    public function payables()
    {
        $rows = collect();

        ResellerSupplier::where('balance', '>', 0)->get(['id', 'name', 'balance'])
            ->each(fn ($s) => $rows->push(['type' => 'supplier', 'id' => $s->id, 'name' => $s->name, 'balance' => (int) $s->balance]));

        // driver kiraya baqi = sum(trip_rate - trip_paid) per driver
        ResellerDispatch::query()
            ->selectRaw('driver_id, SUM(trip_rate - trip_paid) as due')
            ->whereNotNull('driver_id')
            ->whereColumn('trip_paid', '<', 'trip_rate')
            ->groupBy('driver_id')
            ->get()
            ->each(function ($row) use ($rows) {
                $driver = Driver::find($row->driver_id);
                if ($driver && (int) $row->due > 0) {
                    $rows->push(['type' => 'driver', 'id' => $driver->id, 'name' => $driver->name.' (kiraya)', 'balance' => (int) $row->due]);
                }
            });

        return response()->json(['data' => $rows->sortByDesc('balance')->values()]);
    }

    /** Everyone who owes us: customers (sale udhaar + kiraya baqi). */
    public function receivables()
    {
        $rows = [];

        $saleDues = ResellerSale::query()
            ->selectRaw('customer_id, SUM(balance) as due')
            ->where('balance', '>', 0)->whereNotNull('customer_id')
            ->groupBy('customer_id')->pluck('due', 'customer_id');

        $kiryaByCust = [];
        foreach (ResellerRental::whereNotNull('customer_id')->get() as $r) {
            $due = max($r->currentAccrued() - (int) $r->paid_amount, 0);
            if ($due > 0) {
                $kiryaByCust[$r->customer_id] = ($kiryaByCust[$r->customer_id] ?? 0) + $due;
            }
        }

        $custIds = collect($saleDues->keys())->merge(array_keys($kiryaByCust))->unique();
        $names = Customer::whereIn('id', $custIds)->pluck('name', 'id');

        foreach ($custIds as $cid) {
            $sale = (int) ($saleDues[$cid] ?? 0);
            $kiraya = (int) ($kiryaByCust[$cid] ?? 0);
            $rows[] = [
                'customer_id' => $cid,
                'name' => $names[$cid] ?? '—',
                'sale_due' => $sale,
                'kiraya_due' => $kiraya,
                'total' => $sale + $kiraya,
            ];
        }

        usort($rows, fn ($a, $b) => $b['total'] <=> $a['total']);

        return response()->json(['data' => $rows]);
    }

    /** Lump receipt from a customer (settles sale udhaar then kiraya). */
    public function receive(Request $request)
    {
        $data = $request->validate([
            'customer_id' => ['required', 'uuid', 'exists:customers,id'],
            'payment_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:method,bank'],
        ], ['bank_ref.required_if' => 'Bank payment par bank/reference likhna zaroori hai.']);
        $data['amount'] = Money::toPaisa($data['amount']);

        $this->service->receiveFromCustomer(Customer::findOrFail($data['customer_id']), $data);

        return response()->noContent();
    }

    /** Pay a driver's outstanding reseller kiraya. */
    public function payDriver(Request $request, Driver $driver)
    {
        $data = $request->validate([
            'payment_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['nullable', 'in:cash,bank'],
            'bank_ref' => ['nullable', 'string', 'max:255', 'required_if:method,bank'],
        ], ['bank_ref.required_if' => 'Bank payment par bank/reference likhna zaroori hai.']);
        $data['amount'] = Money::toPaisa($data['amount']);

        $this->service->payDriverKiraya($driver, $data);

        return response()->noContent();
    }
}
