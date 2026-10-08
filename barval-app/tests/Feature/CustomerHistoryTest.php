<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Product;
use App\Models\Sale;
use App\Models\User;
use App\Services\Accounting\AdjustmentService;
use App\Services\Payments\PaymentService;
use App\Services\Sales\SaleService;
use App\Services\Sales\SalesReturnService;
use Database\Seeders\CatalogSeeder;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerHistoryTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([RolePermissionSeeder::class, ChartOfAccountsSeeder::class, CatalogSeeder::class]);

        $this->owner = User::factory()->create();
        $this->owner->assignRole('Owner');
        Sanctum::actingAs($this->owner);
    }

    private function readyProduct(int $qty = 5000): Product
    {
        $product = Product::first();
        $product->stock()->update(['ready_qty' => $qty]);

        return $product->fresh('stock');
    }

    /**
     * One customer, every kind of event, in the order they really happen.
     * Returns the customer with a non-trivial outstanding balance.
     */
    private function busyCustomer(): Customer
    {
        $product = $this->readyProduct();
        $customer = Customer::create(['name' => 'Haji Ashraf', 'phone' => '0300-1112223']);

        // Credit sale with a part payment at the till.
        app(SaleService::class)->create([
            'customer_id' => $customer->id,
            'sale_date' => '2026-06-01',
            'type' => 'credit',
            'paid' => 2000000,          // paisa (Rs 20,000); services paisa leti hain
            'items' => [['product_id' => $product->id, 'quantity' => 500, 'unit_price' => 10000]],
        ]);
        // Cash sale: no receivable, so it must NOT appear on the statement.
        app(SaleService::class)->create([
            'customer_id' => $customer->id,
            'sale_date' => '2026-06-02',
            'type' => 'cash',
            'items' => [['product_id' => $product->id, 'quantity' => 100, 'unit_price' => 10000]],
        ]);
        // Lump receipt, which also re-allocates `sales.paid` behind the scenes.
        app(PaymentService::class)->receiveFromCustomer([
            'customer_id' => $customer->id,
            'payment_date' => '2026-06-03',
            'amount' => 1000000,        // paisa (Rs 10,000)
            'method' => 'cash',
        ]);
        // Return refunded into the balance.
        app(SalesReturnService::class)->create([
            'customer_id' => $customer->id,
            'return_date' => '2026-06-04',
            'refund_mode' => 'account',
            'items' => [['product_id' => $product->id, 'quantity' => 10, 'unit_price' => 10000]],  // Rs 1,000 wapas
        ]);
        // Manual discount: moves the balance, invisible to the old ledger.
        app(AdjustmentService::class)->create([
            'mode' => 'customer_discount',
            'party_id' => $customer->id,
            'adjustment_date' => '2026-06-05',
            'amount' => 50000,          // paisa (Rs 500 ki chhoot)
            'reason' => 'Purani shikayat ka adjustment',
        ]);

        return $customer->fresh();
    }

    public function test_statement_running_total_equals_the_stored_customer_balance(): void
    {
        $customer = $this->busyCustomer();

        $response = $this->getJson("/api/v1/customers/{$customer->id}/history")->assertOk();

        $ledger = $response->json('ledger');
        $this->assertNotEmpty($ledger, 'A customer with credit activity must have statement rows.');

        $running = (int) end($ledger)['running'];
        $this->assertSame((int) $customer->balance, $running);
        $this->assertTrue($response->json('summary.reconciled'));
        $this->assertSame((int) $customer->balance, $response->json('summary.factory.balance'));
    }

    public function test_the_statement_shows_every_bill_including_cash_ones(): void
    {
        // Khata bahi-khata hai, sirf udhaar ka hisaab nahi. Har sauda us me
        // nazar aana chahiye, warna maalik ko lagta hai kuch gum ho gaya.
        $customer = $this->busyCustomer();

        $ledger = $this->getJson("/api/v1/customers/{$customer->id}/history")->assertOk()->json('ledger');
        $types = array_column($ledger, 'type');

        $this->assertContains('return', $types);
        $this->assertContains('adjustment', $types);
        $this->assertContains('receipt', $types);
        // Dono bikriyan, cash wali bhi.
        $this->assertSame(2, count(array_filter($types, fn ($t) => $t === 'sale')));
        $this->assertCount(2, $this->getJson("/api/v1/customers/{$customer->id}/history")->json('sales'));
    }

    public function test_a_bill_shows_its_full_amount_and_what_was_paid_at_the_till(): void
    {
        $product = $this->readyProduct();
        $customer = Customer::create(['name' => 'Haji Ashraf']);

        // Rs 50,000 ka maal, Rs 20,000 mauqe par.
        app(SaleService::class)->create([
            'customer_id' => $customer->id, 'sale_date' => '2026-06-01', 'type' => 'credit',
            'paid' => 2000000,
            'items' => [['product_id' => $product->id, 'quantity' => 500, 'unit_price' => 10000]],
        ]);
        // Cash bikri: poora paisa usi waqt.
        app(SaleService::class)->create([
            'customer_id' => $customer->id, 'sale_date' => '2026-06-02', 'type' => 'cash',
            'items' => [['product_id' => $product->id, 'quantity' => 100, 'unit_price' => 10000]],
        ]);

        $ledger = $this->getJson("/api/v1/customers/{$customer->id}/history")->assertOk()->json('ledger');

        // Poora bill charge me, counter par mila hua paisa credit me.
        $this->assertSame(5000000, $ledger[0]['debit']);
        $this->assertSame(2000000, $ledger[0]['credit']);
        $this->assertSame(3000000, $ledger[0]['running']);

        // Cash bikri dono taraf barabar: nazar aati hai, baqi nahi hilati.
        $this->assertSame(1000000, $ledger[1]['debit']);
        $this->assertSame(1000000, $ledger[1]['credit']);
        $this->assertSame(3000000, $ledger[1]['running']);

        $this->assertSame((int) $customer->fresh()->balance, (int) end($ledger)['running']);
    }

    public function test_a_later_receipt_is_not_counted_twice(): void
    {
        $product = $this->readyProduct();
        $customer = Customer::create(['name' => 'Malik Traders']);

        app(SaleService::class)->create([
            'customer_id' => $customer->id,
            'sale_date' => '2026-06-01',
            'type' => 'credit',
            'paid' => 0,
            'items' => [['product_id' => $product->id, 'quantity' => 100, 'unit_price' => 10000]],
        ]);
        // Settles the invoice in full; PaymentService writes the money back onto
        // `sales.paid`, which is exactly the double-count trap.
        app(PaymentService::class)->receiveFromCustomer([
            'customer_id' => $customer->id,
            'payment_date' => '2026-06-02',
            'amount' => 1000000,
            'method' => 'cash',
        ]);

        $body = $this->getJson("/api/v1/customers/{$customer->id}/history")->assertOk()->json();

        $this->assertSame(0, (int) $customer->fresh()->balance);
        $this->assertSame(0, (int) end($body['ledger'])['running']);
        $this->assertTrue($body['summary']['reconciled']);
    }

    public function test_history_is_empty_but_valid_for_a_brand_new_customer(): void
    {
        $customer = Customer::create(['name' => 'Naya Grahak']);

        $this->getJson("/api/v1/customers/{$customer->id}/history")
            ->assertOk()
            ->assertJsonPath('ledger', [])
            ->assertJsonPath('summary.reconciled', true)
            ->assertJsonPath('summary.factory.outstanding', 0)
            ->assertJsonPath('customer.name', 'Naya Grahak');
    }

    public function test_factory_history_never_carries_resellers_point_data(): void
    {
        // Dono businesses ke apne portal aur apne endpoint hain.
        $customer = Customer::create(['name' => 'Shared Grahak']);

        $body = $this->getJson("/api/v1/customers/{$customer->id}/history")->assertOk()->json();

        $this->assertArrayNotHasKey('reseller', $body);
        $this->assertArrayNotHasKey('reseller', $body['summary']);
    }

    public function test_another_customers_refund_never_lands_in_this_statement(): void
    {
        // A return carries its own customer_id AND a sale_id. Those can point at
        // two different people, and only the customer_id decides whose books move.
        $product = $this->readyProduct();
        $x = Customer::create(['name' => 'Customer X']);
        $y = Customer::create(['name' => 'Customer Y']);

        foreach ([$x, $y] as $c) {
            app(SaleService::class)->create([
                'customer_id' => $c->id, 'sale_date' => '2026-06-01', 'type' => 'credit', 'paid' => 0,
                'items' => [['product_id' => $product->id, 'quantity' => 100, 'unit_price' => 10000]],
            ]);
        }

        app(SalesReturnService::class)->create([
            'sale_id' => Sale::where('customer_id', $x->id)->value('id'),  // X ka invoice
            'customer_id' => $y->id,                                        // par refund Y ko
            'return_date' => '2026-06-05',
            'refund_mode' => 'account',
            'items' => [['product_id' => $product->id, 'quantity' => 10, 'unit_price' => 10000]],
        ]);

        $bx = $this->getJson("/api/v1/customers/{$x->id}/history")->assertOk()->json();
        $this->assertSame([], $bx['returns'], "X's history must not list Y's refund.");
        $this->assertSame((int) $x->fresh()->balance, (int) end($bx['ledger'])['running']);
        $this->assertTrue($bx['summary']['reconciled']);

        $by = $this->getJson("/api/v1/customers/{$y->id}/history")->assertOk()->json();
        $this->assertCount(1, $by['returns']);
        $this->assertTrue($by['summary']['reconciled']);
    }

    public function test_history_needs_the_customers_view_permission(): void
    {
        $customer = Customer::create(['name' => 'Gated']);

        $outsider = User::factory()->create();
        $outsider->syncRoles([]);
        Sanctum::actingAs($outsider);

        $this->getJson("/api/v1/customers/{$customer->id}/history")->assertForbidden();
    }
}
