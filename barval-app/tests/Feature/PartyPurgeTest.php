<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Driver;
use App\Models\FinishedGoodsStock;
use App\Models\JournalEntry;
use App\Models\JournalLine;
use App\Models\MaterialPurchase;
use App\Models\Payment;
use App\Models\Product;
use App\Models\RawMaterial;
use App\Models\Sale;
use App\Models\Supplier;
use App\Models\TransportTrip;
use App\Models\User;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Bande ko poora mitana.
 *
 * Owner ka faisla: koi recycle bin nahi, seedha delete, aur us ka saara data
 * sath jaye. Khatra sirf aik hai aur wo khamosh hai: khata hil jaye ya stock
 * ghalat reh jaye aur kisi ko pata na chale. Is liye har test aik hi baat
 * sabit karta hai: mitane ke baad debit credit barabar hon, stock wahin ho
 * jahan mitane se pehle tha, aur us bande ka koi nishan na bache.
 */
class PartyPurgeTest extends TestCase
{
    use RefreshDatabase;

    private Product $product;

    private RawMaterial $material;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([RolePermissionSeeder::class, ChartOfAccountsSeeder::class]);

        $owner = User::factory()->create();
        $owner->assignRole('Owner');
        Sanctum::actingAs($owner);

        $this->product = Product::create([
            'name' => '6 Inch Block', 'sku' => 'B6', 'sale_price' => 5000,
            'curing_days' => 1, 'is_active' => true,
        ]);
        FinishedGoodsStock::create([
            'product_id' => $this->product->id, 'curing_qty' => 0, 'ready_qty' => 1000, 'damaged_qty' => 0,
        ]);
        $this->material = RawMaterial::create([
            'name' => 'Raiti', 'unit' => 'trolley', 'current_qty' => 50, 'low_stock_threshold' => 0,
        ]);
    }

    private function ready(): int
    {
        return (int) FinishedGoodsStock::where('product_id', $this->product->id)->value('ready_qty');
    }

    private function raw(): float
    {
        return (float) $this->material->fresh()->current_qty;
    }

    private function balanced(): bool
    {
        return (int) JournalLine::sum('debit') === (int) JournalLine::sum('credit');
    }

    public function test_deleting_a_customer_takes_every_bill_and_puts_the_blocks_back(): void
    {
        $customer = Customer::create(['name' => 'Haji Ashraf']);

        $this->postJson('/api/v1/sales', [
            'customer_id' => $customer->id, 'sale_date' => '2026-11-04', 'type' => 'credit', 'paid' => 0,
            'items' => [['product_id' => $this->product->id, 'quantity' => 100]],
        ])->assertSuccessful();
        $sale = Sale::firstOrFail();

        $this->postJson("/api/v1/sales/{$sale->id}/receive", [
            'amount' => 100, 'payment_date' => '2026-11-04', 'method' => 'cash',
        ])->assertSuccessful();

        $this->assertSame(900, $this->ready());

        $this->deleteJson("/api/v1/customers/{$customer->id}")->assertNoContent();

        $this->assertSame(1000, $this->ready(), 'Saare block wapas ready stock me.');
        $this->assertSame(0, Sale::count());
        $this->assertSame(0, Payment::count());
        $this->assertSame(0, Customer::count());
        $this->assertSame(0, JournalEntry::count(), 'Us bande ki koi entry nahi bachni chahiye.');
        $this->assertTrue($this->balanced());
    }

    public function test_deleting_a_supplier_takes_every_purchase_and_the_raw_material_back(): void
    {
        $supplier = Supplier::create(['name' => 'Chenab Sand']);

        $this->postJson('/api/v1/purchases', [
            'supplier_id' => $supplier->id, 'raw_material_id' => $this->material->id,
            'purchase_date' => '2026-11-04', 'quantity' => 10, 'unit_cost' => 5000,
            'paid_amount' => 20000, 'method' => 'cash',
        ])->assertSuccessful();

        $this->assertSame(60.0, $this->raw(), '50 + 10 trolley.');

        $this->deleteJson("/api/v1/suppliers/{$supplier->id}")->assertNoContent();

        $this->assertSame(50.0, $this->raw(), 'Kacha maal wapas apni jagah.');
        $this->assertSame(0, MaterialPurchase::count());
        $this->assertSame(0, Supplier::count());
        $this->assertSame(0, JournalEntry::count());
        $this->assertTrue($this->balanced());
    }

    public function test_deleting_a_driver_takes_his_trips_but_leaves_the_purchase_alone(): void
    {
        $supplier = Supplier::create(['name' => 'Chenab Sand']);
        $driver = Driver::create(['name' => 'Akram', 'is_active' => true]);

        // Khareed ke sath hi driver aur kiraya likha gaya.
        $this->postJson('/api/v1/purchases', [
            'supplier_id' => $supplier->id, 'raw_material_id' => $this->material->id,
            'purchase_date' => '2026-11-04', 'quantity' => 10, 'unit_cost' => 5000,
            'paid_amount' => 0, 'method' => 'cash',
            'driver_id' => $driver->id, 'freight_rate' => 8000, 'freight_paid' => 3000,
        ])->assertSuccessful();

        $purchase = MaterialPurchase::firstOrFail();
        $this->assertSame(1, TransportTrip::count());
        $this->assertSame(500000, (int) $driver->fresh()->balance);

        $this->deleteJson("/api/v1/drivers/{$driver->id}")->assertNoContent();

        $this->assertSame(0, Driver::count());
        $this->assertSame(0, TransportTrip::count(), 'Driver ki trip bhi gayi.');

        // Khareed supplier ka maamla hai, driver ke jane se wo nahi jati.
        $this->assertSame(1, MaterialPurchase::count());
        $this->assertSame(5000000, (int) $purchase->fresh()->total_cost, '10 x Rs 5,000.');
        $this->assertSame(60.0, $this->raw(), 'Kacha maal apni jagah.');
        $this->assertTrue($this->balanced());
    }

    public function test_deleting_a_supplier_leaves_the_drivers_kiraya_alone(): void
    {
        // Kiraya driver ka paisa hai. Supplier mit jaye to bhi driver ko wo
        // paisa dena hai, is liye trip zinda rehni chahiye.
        $supplier = Supplier::create(['name' => 'Chenab Sand']);
        $driver = Driver::create(['name' => 'Akram', 'is_active' => true]);

        $this->postJson('/api/v1/purchases', [
            'supplier_id' => $supplier->id, 'raw_material_id' => $this->material->id,
            'purchase_date' => '2026-11-04', 'quantity' => 10, 'unit_cost' => 5000,
            'paid_amount' => 0, 'method' => 'cash',
            'driver_id' => $driver->id, 'freight_rate' => 8000, 'freight_paid' => 0,
        ])->assertSuccessful();

        $this->deleteJson("/api/v1/suppliers/{$supplier->id}")->assertNoContent();

        $this->assertSame(1, TransportTrip::count(), 'Driver ki trip zinda rehti hai.');
        $this->assertNull(TransportTrip::firstOrFail()->material_purchase_id, 'Bas khareed se rishta toot jata hai.');
        $this->assertSame(800000, (int) $driver->fresh()->balance, 'Driver ko utna hi dena hai.');
        $this->assertTrue($this->balanced());
    }

    public function test_the_preview_says_what_will_go(): void
    {
        $customer = Customer::create(['name' => 'Haji Ashraf']);
        $this->postJson('/api/v1/sales', [
            'customer_id' => $customer->id, 'sale_date' => '2026-11-04', 'type' => 'credit', 'paid' => 0,
            'items' => [['product_id' => $this->product->id, 'quantity' => 10]],
        ])->assertSuccessful();

        $this->getJson("/api/v1/customers/{$customer->id}/delete-preview")
            ->assertOk()
            ->assertJsonPath('data.bills', 1);
    }

    public function test_deleting_a_party_with_nothing_on_it_just_works(): void
    {
        $supplier = Supplier::create(['name' => 'Naya Supplier']);

        $this->deleteJson("/api/v1/suppliers/{$supplier->id}")->assertNoContent();

        $this->assertSame(0, Supplier::count());
        $this->assertTrue($this->balanced());
    }
}
