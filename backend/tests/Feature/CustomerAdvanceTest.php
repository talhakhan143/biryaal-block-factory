<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\JournalLine;
use App\Models\Product;
use App\Models\Sale;
use App\Models\User;
use App\Services\Payments\PaymentService;
use App\Services\Sales\SaleService;
use Database\Seeders\CatalogSeeder;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Advance from a customer: paisa pehle, maal baad me. The money sits as a
 * credit on the receivable control account and every later sale eats into it.
 */
class CustomerAdvanceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([RolePermissionSeeder::class, ChartOfAccountsSeeder::class, CatalogSeeder::class]);

        $owner = User::factory()->create();
        $owner->assignRole('Owner');
        Sanctum::actingAs($owner);
    }

    private function readyProduct(int $qty = 5000): Product
    {
        $product = Product::first();
        $product->stock()->update(['ready_qty' => $qty]);

        return $product->fresh('stock');
    }

    private function sell(Customer $customer, Product $product, int $qty, int $cash = 0): Sale
    {
        return app(SaleService::class)->create([
            'customer_id' => $customer->id,
            'sale_date' => '2026-06-10',
            'type' => 'credit',
            'paid' => $cash,
            'items' => [['product_id' => $product->id, 'quantity' => $qty, 'unit_price' => 10000]],
        ]);
    }

    public function test_taking_an_advance_puts_the_customer_in_credit(): void
    {
        $customer = Customer::create(['name' => 'Haji Ashraf']);

        $this->postJson("/api/v1/customers/{$customer->id}/advance", [
            'payment_date' => '2026-06-01',
            'amount' => 100000,            // rupees from the form
            'method' => 'cash',
        ])->assertCreated()
            ->assertJsonPath('data.reference', 'ADV-000001')
            ->assertJsonPath('customer.balance', -10000000)
            ->assertJsonPath('customer.advance', 10000000);

        $this->assertSame(-10000000, (int) $customer->fresh()->balance);
        $this->assertSame((int) JournalLine::sum('debit'), (int) JournalLine::sum('credit'));
    }

    public function test_a_later_sale_is_paid_out_of_the_advance(): void
    {
        $product = $this->readyProduct();
        $customer = Customer::create(['name' => 'Haji Ashraf']);

        app(PaymentService::class)->advanceFromCustomer($customer, [
            'payment_date' => '2026-06-01', 'amount' => 10000000, 'method' => 'cash',
        ]);

        // Rs 30,000 of blocks, nothing handed over at the till.
        $sale = $this->sell($customer, $product, 300);

        $this->assertSame(3000000, (int) $sale->total);
        $this->assertSame(3000000, (int) $sale->paid, 'Advance should settle the invoice.');
        $this->assertSame(0, (int) $sale->balance);
        $this->assertSame('paid', $sale->status);
        $this->assertSame(-7000000, (int) $customer->fresh()->balance, 'Rs 70,000 advance left.');
        $this->assertSame((int) JournalLine::sum('debit'), (int) JournalLine::sum('credit'));
    }

    public function test_a_sale_bigger_than_the_advance_leaves_the_rest_as_udhaar(): void
    {
        $product = $this->readyProduct();
        $customer = Customer::create(['name' => 'Malik Traders']);

        app(PaymentService::class)->advanceFromCustomer($customer, [
            'payment_date' => '2026-06-01', 'amount' => 1000000, 'method' => 'cash',
        ]);

        // Rs 30,000 of blocks against a Rs 10,000 advance.
        $sale = $this->sell($customer, $product, 300);

        $this->assertSame(1000000, (int) $sale->paid);
        $this->assertSame(2000000, (int) $sale->balance);
        $this->assertSame('partial', $sale->status);
        $this->assertSame(2000000, (int) $customer->fresh()->balance, 'Advance khatam, baqi udhaar.');
    }

    public function test_cash_at_the_till_is_used_before_the_advance(): void
    {
        $product = $this->readyProduct();
        $customer = Customer::create(['name' => 'Noor Builders']);

        app(PaymentService::class)->advanceFromCustomer($customer, [
            'payment_date' => '2026-06-01', 'amount' => 10000000, 'method' => 'cash',
        ]);

        // Rs 30,000 sale with Rs 5,000 handed over now.
        $sale = $this->sell($customer, $product, 300, 500000);

        $this->assertSame(3000000, (int) $sale->paid);
        $this->assertSame(0, (int) $sale->balance);
        // Only Rs 25,000 came out of the advance, not the whole invoice.
        $this->assertSame(-7500000, (int) $customer->fresh()->balance);
    }

    public function test_the_statement_shows_the_advance_and_still_reconciles(): void
    {
        $product = $this->readyProduct();
        $customer = Customer::create(['name' => 'Haji Ashraf']);

        app(PaymentService::class)->advanceFromCustomer($customer, [
            'payment_date' => '2026-06-01', 'amount' => 10000000, 'method' => 'cash',
        ]);
        $this->sell($customer, $product, 300);

        $body = $this->getJson("/api/v1/customers/{$customer->id}/history")->assertOk()->json();

        $this->assertSame(['receipt', 'sale'], array_column($body['ledger'], 'type'));
        $this->assertSame('ADV-000001', $body['ledger'][0]['reference']);
        $this->assertSame((int) $customer->fresh()->balance, (int) end($body['ledger'])['running']);
        $this->assertTrue($body['summary']['reconciled']);
        // The advance is real money in, so it counts as received.
        $this->assertSame(10000000, $body['summary']['factory']['received']);
    }

    public function test_voiding_an_advance_paid_sale_gives_the_advance_back(): void
    {
        $product = $this->readyProduct();
        $customer = Customer::create(['name' => 'Haji Ashraf']);

        app(PaymentService::class)->advanceFromCustomer($customer, [
            'payment_date' => '2026-06-01', 'amount' => 10000000, 'method' => 'cash',
        ]);
        $sale = $this->sell($customer, $product, 300);
        $this->assertSame(-7000000, (int) $customer->fresh()->balance);

        app(SaleService::class)->void($sale);

        $this->assertSame(-10000000, (int) $customer->fresh()->balance, 'Poora advance wapas.');
        $this->assertSame((int) JournalLine::sum('debit'), (int) JournalLine::sum('credit'));
    }

    public function test_an_ordinary_credit_sale_is_unchanged_when_there_is_no_advance(): void
    {
        $product = $this->readyProduct();
        $customer = Customer::create(['name' => 'Sadiq Bhai']);

        $sale = $this->sell($customer, $product, 300, 500000);

        $this->assertSame(500000, (int) $sale->paid);
        $this->assertSame(2500000, (int) $sale->balance);
        $this->assertSame(2500000, (int) $customer->fresh()->balance);
    }

    public function test_an_advance_taken_while_a_bill_is_open_lands_on_that_bill(): void
    {
        $product = $this->readyProduct();
        $customer = Customer::create(['name' => 'Haji Ashraf']);

        // Bill pehle, advance baad me.
        $sale = $this->sell($customer, $product, 300);
        $this->assertSame(3000000, (int) $sale->balance);

        app(PaymentService::class)->advanceFromCustomer($customer, [
            'payment_date' => '2026-06-11', 'amount' => 10000000, 'method' => 'cash',
        ]);

        $sale->refresh();
        $this->assertSame(3000000, (int) $sale->paid, 'Khula bill advance se chukna chahiye.');
        $this->assertSame(0, (int) $sale->balance);
        $this->assertSame('paid', $sale->status);
        $this->assertSame(-7000000, (int) $customer->fresh()->balance);
        // Invariant: sum(paid) == sum(total) - max(balance, 0)
        $this->assertSame(3000000, (int) Sale::where('customer_id', $customer->id)->sum('paid'));
    }

    public function test_voiding_a_sale_resyncs_the_other_bills(): void
    {
        $product = $this->readyProduct();
        $customer = Customer::create(['name' => 'Haji Ashraf']);

        app(PaymentService::class)->advanceFromCustomer($customer, [
            'payment_date' => '2026-06-01', 'amount' => 3000000, 'method' => 'cash',
        ]);
        $first = $this->sell($customer, $product, 200);   // Rs 20,000, advance se
        $second = $this->sell($customer, $product, 200);  // Rs 20,000, Rs 10,000 advance + Rs 10,000 udhaar
        $this->assertSame(1000000, (int) $second->fresh()->balance);

        app(SaleService::class)->void($first);

        // Freed advance must land on the bill that is still open.
        $second->refresh();
        $this->assertSame(2000000, (int) $second->paid);
        $this->assertSame(0, (int) $second->balance);
        $this->assertSame('paid', $second->status);
        $this->assertSame(-1000000, (int) $customer->fresh()->balance, 'Rs 10,000 advance bacha.');
    }

    public function test_an_invoice_that_was_paid_by_a_receipt_cannot_be_deleted(): void
    {
        $product = $this->readyProduct();
        $customer = Customer::create(['name' => 'Malik Traders']);
        $sale = $this->sell($customer, $product, 200);

        app(PaymentService::class)->receiveFromCustomer([
            'customer_id' => $customer->id, 'payment_date' => '2026-06-11',
            'amount' => 2000000, 'method' => 'cash',
        ]);

        $this->expectExceptionMessage('pehle wo payment reverse karein');
        app(SaleService::class)->void($sale->fresh());
    }

    public function test_an_advance_settled_invoice_does_not_claim_cash_was_received(): void
    {
        $product = $this->readyProduct();
        $customer = Customer::create(['name' => 'Haji Ashraf']);
        app(PaymentService::class)->advanceFromCustomer($customer, [
            'payment_date' => '2026-06-01', 'amount' => 10000000, 'method' => 'cash',
        ]);

        $sale = $this->sell($customer, $product, 300);

        $this->assertNull($sale->payment_method, 'Counter par cash aaya hi nahi tha.');
    }

    public function test_cash_above_the_bill_is_refused_instead_of_being_swallowed(): void
    {
        $product = $this->readyProduct();
        $customer = Customer::create(['name' => 'Sadiq Bhai']);

        $this->expectExceptionMessage('Advance jama karein');
        $this->sell($customer, $product, 100, 9999999);   // bill Rs 10,000, cash Rs 99,999
    }

    public function test_a_zero_bill_is_refused_in_plain_language(): void
    {
        $product = $this->readyProduct();
        $customer = Customer::create(['name' => 'Sadiq Bhai']);

        $this->expectExceptionMessage('Bill ka total sifar hai');
        app(SaleService::class)->create([
            'customer_id' => $customer->id, 'sale_date' => '2026-06-10', 'type' => 'credit',
            'paid' => 0, 'discount' => 1000000,
            'items' => [['product_id' => $product->id, 'quantity' => 100, 'unit_price' => 10000]],
        ]);
    }

    public function test_a_customer_holding_an_advance_cannot_be_deleted(): void
    {
        $customer = Customer::create(['name' => 'Haji Ashraf']);
        app(PaymentService::class)->advanceFromCustomer($customer, [
            'payment_date' => '2026-06-01', 'amount' => 10000000, 'method' => 'cash',
        ]);

        $this->deleteJson("/api/v1/customers/{$customer->id}")
            ->assertStatus(422)
            ->assertJsonFragment(['customer' => ['Is customer ka Rs 100,000.00 advance hamare paas jama hai. Pehle wo adjust ya wapas karein, phir delete.']]);

        $this->assertNotNull(Customer::find($customer->id));
    }

    public function test_advance_needs_the_payments_receive_permission(): void
    {
        $customer = Customer::create(['name' => 'Gated']);

        $outsider = User::factory()->create();
        $outsider->syncRoles([]);
        Sanctum::actingAs($outsider);

        $this->postJson("/api/v1/customers/{$customer->id}/advance", [
            'payment_date' => '2026-06-01', 'amount' => 1000,
        ])->assertForbidden();
    }
}
