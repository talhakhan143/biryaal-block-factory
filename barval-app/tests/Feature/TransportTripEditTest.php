<?php

namespace Tests\Feature;

use App\Models\Driver;
use App\Models\JournalEntry;
use App\Models\JournalLine;
use App\Models\MaterialPurchase;
use App\Models\Payment;
use App\Models\RawMaterial;
use App\Models\Supplier;
use App\Models\TransportTrip;
use App\Models\User;
use App\Services\Payments\PaymentService;
use App\Services\Transport\TransportService;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Galat likha hua kiraya theek karna.
 *
 * Owner ki shikayat yehi thi: kiraya ya driver galat likha jaye to row par se
 * theek hona chahiye. Is liye har test aik hi cheez sabit karta hai: edit ke
 * baad har figure nayi rakam par hai, aur jo kuch badalna nahi chahiye tha
 * (parchi ka reference, kiraye ka khata) wo wahi hai.
 */
class TransportTripEditTest extends TestCase
{
    use RefreshDatabase;

    private Driver $driver;

    private Driver $other;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([RolePermissionSeeder::class, ChartOfAccountsSeeder::class]);

        $owner = User::factory()->create();
        $owner->assignRole('Owner');
        Sanctum::actingAs($owner);

        $this->driver = Driver::create(['name' => 'Akram Driver', 'vehicle_name' => 'Hino']);
        $this->other = Driver::create(['name' => 'Bashir Driver', 'vehicle_name' => 'Mazda']);
    }

    /** Ek poora snapshot: har wo figure jo galat edit se kharab ho sakta hai. */
    private function snapshot(): array
    {
        return [
            'driver_balance' => (int) $this->driver->fresh()->balance,
            'other_balance' => (int) $this->other->fresh()->balance,
            'cash' => $this->net('1000'),
            'expense' => $this->net('5000'),
            'clearing' => $this->net('2100'),
            'payable' => $this->net('2000'),
            'debit_total' => (int) JournalLine::sum('debit'),
            'credit_total' => (int) JournalLine::sum('credit'),
            'trips' => TransportTrip::orderBy('reference')->get(['reference', 'rate', 'paid', 'balance', 'status'])->toArray(),
        ];
    }

    private function net(string $code): int
    {
        $lines = JournalLine::query()->whereHas('account', fn ($q) => $q->where('code', $code));

        return (int) $lines->clone()->sum('debit') - (int) $lines->clone()->sum('credit');
    }

    private function inboundTrip(int $rate = 500000, int $paid = 200000): TransportTrip
    {
        return app(TransportService::class)->recordTrip([
            'driver_id' => $this->driver->id,
            'kind' => TransportTrip::INBOUND,
            'trip_date' => '2026-06-10',
            'rate' => $rate,
            'paid' => $paid,
            'method' => 'cash',
            'notes' => 'Raiti 10 trolley',
        ]);
    }

    public function test_editing_an_inbound_kiraya_moves_every_figure_and_stays_in_expense(): void
    {
        $trip = $this->inboundTrip();

        $this->assertSame(300000, (int) $this->driver->fresh()->balance, 'Baqi driver ke khate me jana chahiye.');
        $this->assertSame(500000, $this->net('5000'), 'Maal laane ka kiraya 5000 kharche me jata hai.');
        $this->assertSame(0, $this->net('2100'), 'Clearing ko haath nahi lagna chahiye.');

        // Kiraya 7000 tha, 5000 likh diya gaya, aur diya 1000 tha. Driver bhi
        // galat likha gaya tha.
        $this->patchJson("/api/v1/transport-trips/{$trip->id}", [
            'driver_id' => $this->other->id,
            'trip_date' => '2026-06-11',
            'rate' => 7000,
            'paid' => 1000,
            'method' => 'cash',
            'notes' => 'Raiti 12 trolley',
        ])->assertOk()->assertJsonPath('data.reference', $trip->reference);

        $this->assertSame(0, (int) $this->driver->fresh()->balance, 'Purane driver ka baqi utar jana chahiye.');
        $this->assertSame(600000, (int) $this->other->fresh()->balance, 'Naya baqi naye driver par.');
        $this->assertSame(-100000, $this->net('1000'), 'Cash sirf nayi di hui rakam par.');
        $this->assertSame(700000, $this->net('5000'), 'Kharcha naye kiraye par.');
        $this->assertSame(0, $this->net('2100'), 'Kiraya ab bhi clearing me nahi jata.');
        $this->assertSame(-600000, $this->net('2000'));
        $this->assertSame((int) JournalLine::sum('debit'), (int) JournalLine::sum('credit'));

        $fresh = $trip->fresh();
        $this->assertSame([700000, 100000, 600000, 'partial'], [
            (int) $fresh->rate, (int) $fresh->paid, (int) $fresh->balance, $fresh->status,
        ]);
        $this->assertSame('2026-06-11', $fresh->trip_date->toDateString());
        $this->assertSame(1, TransportTrip::count(), 'Edit se nayi trip nahi banni chahiye.');
        $this->assertSame(1, JournalEntry::where('source_id', $trip->id)->count(), 'Khate me aik hi entry rehni chahiye.');
    }

    public function test_editing_an_outbound_trip_still_uses_the_clearing_account(): void
    {
        $trip = app(TransportService::class)->recordTrip([
            'driver_id' => $this->driver->id,
            'kind' => TransportTrip::OUTBOUND,
            'trip_date' => '2026-06-10',
            'rate' => 400000,
            'paid' => 100000,
            'method' => 'cash',
        ]);
        $this->assertSame(400000, $this->net('2100'));
        $this->assertSame(0, $this->net('5000'));

        $this->patchJson("/api/v1/transport-trips/{$trip->id}", [
            'driver_id' => $this->driver->id,
            'trip_date' => '2026-06-10',
            'rate' => 5500,
            'paid' => 1000,
            'method' => 'cash',
        ])->assertOk();

        $this->assertSame(550000, $this->net('2100'), 'Maal bhejne ka kiraya clearing me hi rehta hai.');
        $this->assertSame(0, $this->net('5000'), 'Bahar jane wala kiraya kharche me nahi aana chahiye.');
        $this->assertSame(450000, (int) $this->driver->fresh()->balance);
        $this->assertSame(-100000, $this->net('1000'));
        $this->assertSame((int) JournalLine::sum('debit'), (int) JournalLine::sum('credit'));
    }

    public function test_the_direction_of_a_trip_cannot_be_changed(): void
    {
        $trip = $this->inboundTrip();
        $before = $this->snapshot();

        $this->patchJson("/api/v1/transport-trips/{$trip->id}", [
            'driver_id' => $this->driver->id,
            'trip_date' => '2026-06-10',
            'rate' => 5000,
            'paid' => 2000,
            'kind' => 'out',
        ])->assertStatus(422);

        $this->assertSame($before, $this->snapshot(), 'Mana ki hui edit se kuch nahi hilna chahiye.');
    }

    public function test_a_trip_whose_fare_was_already_paid_can_still_be_edited(): void
    {
        // Pehle yahan error aata tha. Ab alag se di gayi payment apni jagah
        // qaim rehti hai aur kiraya phir bhi theek hota hai.
        $trip = $this->inboundTrip();   // kiraya Rs 5,000, mauqe par Rs 2,000 diya

        $this->postJson("/api/v1/transport-trips/{$trip->id}/pay", [
            'payment_date' => '2026-06-12', 'amount' => 1000, 'method' => 'cash',
        ])->assertCreated();
        $this->assertSame(300000, (int) $trip->fresh()->paid, 'Rs 2,000 + Rs 1,000.');

        // Kiraya Rs 9,000 kar do, diya hua Rs 3,000 hi rehta hai.
        $this->patchJson("/api/v1/transport-trips/{$trip->id}", [
            'driver_id' => $this->driver->id,
            'trip_date' => '2026-06-10',
            'rate' => 9000,
            'paid' => 3000,
        ])->assertOk();

        $trip->refresh();
        $this->assertSame(900000, (int) $trip->rate);
        $this->assertSame(300000, (int) $trip->paid, 'Di hui dono payment apni jagah.');
        $this->assertSame(600000, (int) $trip->balance);
        $this->assertSame(600000, (int) $this->driver->fresh()->balance, 'Driver ko utna hi dena baqi.');
        $this->assertSame((int) JournalLine::sum('debit'), (int) JournalLine::sum('credit'));
    }

    /**
     * Lump payment trip ke paid column ko hila deti hai magar us trip ke sath
     * judti nahi. Pehle is par edit ruk jati thi, ab chalti hai: purana asar
     * khate ki line se parha jata hai, is liye column ka hila hua figure
     * hisaab kharab nahi karta.
     */
    public function test_a_trip_touched_by_a_lump_driver_payment_can_still_be_edited(): void
    {
        $trip = $this->inboundTrip();

        app(PaymentService::class)->settleParty($this->driver->fresh(), [
            'payment_date' => '2026-06-12', 'amount' => 100000, 'method' => 'cash',
        ]);
        $this->assertSame(300000, (int) $trip->fresh()->paid, 'Lump payment trip ke column hila deti hai.');

        $this->patchJson("/api/v1/transport-trips/{$trip->id}", [
            'driver_id' => $this->driver->id,
            'trip_date' => '2026-06-10',
            'rate' => 9000,
            'paid' => 3000,
        ])->assertOk();

        $this->assertSame(900000, (int) $trip->fresh()->rate);
        $this->assertSame((int) JournalLine::sum('debit'), (int) JournalLine::sum('credit'));
    }

    public function test_linking_a_purchase_afterwards_shows_the_driver_on_the_purchase_row(): void
    {
        $supplier = Supplier::create(['name' => 'Chenab Sand']);
        $material = RawMaterial::create(['name' => 'Raiti', 'unit' => 'trolley', 'current_qty' => 0, 'is_active' => true]);
        $purchase = MaterialPurchase::create([
            'reference' => 'PUR-TEST-1',
            'supplier_id' => $supplier->id,
            'raw_material_id' => $material->id,
            'purchase_date' => '2026-06-10',
            'quantity' => 10,
            'unit_cost' => 100000,
            'total_cost' => 1000000,
            'paid_amount' => 0,
            'payment_status' => 'unpaid',
        ]);

        $trip = $this->inboundTrip();
        $this->assertNull($trip->material_purchase_id);

        $rows = $this->getJson('/api/v1/purchases')->assertOk()->json('data');
        $this->assertNull($rows[0]['freight_driver'], 'Pehle purchase ki row par koi driver nahi.');

        $this->patchJson("/api/v1/transport-trips/{$trip->id}", [
            'driver_id' => $this->driver->id,
            'trip_date' => '2026-06-10',
            'rate' => 5000,
            'paid' => 2000,
            'material_purchase_id' => $purchase->id,
        ])->assertOk();

        $rows = $this->getJson('/api/v1/purchases')->assertOk()->json('data');
        $this->assertSame('Akram Driver', $rows[0]['freight_driver']['driver_name']);
        $this->assertSame($trip->reference, $rows[0]['freight_driver']['trip_reference']);
        $this->assertSame(500000, $rows[0]['freight_driver']['rate']);
    }

    public function test_an_outbound_trip_cannot_be_tied_to_a_purchase(): void
    {
        $supplier = Supplier::create(['name' => 'Chenab Sand']);
        $material = RawMaterial::create(['name' => 'Raiti', 'unit' => 'trolley', 'current_qty' => 0, 'is_active' => true]);
        $purchase = MaterialPurchase::create([
            'reference' => 'PUR-TEST-2',
            'supplier_id' => $supplier->id,
            'raw_material_id' => $material->id,
            'purchase_date' => '2026-06-10',
            'quantity' => 10,
            'unit_cost' => 100000,
            'total_cost' => 1000000,
            'paid_amount' => 0,
            'payment_status' => 'unpaid',
        ]);

        $trip = app(TransportService::class)->recordTrip([
            'driver_id' => $this->driver->id,
            'kind' => TransportTrip::OUTBOUND,
            'trip_date' => '2026-06-10',
            'rate' => 400000,
            'paid' => 0,
        ]);

        $this->patchJson("/api/v1/transport-trips/{$trip->id}", [
            'driver_id' => $this->driver->id,
            'trip_date' => '2026-06-10',
            'rate' => 4000,
            'paid' => 0,
            'material_purchase_id' => $purchase->id,
        ])->assertStatus(422);

        $this->assertNull($trip->fresh()->material_purchase_id);
    }

    public function test_the_old_payment_method_is_kept_when_only_the_rate_changes(): void
    {
        $trip = app(TransportService::class)->recordTrip([
            'driver_id' => $this->driver->id,
            'kind' => TransportTrip::INBOUND,
            'trip_date' => '2026-06-10',
            'rate' => 500000,
            'paid' => 200000,
            'method' => 'bank',
            'bank_ref' => 'Meezan cheque 123',
        ]);
        $this->assertSame(-200000, $this->net('1010'), 'Bank se diya gaya tha.');

        // Sirf kiraya theek kiya, paisa utna hi hai, to tareeqa nahi bheja jata.
        $this->patchJson("/api/v1/transport-trips/{$trip->id}", [
            'driver_id' => $this->driver->id,
            'trip_date' => '2026-06-10',
            'rate' => 6000,
            'paid' => 2000,
        ])->assertOk();

        $this->assertSame(-200000, $this->net('1010'), 'Bank ka paisa bank me hi rehna chahiye.');
        $this->assertSame(0, $this->net('1000'), 'Cash me chup chaap nahi jana chahiye.');
        $this->assertSame(600000, $this->net('5000'));
        $this->assertSame(400000, (int) $this->driver->fresh()->balance);
    }
}
