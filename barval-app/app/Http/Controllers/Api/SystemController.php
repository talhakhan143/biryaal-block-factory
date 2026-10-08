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
use App\Services\Sales\InvoiceAllocator;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
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
        //    A created account gets a random password (this file is in a public
        //    repo, so no password may be written here); the Owner then sets a real
        //    one from the Users page. Existing accounts are never touched.
        $ownerEmail = config('app.owner_email');
        $salesEmail = config('app.sales_email');

        $owner = User::firstOrCreate(
            ['email' => $ownerEmail],
            ['name' => 'Muhammad Ali (Owner)', 'password' => Str::password(24), 'is_active' => true],
        );
        $owner->syncRoles(['Owner']);

        $sales = User::firstOrCreate(
            ['email' => $salesEmail],
            ['name' => 'Saleman', 'password' => Str::password(24), 'is_active' => true],
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

        // Wahi allocator jo advance aur void ke baad chalta hai, taake teenon
        // raaste aik hi tareeqe se hisaab banayein.
        $allocator = app(InvoiceAllocator::class);
        Customer::query()->get()->each(function (Customer $customer) use (&$fixed, $allocator) {
            $fixed += $allocator->rebuild($customer);
        });

        return $fixed;
    }

    private function reconcilePurchases(): int
    {
        $fixed = 0;

        Supplier::query()->get()->each(function (Supplier $supplier) use (&$fixed) {
            $purchases = MaterialPurchase::with('trip')
                ->where('supplier_id', $supplier->getKey())
                ->orderBy('purchase_date')->orderBy('created_at')->get();
            if ($purchases->isEmpty()) {
                return;
            }

            // Supplier ko sirf apna bill dena hai. Jis purchase ka kiraya driver
            // ko gaya, wo supplier ke hisaab me ginna galat hai.
            $billed = (int) $purchases->sum(fn (MaterialPurchase $p) => $p->supplierBill());
            $remaining = max(0, $billed - (int) $supplier->balance);

            foreach ($purchases as $purchase) {
                $bill = $purchase->supplierBill();
                $apply = min($remaining, $bill);
                $status = $apply <= 0 ? 'unpaid' : ($apply >= $bill ? 'paid' : 'partial');
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
