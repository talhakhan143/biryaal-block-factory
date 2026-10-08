<?php

namespace Tests\Feature;

use App\Models\Driver;
use App\Models\JournalLine;
use App\Models\MaterialPurchase;
use App\Models\RawMaterial;
use App\Models\Supplier;
use App\Models\TransportTrip;
use App\Models\User;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Maal laane wale driver ka kiraya.
 *
 * Faisla: ye kiraya purchase par likha hi nahi jata. Purchase me sirf maal aur
 * loading hai, aur kiraya "Maal ka Kiraya" wale page par us driver ke naam
 * likha jata hai, jahan se usay paisa bhi diya jata hai. Dono jagah likhne se
 * wahi aik kiraya do dafa gin liya jata: aik dafa supplier ke bill me aur aik
 * dafa driver ke khate me.
 *
 * Driver dono taraf kaam karta hai, is liye uske khate me ye bhi nazar aana
 * chahiye ke kitna kiraya maal laane ka tha aur kitna maal bhejne ka.
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

    /** Maal Rs 50,000 + loading Rs 1,000. Kiraya is me kahin nahi. */
    private function buy(array $extra = []): MaterialPurchase
    {
        $body = array_merge([
            'supplier_id' => $this->supplier->id,
            'raw_material_id' => $this->material->id,
            'purchase_date' => '2026-06-10',
            'quantity' => 10,
            'unit_cost' => 5000,       // rupees, controller paisa me badalta hai
            'loading_cost' => 1000,
            'paid_amount' => 0,
            'method' => 'cash',
        ], $extra);

        $id = $this->postJson('/api/v1/purchases', $body)->assertSuccessful()->json('data.id');

        return MaterialPurchase::findOrFail($id);
    }

    /** Rs 8,000 ka kiraya, seedha driver ke naam. */
    private function kiraya(array $extra = []): TransportTrip
    {
        $id = $this->postJson('/api/v1/transport-trips', array_merge([
            'driver_id' => $this->driver->id,
            'kind' => 'in',
            'trip_date' => '2026-06-10',
            'to_location' => 'Factory',
            'rate' => 8000,
            'paid' => 0,
            'method' => 'cash',
            'notes' => 'Raiti 10 trolley',
        ], $extra))->assertCreated()->json('data.id');

        return TransportTrip::findOrFail($id);
    }

    public function test_a_purchase_never_carries_kiraya(): void
    {
        // Purani aadat: kiraya purchase par likh dena. Ab wo field hai hi nahi,
        // aur bhej bhi do to bill me nahi chadhta.
        $purchase = $this->buy(['transport_cost' => 8000, 'driver_id' => $this->driver->id]);

        $this->assertSame(0, (int) $purchase->transport_cost);
        $this->assertSame(5100000, (int) $purchase->total_cost, 'Sirf maal aur loading.');
        $this->assertSame(5100000, $purchase->supplierBill());
        $this->assertSame(5100000, (int) $this->supplier->fresh()->balance);

        $this->assertSame(0, TransportTrip::count(), 'Purchase se koi trip nahi banti.');
        $this->assertSame(0, (int) $this->driver->fresh()->balance);
    }

    public function test_material_kiraya_sits_on_the_driver_as_a_factory_kharcha(): void
    {
        $trip = $this->kiraya(['paid' => 3000]);

        $this->assertSame(TransportTrip::INBOUND, $trip->kind);
        $this->assertSame(800000, (int) $trip->rate);
        $this->assertSame(300000, (int) $trip->paid);
        $this->assertSame(500000, (int) $trip->balance);
        $this->assertSame(500000, (int) $this->driver->fresh()->balance);

        // Poora kiraya aik hi dafa, seedha factory ke kharche me.
        $this->assertSame(800000, $this->net('5000'));
        $this->assertSame(0, $this->net('2100'), 'Isay clearing se koi taluq nahi.');
        $this->assertSame((int) JournalLine::sum('debit'), (int) JournalLine::sum('credit'));
    }

    public function test_the_driver_is_paid_from_his_own_screen(): void
    {
        $this->kiraya();
        $this->assertSame(800000, (int) $this->driver->fresh()->balance);

        $this->postJson("/api/v1/drivers/{$this->driver->id}/pay", [
            'payment_date' => '2026-06-12', 'amount' => 8000, 'method' => 'cash',
        ])->assertCreated();

        $this->assertSame(0, (int) $this->driver->fresh()->balance);
        $this->assertSame((int) JournalLine::sum('debit'), (int) JournalLine::sum('credit'));
    }

    public function test_the_supplier_bill_has_nothing_to_do_with_the_kiraya(): void
    {
        $this->buy();
        $this->kiraya();

        $body = $this->getJson("/api/v1/suppliers/{$this->supplier->id}/ledger")->assertOk()->json();
        $credit = array_sum(array_column($body['rows'], 'credit'));
        $debit = array_sum(array_column($body['rows'], 'debit'));

        $this->assertSame(5100000, $credit - $debit, 'Supplier ko sirf maal aur loading ka paisa dena hai.');
        $this->assertSame((int) $this->supplier->fresh()->balance, $credit - $debit);
    }

    public function test_the_driver_khata_separates_purchase_kiraya_from_block_sell_kiraya(): void
    {
        $this->kiraya(['rate' => 8000, 'paid' => 3000]);                   // maal laaya
        $this->kiraya(['kind' => 'out', 'rate' => 5000, 'paid' => 5000]);  // maal bheja

        $s = $this->getJson("/api/v1/drivers/{$this->driver->id}/history")->assertOk()->json('summary');

        $this->assertSame(1, $s['inbound_count']);
        $this->assertSame(800000, $s['inbound_total']);
        $this->assertSame(300000, $s['inbound_paid'], 'Maal laane ke kiraye me se itna diya.');
        $this->assertSame(500000, $s['inbound_due']);

        $this->assertSame(1, $s['outbound_count']);
        $this->assertSame(500000, $s['outbound_total']);
        $this->assertSame(500000, $s['outbound_paid'], 'Maal bhejne ka kiraya poora diya.');
        $this->assertSame(0, $s['outbound_due']);

        $this->assertSame(500000, $s['outstanding']);
        $this->assertTrue($s['reconciled']);
    }

    public function test_the_drivers_list_can_be_filtered_by_the_kind_of_work(): void
    {
        $this->kiraya(['rate' => 8000, 'paid' => 3000]);

        $blocksOnly = Driver::create(['name' => 'Bashir', 'phone' => '0301-0000000', 'is_active' => true]);
        $this->kiraya(['driver_id' => $blocksOnly->id, 'kind' => 'out', 'rate' => 5000, 'paid' => 0]);

        // Sirf maal laane wale.
        $body = $this->getJson('/api/v1/drivers?kind=in')->assertOk()->json();
        $this->assertSame(['Akram'], array_column($body['data'], 'name'));
        $this->assertSame(1, $body['data'][0]['kind_summary']['trips']);
        $this->assertSame(800000, $body['data'][0]['kind_summary']['kiraya']);
        $this->assertSame(300000, $body['data'][0]['kind_summary']['paid']);
        $this->assertSame(500000, $body['data'][0]['kind_summary']['due']);

        // Sirf maal bhejne wale.
        $out = $this->getJson('/api/v1/drivers?kind=out')->assertOk()->json();
        $this->assertSame(['Bashir'], array_column($out['data'], 'name'));

        // Dono taraf ka jorh hamesha sath aata hai, chahe list kuch bhi dikha rahi ho.
        $this->assertSame(800000, $body['totals']['in']['kiraya']);
        $this->assertSame(300000, $body['totals']['in']['paid']);
        $this->assertSame(500000, $body['totals']['in']['due']);
        $this->assertSame(500000, $body['totals']['out']['kiraya']);
        $this->assertSame(0, $body['totals']['out']['paid']);
        $this->assertSame($body['totals'], $out['totals']);

        // Bina filter ke poori list, aur kisi par kism ka hisaab nahi.
        $all = $this->getJson('/api/v1/drivers')->assertOk()->json();
        $this->assertCount(2, $all['data']);
        $this->assertArrayNotHasKey('kind_summary', $all['data'][0]);
    }

    public function test_the_kiraya_page_shows_only_the_maal_laane_wali_trips(): void
    {
        $in = $this->kiraya();
        $this->kiraya(['kind' => 'out', 'rate' => 5000]);

        $refs = array_column($this->getJson('/api/v1/transport-trips?kind=in')->assertOk()->json('data'), 'reference');

        $this->assertSame([$in->reference], $refs);
    }

    private function net(string $code): int
    {
        $lines = JournalLine::query()->whereHas('account', fn ($q) => $q->where('code', $code));

        return (int) $lines->clone()->sum('debit') - (int) $lines->clone()->sum('credit');
    }
}
