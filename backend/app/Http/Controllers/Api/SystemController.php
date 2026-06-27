<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Driver;
use App\Models\MaterialPurchase;
use App\Models\Sale;
use App\Models\Supplier;
use App\Models\TransportTrip;
use App\Models\User;
use App\Services\Admin\SystemResetService;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\PermissionRegistrar;

class SystemController extends Controller
{
    public function __construct(private SystemResetService $service) {}

    /**
     * Re-sync roles & permissions and ensure the Owner / Sales accounts exist.
     * Safe to run on production (no terminal there): re-runs RolePermissionSeeder
     * (idempotent), upserts the two Baryal logins, and flushes the Spatie
     * permission cache so new permissions take effect immediately. Idempotent.
     */
    public function syncAccess(Request $request)
    {
        abort_unless($request->user()?->hasAnyRole(['Super Admin', 'Owner']), 403, 'Sirf Owner / Super Admin yeh kar sakta hai.');

        // 1) Permissions + role mappings (creates new perms, re-syncs every role).
        (new RolePermissionSeeder)->run();

        // 2) Real Baryal logins — only created if missing, otherwise role re-synced.
        $owner = User::firstOrCreate(
            ['email' => 'muhammadali@baryal.pk'],
            ['name' => 'Muhammad Ali (Owner)', 'password' => 'm_ali_owner@786', 'is_active' => true],
        );
        $owner->syncRoles(['Owner']);

        $sales = User::firstOrCreate(
            ['email' => 'sales@baryal.pk'],
            ['name' => 'Saleman', 'password' => 'm_ali_sales@786', 'is_active' => true],
        );
        $sales->syncRoles(['Sales User']);

        // 3) Flush the permission cache so the new grants are live right now.
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        return response()->json([
            'message' => 'Roles, permissions aur accounts sync ho gaye. Permission cache clear.',
            'owner_created' => $owner->wasRecentlyCreated,
            'sales_created' => $sales->wasRecentlyCreated,
        ]);
    }

    /**
     * DANGER: wipe all business/test data. Super Admin only, and the caller must
     * type the exact word RESET to confirm. Users, roles and the chart of
     * accounts are preserved.
     */
    public function reset(Request $request)
    {
        abort_unless($request->user()?->hasAnyRole(['Super Admin', 'Owner']), 403, 'Sirf Owner / Super Admin yeh kar sakta hai.');

        $data = $request->validate([
            'confirm' => ['required', 'string'],
        ], [
            'confirm.required' => 'Confirm karne ke liye RESET likhein.',
        ]);

        if ($data['confirm'] !== 'RESET') {
            throw ValidationException::withMessages([
                'confirm' => 'Galat — bilkul "RESET" (capital) likhein.',
            ]);
        }

        $wiped = $this->service->reset();

        return response()->json([
            'message' => 'System reset ho gaya — saara data clear. Users, roles aur accounts safe hain.',
            'tables_cleared' => count($wiped),
        ]);
    }

    /**
     * Re-sync source documents (transport trips, sale invoices, purchase bills)
     * to their party's actual balance. Fixes rows left inconsistent by lump
     * party payments made before per-document allocation existed. Idempotent.
     */
    public function reconcileTransport(Request $request)
    {
        abort_unless($request->user()?->hasAnyRole(['Super Admin', 'Owner']), 403, 'Sirf Owner / Super Admin yeh kar sakta hai.');

        $trips = $this->reconcileTrips();
        $sales = $this->reconcileSales();
        $purchases = $this->reconcilePurchases();

        return response()->json([
            'message' => "Reconcile ho gaya — {$trips} trip(s), {$sales} sale(s), {$purchases} purchase(s) update hue.",
            'trips_fixed' => $trips,
            'sales_fixed' => $sales,
            'purchases_fixed' => $purchases,
        ]);
    }

    private function reconcileTrips(): int
    {
        $fixed = 0;

        Driver::query()->get()->each(function (Driver $driver) use (&$fixed) {
            $trips = TransportTrip::where('driver_id', $driver->getKey())
                ->orderBy('trip_date')->orderBy('created_at')->get();
            if ($trips->isEmpty()) {
                return;
            }

            $remaining = max(0, (int) $trips->sum('rate') - (int) $driver->balance);

            foreach ($trips as $trip) {
                $apply = min($remaining, (int) $trip->rate);
                $status = $apply <= 0 ? 'unpaid' : ($apply >= (int) $trip->rate ? 'paid' : 'partial');
                if ((int) $trip->paid !== $apply || $trip->status !== $status) {
                    $trip->update(['paid' => $apply, 'balance' => (int) $trip->rate - $apply, 'status' => $status]);
                    $fixed++;
                }
                $remaining -= $apply;
            }
        });

        return $fixed;
    }

    private function reconcileSales(): int
    {
        $fixed = 0;

        Customer::query()->get()->each(function (Customer $customer) use (&$fixed) {
            $sales = Sale::where('customer_id', $customer->getKey())
                ->orderBy('sale_date')->orderBy('created_at')->get();
            if ($sales->isEmpty()) {
                return;
            }

            $remaining = max(0, (int) $sales->sum('total') - (int) $customer->balance);

            foreach ($sales as $sale) {
                $apply = min($remaining, (int) $sale->total);
                $status = $apply <= 0 ? 'unpaid' : ($apply >= (int) $sale->total ? 'paid' : 'partial');
                if ((int) $sale->paid !== $apply || $sale->status !== $status) {
                    $sale->update(['paid' => $apply, 'balance' => (int) $sale->total - $apply, 'status' => $status]);
                    $fixed++;
                }
                $remaining -= $apply;
            }
        });

        return $fixed;
    }

    private function reconcilePurchases(): int
    {
        $fixed = 0;

        Supplier::query()->get()->each(function (Supplier $supplier) use (&$fixed) {
            $purchases = MaterialPurchase::where('supplier_id', $supplier->getKey())
                ->orderBy('purchase_date')->orderBy('created_at')->get();
            if ($purchases->isEmpty()) {
                return;
            }

            $remaining = max(0, (int) $purchases->sum('total_cost') - (int) $supplier->balance);

            foreach ($purchases as $purchase) {
                $apply = min($remaining, (int) $purchase->total_cost);
                $status = $apply <= 0 ? 'unpaid' : ($apply >= (int) $purchase->total_cost ? 'paid' : 'partial');
                if ((int) $purchase->paid_amount !== $apply || $purchase->payment_status !== $status) {
                    $purchase->update(['paid_amount' => $apply, 'payment_status' => $status]);
                    $fixed++;
                }
                $remaining -= $apply;
            }
        });

        return $fixed;
    }
}
