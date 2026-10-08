<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\FinishedGoodsStock;
use App\Models\JournalLine;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Sale;
use App\Models\Supplier;
use App\Models\User;
use App\Services\Payments\PaymentService;
use App\Services\Sales\SaleService;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Galat entry wapas lena (rollback).
 *
 * Owner ka sawal yehi tha: "agar entry me galti ho jaye to delete karne se sab
 * kuch pichhle qadam par wapas aana chahiye." Is liye har test aik hi cheez
 * sabit karta hai: rollback ke baad har figure wahi hai jo galti se pehle tha.
 */
class PaymentRollbackTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([RolePermissionSeeder::class, ChartOfAccountsSeeder::class]);

        $owner = User::factory()->create();
        $owner->assignRole('Owner');
        Sanctum::actingAs($owner);

        $this->customer = Customer::create(['name' => 'Haji Sahib']);
    }

    /** Ek poora snapshot: har wo figure jo galti se kharab ho sakta hai. */
    private function snapshot(): array
    {
        return [
            'customer_balance' => (int) $this->customer->fresh()->balance,
            'cash' => $this->net('1000'),
            'receivable' => $this->net('1100'),
            'debit_total' => (int) JournalLine::sum('debit'),
            'credit_total' => (int) JournalLine::sum('credit'),
            'sales' => Sale::orderBy('invoice_no')->get(['invoice_no', 'paid', 'balance', 'status'])->toArray(),
        ];
    }

    private function net(string $code): int
    {
        $lines = JournalLine::query()->whereHas('account', fn ($q) => $q->where('code', $code));

        return (int) $lines->clone()->sum('debit') - (int) $lines->clone()->sum('credit');
    }

    private function readyProduct(int $qty): Product
    {
        $p = Product::create(['name' => 'Block', 'sku' => 'B1', 'sale_price' => 5000, 'curing_days' => 1, 'is_active' => true]);
        FinishedGoodsStock::create(['product_id' => $p->id, 'curing_qty' => 0, 'ready_qty' => $qty, 'damaged_qty' => 0]);

        return $p;
    }

    public function test_rolling_back_an_advance_puts_everything_back(): void
    {
        $before = $this->snapshot();

        $advance = app(PaymentService::class)->advanceFromCustomer($this->customer, [
            'payment_date' => '2026-06-10', 'amount' => 5000000, 'method' => 'cash',
        ]);
        $this->assertSame(-5000000, (int) $this->customer->fresh()->balance, 'Advance jama hona chahiye.');

        $this->deleteJson("/api/v1/payments/{$advance->id}")->assertNoContent();

        $this->assertSame($before, $this->snapshot(), 'Rollback ke baad har figure wahi hona chahiye jo pehle tha.');
        $this->assertSame(0, Payment::count());
    }

    public function test_rolling_back_an_advance_reopens_the_bills_it_had_paid(): void
    {
        $product = $this->readyProduct(100);

        // Pehle udhaar par maal, phir advance jo usay chuka deta hai.
        app(SaleService::class)->create([
            'customer_id' => $this->customer->id, 'sale_date' => '2026-06-10', 'type' => 'credit',
            'paid' => 0, 'items' => [['product_id' => $product->id, 'quantity' => 10]],
        ]);
        $withOpenBill = $this->snapshot();
        $this->assertSame(50000, (int) $this->customer->fresh()->balance);

        $advance = app(PaymentService::class)->advanceFromCustomer($this->customer, [
            'payment_date' => '2026-06-11', 'amount' => 50000, 'method' => 'cash',
        ]);
        $this->assertSame('paid', Sale::first()->status, 'Advance se bill chuk jana chahiye.');

        $this->deleteJson("/api/v1/payments/{$advance->id}")->assertNoContent();

        $this->assertSame($withOpenBill, $this->snapshot(), 'Bill dobara khulna chahiye, bilkul pehle jaisa.');
        $this->assertSame('unpaid', Sale::first()->status);
    }

    public function test_editing_an_advance_moves_every_figure_to_the_new_amount(): void
    {
        $advance = app(PaymentService::class)->advanceFromCustomer($this->customer, [
            'payment_date' => '2026-06-10', 'amount' => 5000000, 'method' => 'cash',
        ]);

        // Jaise poore paanch ki jaga do likhna tha.
        $this->patchJson("/api/v1/payments/{$advance->id}", ['amount' => 20000])
            ->assertOk()
            ->assertJsonPath('data.amount', 2000000)
            ->assertJsonPath('data.reference', $advance->reference);

        $this->assertSame(-2000000, (int) $this->customer->fresh()->balance);
        $this->assertSame(2000000, $this->net('1000'), 'Cash bhi nayi rakam par aana chahiye.');
        $this->assertSame(-2000000, $this->net('1100'));
        $this->assertSame((int) JournalLine::sum('debit'), (int) JournalLine::sum('credit'));
        $this->assertSame(1, Payment::count(), 'Edit se nayi payment nahi banni chahiye.');
    }

    public function test_a_payment_tied_to_one_bill_cannot_be_rolled_back_from_here(): void
    {
        $product = $this->readyProduct(100);
        app(SaleService::class)->create([
            'customer_id' => $this->customer->id, 'sale_date' => '2026-06-10', 'type' => 'credit',
            'paid' => 0, 'items' => [['product_id' => $product->id, 'quantity' => 10]],
        ]);
        $sale = Sale::first();

        $this->postJson("/api/v1/sales/{$sale->id}/receive", [
            'payment_date' => '2026-06-11', 'amount' => 100, 'method' => 'cash',
        ])->assertCreated();

        $payment = Payment::whereNotNull('allocatable_id')->firstOrFail();

        $this->deleteJson("/api/v1/payments/{$payment->id}")->assertStatus(422);
        $this->patchJson("/api/v1/payments/{$payment->id}", ['amount' => 50])->assertStatus(422);
        $this->assertSame(1, Payment::count());
    }

    public function test_rolling_back_money_paid_to_a_supplier_puts_it_back_too(): void
    {
        $supplier = Supplier::create(['name' => 'Chenab Sand']);
        $supplier->forceFill(['balance' => 1000000])->save();
        $before = [
            'balance' => (int) $supplier->fresh()->balance,
            'cash' => $this->net('1000'),
            'payable' => $this->net('2000'),
        ];

        $payment = app(PaymentService::class)->payToSupplier([
            'supplier_id' => $supplier->id, 'payment_date' => '2026-06-10',
            'amount' => 400000, 'method' => 'cash',
        ]);
        $this->assertSame(600000, (int) $supplier->fresh()->balance);

        $this->deleteJson("/api/v1/payments/{$payment->id}")->assertNoContent();

        $this->assertSame($before['balance'], (int) $supplier->fresh()->balance);
        $this->assertSame($before['cash'], $this->net('1000'));
        $this->assertSame($before['payable'], $this->net('2000'));
        $this->assertSame((int) JournalLine::sum('debit'), (int) JournalLine::sum('credit'));
    }

    public function test_the_api_says_which_rows_can_be_rolled_back(): void
    {
        app(PaymentService::class)->advanceFromCustomer($this->customer, [
            'payment_date' => '2026-06-10', 'amount' => 100000, 'method' => 'cash',
        ]);

        $rows = $this->getJson('/api/v1/payments')->assertOk()->json('data');

        $this->assertNotEmpty($rows);
        $this->assertTrue($rows[0]['can_rollback']);
    }
}
