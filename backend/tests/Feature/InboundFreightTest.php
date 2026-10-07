<?php

namespace Tests\Feature;

use App\Models\Driver;
use App\Models\JournalLine;
use App\Models\MaterialPurchase;
use App\Models\RawMaterial;
use App\Models\Supplier;
use App\Models\TransportTrip;
use App\Models\User;
use App\Services\Purchasing\PurchaseService;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Inbound kiraya: the driver who BRINGS material to the factory.
 *
 * Until now that fare was typed on the purchase and silently billed to the
 * supplier. Naming a driver turns it into a real freight trip owed to him,
 * exactly like a dispatch does on the way out.
 */
class InboundFreightTest extends TestCase
{
    use RefreshDatabase;

    private Supplier $supplier;

    private RawMaterial $material;

    private Driver $driver;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([RolePermissionSeeder::class, ChartOfAccountsSeeder::class]);

        $owner = User::factory()->create();
        $owner->assignRole('Owner');
        Sanctum::actingAs($owner);

        $this->supplier = Supplier::create(['name' => 'Chenab Sand']);
        $this->material = RawMaterial::create(['name' => 'Raiti', 'unit' => 'trolley', 'current_qty' => 0, 'low_stock_threshold' => 0]);
        $this->driver = Driver::create([
            'name' => 'Akram', 'phone' => '0300-1112223',
            'vehicle_name' => 'Hino', 'vehicle_plate' => 'LEB-4471', 'is_active' => true,
        ]);
    }

    /** Material Rs 50,000 + kiraya Rs 8,000 = landed Rs 58,000. */
    private function buy(array $extra = []): MaterialPurchase
    {
        return app(PurchaseService::class)->record(array_merge([
            'supplier_id' => $this->supplier->id,
            'raw_material_id' => $this->material->id,
            'purchase_date' => '2026-06-10',
            'quantity' => 10,
            'unit_cost' => 500000,       // paisa
            'transport_cost' => 800000,
            'paid_amount' => 0,
            'method' => 'cash',
        ], $extra));
    }

    public function test_naming_a_driver_moves_the_kiraya_off_the_suppliers_bill(): void
    {
        $purchase = $this->buy(['driver_id' => $this->driver->id, 'trip_paid' => 300000]);

        // Landed cost still carries the kiraya: that is what the material cost us.
        $this->assertSame(5800000, (int) $purchase->total_cost);
        // The supplier is only owed the material.
        $this->assertSame(5000000, $purchase->supplierBill());
        $this->assertSame(5000000, (int) $this->supplier->fresh()->balance);
        // The driver carries the unpaid kiraya.
        $this->assertSame(500000, (int) $this->driver->fresh()->balance);

        $trip = TransportTrip::where('material_purchase_id', $purchase->id)->firstOrFail();
        $this->assertSame(800000, (int) $trip->rate);
        $this->assertSame(300000, (int) $trip->paid);
        $this->assertSame(500000, (int) $trip->balance);
        $this->assertSame('Hino LEB-4471', $trip->vehicle_label);

        $this->assertSame((int) JournalLine::sum('debit'), (int) JournalLine::sum('credit'));
    }

    public function test_without_a_driver_nothing_changes(): void
    {
        $purchase = $this->buy();

        $this->assertSame(5800000, (int) $purchase->total_cost);
        $this->assertSame(5800000, $purchase->supplierBill(), 'Kiraya supplier ke bill me hi rehta hai.');
        $this->assertSame(5800000, (int) $this->supplier->fresh()->balance);
        $this->assertSame(0, (int) $this->driver->fresh()->balance);
        $this->assertSame(0, TransportTrip::count());
    }

    public function test_the_freight_clearing_account_washes_out(): void
    {
        $this->buy(['driver_id' => $this->driver->id, 'trip_paid' => 0]);

        // 2100 is a pass-through: the purchase credits it, the trip debits it.
        $net = (int) JournalLine::query()
            ->whereHas('account', fn ($q) => $q->where('code', '2100'))
            ->sum('debit')
            - (int) JournalLine::query()
                ->whereHas('account', fn ($q) => $q->where('code', '2100'))
                ->sum('credit');

        $this->assertSame(0, $net, 'Inbound freight clearing must net to zero.');
    }

    public function test_paying_the_supplier_settles_only_their_own_bill(): void
    {
        $purchase = $this->buy(['driver_id' => $this->driver->id, 'trip_paid' => 0]);

        // Supplier is owed Rs 50,000, not the Rs 58,000 landed cost.
        $this->postJson("/api/v1/purchases/{$purchase->id}/pay", [
            'payment_date' => '2026-06-11', 'amount' => 50000, 'method' => 'cash',
        ])->assertCreated();

        $purchase->refresh();
        $this->assertSame(5000000, (int) $purchase->paid_amount);
        $this->assertSame('paid', $purchase->payment_status, 'Supplier ka bill poora ho gaya.');
        $this->assertSame(0, (int) $this->supplier->fresh()->balance);
        // The driver is still owed his kiraya.
        $this->assertSame(800000, (int) $this->driver->fresh()->balance);
    }

    public function test_the_driver_is_paid_from_the_same_place_as_dispatch_drivers(): void
    {
        $this->buy(['driver_id' => $this->driver->id, 'trip_paid' => 0]);
        $this->assertSame(800000, (int) $this->driver->fresh()->balance);

        $this->postJson("/api/v1/drivers/{$this->driver->id}/pay", [
            'payment_date' => '2026-06-12', 'amount' => 8000, 'method' => 'cash',
        ])->assertCreated();

        $this->assertSame(0, (int) $this->driver->fresh()->balance);
        $this->assertSame((int) JournalLine::sum('debit'), (int) JournalLine::sum('credit'));
    }

    public function test_a_purchase_with_no_kiraya_creates_no_trip_even_with_a_driver(): void
    {
        $purchase = $this->buy(['transport_cost' => 0, 'driver_id' => $this->driver->id]);

        $this->assertSame(0, TransportTrip::count());
        $this->assertSame(5000000, $purchase->supplierBill());
    }
}
