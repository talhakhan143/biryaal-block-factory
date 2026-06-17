<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\JournalLine;
use App\Models\Product;
use App\Models\ProductionBatch;
use App\Models\User;
use App\Services\Production\ProductionService;
use App\Services\Sales\SaleService;
use Database\Seeders\CatalogSeeder;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use RuntimeException;
use Tests\TestCase;

class CoreFlowTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([RolePermissionSeeder::class, ChartOfAccountsSeeder::class, CatalogSeeder::class]);

        $this->owner = User::factory()->create();
        $this->owner->assignRole('Owner');
    }

    private function readyProduct(int $qty = 1000): Product
    {
        $product = Product::first();
        $product->stock()->update(['ready_qty' => $qty]);

        return $product->fresh('stock');
    }

    public function test_trial_balance_stays_balanced_after_a_credit_sale(): void
    {
        Sanctum::actingAs($this->owner);
        $product = $this->readyProduct(1000);
        $customer = Customer::create(['name' => 'Test Customer']);

        app(SaleService::class)->create([
            'customer_id' => $customer->id,
            'sale_date' => '2026-06-16',
            'type' => 'credit',
            'paid' => 50000,
            'items' => [['product_id' => $product->id, 'quantity' => 600, 'unit_price' => 3500]],
        ]);

        $debit = (int) JournalLine::sum('debit');
        $credit = (int) JournalLine::sum('credit');

        $this->assertSame($debit, $credit);
        $this->assertGreaterThan(0, $debit);
    }

    public function test_credit_sale_decrements_ready_stock_and_raises_receivable(): void
    {
        Sanctum::actingAs($this->owner);
        $product = $this->readyProduct(1000);
        $customer = Customer::create(['name' => 'Test Customer']);

        app(SaleService::class)->create([
            'customer_id' => $customer->id,
            'sale_date' => '2026-06-16',
            'type' => 'credit',
            'paid' => 0,
            'items' => [['product_id' => $product->id, 'quantity' => 600, 'unit_price' => 3500]],
        ]);

        $this->assertSame(400, (int) $product->fresh()->stock->ready_qty);
        $this->assertSame(600 * 3500, (int) $customer->fresh()->balance);
    }

    public function test_sale_exceeding_ready_stock_is_rejected(): void
    {
        $this->expectException(RuntimeException::class);

        Sanctum::actingAs($this->owner);
        $product = $this->readyProduct(100);

        app(SaleService::class)->create([
            'customer_id' => null,
            'sale_date' => '2026-06-16',
            'type' => 'cash',
            'items' => [['product_id' => $product->id, 'quantity' => 600]],
        ]);
    }

    public function test_only_due_batches_are_promoted_to_ready(): void
    {
        Sanctum::actingAs($this->owner);
        $service = app(ProductionService::class);
        $productId = Product::first()->id;

        $service->record([
            'product_id' => $productId,
            'production_date' => now()->subDays(8)->toDateString(),
            'quantity_produced' => 500,
            'curing_days' => 7,
        ]);

        $service->record([
            'product_id' => $productId,
            'production_date' => now()->toDateString(),
            'quantity_produced' => 300,
            'curing_days' => 7,
        ]);

        $promoted = $service->promoteDueBatches();

        $this->assertSame(1, $promoted);
        $this->assertSame(1, ProductionBatch::where('status', 'ready')->count());
        $this->assertSame(1, ProductionBatch::where('status', 'curing')->count());
        $this->assertSame(500, (int) Product::first()->fresh()->stock->ready_qty);
        $this->assertSame(300, (int) Product::first()->fresh()->stock->curing_qty);
    }

    public function test_rbac_blocks_accountant_from_production_but_allows_owner(): void
    {
        $accountant = User::factory()->create();
        $accountant->assignRole('Accountant');

        $payload = [
            'product_id' => Product::first()->id,
            'production_date' => '2026-06-16',
            'quantity_produced' => 100,
        ];

        Sanctum::actingAs($accountant);
        $this->postJson('/api/v1/production', $payload)->assertForbidden();

        Sanctum::actingAs($this->owner);
        $this->postJson('/api/v1/production', $payload)->assertSuccessful();
    }

    public function test_voiding_a_sale_restores_stock_receivable_and_keeps_books_balanced(): void
    {
        Sanctum::actingAs($this->owner);
        $product = $this->readyProduct(1000);
        $customer = Customer::create(['name' => 'Test Customer']);

        $sale = app(SaleService::class)->create([
            'customer_id' => $customer->id,
            'sale_date' => '2026-06-16',
            'type' => 'credit',
            'paid' => 0,
            'items' => [['product_id' => $product->id, 'quantity' => 600, 'unit_price' => 3500]],
        ]);

        $this->assertSame(400, (int) $product->fresh()->stock->ready_qty);
        $this->assertSame(600 * 3500, (int) $customer->fresh()->balance);

        app(SaleService::class)->void($sale);

        // blocks back to ready, receivable reversed, sale gone
        $this->assertSame(1000, (int) $product->fresh()->stock->ready_qty);
        $this->assertSame(0, (int) $customer->fresh()->balance);
        $this->assertDatabaseMissing('sales', ['id' => $sale->id]);

        // ledger nets to zero and still balances
        $debit = (int) JournalLine::sum('debit');
        $credit = (int) JournalLine::sum('credit');
        $this->assertSame($debit, $credit);
        $this->assertSame(0, $debit);
    }
}
