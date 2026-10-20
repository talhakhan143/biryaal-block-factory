<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Driver;
use App\Models\FinishedGoodsStock;
use App\Models\Product;
use App\Models\RawMaterial;
use App\Models\Sale;
use App\Models\Supplier;
use App\Models\User;
use App\Services\Purchasing\PurchaseService;
use App\Services\Sales\SaleService;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Har cheez ka doosri cheez se rishta.
 *
 * Owner ki shikayat: "customer ke page me driver missing hai, kaunsi trip gayi,
 * kaunse blocks pending hain. Aik aik cheez link karo aapas me."
 *
 * UI us bande tak tabhi pohancha sakti hai jab API uska id aur naam bheje. Ye
 * test wahi contract pakadta hai: kisi ne eager load hata diya to figure theek
 * rehte hain magar link chup chaap mar jata hai, aur kisi ko pata bhi nahi
 * chalta. Is liye har rishta yahan se guzarta hai.
 */
class CrossLinkTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private Driver $driver;

    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([RolePermissionSeeder::class, ChartOfAccountsSeeder::class]);

        $owner = User::factory()->create();
        $owner->assignRole('Owner');
        Sanctum::actingAs($owner);

        $this->customer = Customer::create(['name' => 'Haji Ashraf']);
        $this->driver = Driver::create([
            'name' => 'Akram', 'phone' => '0300-1112223',
            'vehicle_name' => 'Hino', 'vehicle_plate' => 'LEB-4471', 'is_active' => true,
        ]);
        $this->product = Product::create(['name' => 'Block', 'sku' => 'B1', 'sale_price' => 5000, 'curing_days' => 1, 'is_active' => true]);
        FinishedGoodsStock::create(['product_id' => $this->product->id, 'curing_qty' => 0, 'ready_qty' => 500, 'damaged_qty' => 0]);
    }

    private function sell(int $qty = 100): Sale
    {
        // Service khud wahi sale wapas karti hai. Dobara query karne se aik hi
        // second me bani do sales me se ghalat wali uthti thi.
        return app(SaleService::class)->create([
            'customer_id' => $this->customer->id, 'sale_date' => '2026-06-10', 'type' => 'credit',
            'paid' => 0, 'items' => [['product_id' => $this->product->id, 'quantity' => $qty]],
        ]);
    }

    private function deliver(Sale $sale): array
    {
        return $this->postJson('/api/v1/dispatches', [
            'sale_id' => $sale->id,
            'driver_id' => $this->driver->id,
            'dispatch_date' => '2026-06-11',
            'trip_rate' => 2000,
            'trip_paid' => 0,
            'items' => [['product_id' => $this->product->id, 'quantity' => 100]],
        ])->assertSuccessful()->json('data');
    }

    public function test_the_customer_page_knows_which_bills_are_still_undelivered(): void
    {
        $this->sell(100);
        $this->sell(40);

        $s = $this->getJson("/api/v1/customers/{$this->customer->id}/history")->assertOk()->json('summary.factory');

        $this->assertSame(2, $s['pending_bills'], 'Dono bill ka maal abhi khada hai.');
        $this->assertSame(140, $s['pending_blocks']);
    }

    public function test_a_delivered_bill_stops_being_pending_and_names_its_driver(): void
    {
        $sale = $this->sell(100);
        $this->deliver($sale);

        $body = $this->getJson("/api/v1/customers/{$this->customer->id}/history")->assertOk()->json();

        $this->assertSame(0, $body['summary']['factory']['pending_bills']);
        $this->assertSame(0, $body['summary']['factory']['pending_blocks']);

        // Bill ki row khud bata deti hai ke maal kis ke hath gaya.
        $row = collect($body['sales'])->firstWhere('invoice_no', $sale->invoice_no);
        $this->assertCount(1, $row['delivery']);
        $this->assertSame($this->driver->id, $row['delivery'][0]['driver_id'], 'Driver ka id chahiye, warna link nahi banta.');
        $this->assertSame('Akram', $row['delivery'][0]['driver_name']);
    }

    public function test_every_delivery_carries_its_bill_its_driver_and_its_kiraya(): void
    {
        $sale = $this->sell(100);
        $this->deliver($sale);

        $d = $this->getJson("/api/v1/customers/{$this->customer->id}/history")->assertOk()->json('dispatches.0');

        $this->assertSame($sale->invoice_no, $d['sale']['invoice_no'], 'Kis bill ki delivery hai.');
        $this->assertSame($this->driver->id, $d['driver']['id'], 'Driver ka id, taake uski page khul sake.');
        $this->assertSame(200000, $d['trip']['rate'], 'Is delivery ka kiraya.');
        $this->assertSame(200000, $d['trip']['balance']);
    }

    public function test_an_outbound_trip_points_back_at_the_customer(): void
    {
        $sale = $this->sell(100);
        $this->deliver($sale);

        $trip = $this->getJson("/api/v1/drivers/{$this->driver->id}/history")->assertOk()->json('trips.0');

        $this->assertSame('customer', $trip['for']['side']);
        $this->assertSame('Haji Ashraf', $trip['for']['name']);
        $this->assertSame($this->customer->id, $trip['for']['customer_id']);
        $this->assertSame($sale->invoice_no, $trip['for']['reference']);
    }

    public function test_an_inbound_trip_points_back_at_the_supplier(): void
    {
        $supplier = Supplier::create(['name' => 'Chenab Sand']);
        $material = RawMaterial::create(['name' => 'Raiti', 'unit' => 'trolley', 'current_qty' => 0, 'low_stock_threshold' => 0]);
        $purchase = app(PurchaseService::class)->record([
            'supplier_id' => $supplier->id, 'raw_material_id' => $material->id,
            'purchase_date' => '2026-06-10', 'quantity' => 10, 'unit_cost' => 500000, 'paid_amount' => 0,
        ]);

        $this->postJson('/api/v1/transport-trips', [
            'driver_id' => $this->driver->id, 'kind' => 'in', 'trip_date' => '2026-06-10',
            'rate' => 8000, 'paid' => 0, 'material_purchase_id' => $purchase->id,
        ])->assertCreated();

        $trip = $this->getJson("/api/v1/drivers/{$this->driver->id}/history")->assertOk()->json('trips.0');

        $this->assertSame('supplier', $trip['for']['side']);
        $this->assertSame('Chenab Sand', $trip['for']['name']);
        $this->assertSame($supplier->id, $trip['for']['supplier_id']);
        $this->assertSame($purchase->reference, $trip['for']['reference']);
    }

    public function test_the_supplier_page_names_the_driver_who_brought_the_material(): void
    {
        $supplier = Supplier::create(['name' => 'Chenab Sand']);
        $material = RawMaterial::create(['name' => 'Raiti', 'unit' => 'trolley', 'current_qty' => 0, 'low_stock_threshold' => 0]);
        $purchase = app(PurchaseService::class)->record([
            'supplier_id' => $supplier->id, 'raw_material_id' => $material->id,
            'purchase_date' => '2026-06-10', 'quantity' => 10, 'unit_cost' => 500000, 'paid_amount' => 0,
        ]);
        $this->postJson('/api/v1/transport-trips', [
            'driver_id' => $this->driver->id, 'kind' => 'in', 'trip_date' => '2026-06-10',
            'rate' => 8000, 'paid' => 0, 'material_purchase_id' => $purchase->id,
        ])->assertCreated();

        $row = collect($this->getJson("/api/v1/suppliers/{$supplier->id}/history")->assertOk()->json('purchases'))
            ->firstWhere('reference', $purchase->reference);

        $this->assertSame($this->driver->id, $row['freight_driver']['driver_id'], 'Driver ka id chahiye, warna link nahi banta.');
        $this->assertSame('Akram', $row['freight_driver']['driver_name']);
        $this->assertSame(800000, $row['freight_driver']['rate']);
    }

    public function test_the_sales_list_shows_delivery_without_opening_each_bill(): void
    {
        $pending = $this->sell(40);
        $sent = $this->sell(100);
        $this->deliver($sent);

        $rows = collect($this->getJson('/api/v1/sales')->assertOk()->json('data'))->keyBy('invoice_no');

        $this->assertSame([], $rows[$pending->invoice_no]['delivery'], 'Is ka maal abhi khada hai.');
        $this->assertSame($this->driver->id, $rows[$sent->invoice_no]['delivery'][0]['driver_id']);
    }

    public function test_the_trips_list_says_whose_work_each_trip_was(): void
    {
        $sale = $this->sell(100);
        $this->deliver($sale);

        $trip = collect($this->getJson('/api/v1/transport-trips')->assertOk()->json('data'))->first();

        $this->assertSame('customer', $trip['for']['side']);
        $this->assertSame($this->customer->id, $trip['for']['customer_id']);
    }
}
