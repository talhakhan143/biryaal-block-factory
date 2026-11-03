<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\FinishedGoodsStock;
use App\Models\JournalEntry;
use App\Models\JournalLine;
use App\Models\Product;
use App\Models\Sale;
use App\Models\User;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Galat likha hua bill theek karna.
 *
 * Sale sab se nazuk cheez hai: aik hi form se block ka stock, customer ka
 * udhaar aur khata, teenon hilte hain. Is liye har test aik hi baat sabit
 * karta hai: edit ke baad teenon theek us jagah hain jahan nayi values kehti
 * hain, invoice number wahi hai, aur khate me sirf aik entry bachi hai.
 */
class SaleEditTest extends TestCase
{
    use RefreshDatabase;

    private Product $product;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([RolePermissionSeeder::class, ChartOfAccountsSeeder::class]);

        $owner = User::factory()->create();
        $owner->assignRole('Owner');
        Sanctum::actingAs($owner);

        $this->product = Product::create([
            'name' => '6 Inch Block',
            'sku' => 'B6',
            'sale_price' => 5000,   // paisa
            'curing_days' => 1,
            'is_active' => true,
        ]);
        FinishedGoodsStock::create([
            'product_id' => $this->product->id,
            'curing_qty' => 0,
            'ready_qty' => 1000,
            'damaged_qty' => 0,
        ]);

        $this->customer = Customer::create(['name' => 'Haji Ashraf']);
    }

    private function ready(): int
    {
        return (int) FinishedGoodsStock::where('product_id', $this->product->id)->value('ready_qty');
    }

    private function net(string $code): int
    {
        $lines = JournalLine::query()->whereHas('account', fn ($q) => $q->where('code', $code));

        return (int) $lines->clone()->sum('debit') - (int) $lines->clone()->sum('credit');
    }

    /** Rs 50 ka block, 100 adad, poora udhaar. */
    private function sell(int $qty = 100, int $paid = 0): Sale
    {
        $id = $this->postJson('/api/v1/sales', [
            'customer_id' => $this->customer->id,
            'sale_date' => '2026-11-03',
            'type' => 'credit',
            'paid' => $paid,
            'items' => [['product_id' => $this->product->id, 'quantity' => $qty]],
        ])->assertSuccessful()->json('data.id');

        return Sale::findOrFail($id);
    }

    private function edit(Sale $sale, array $body)
    {
        return $this->patchJson("/api/v1/sales/{$sale->id}", array_merge([
            'customer_id' => $this->customer->id,
            'sale_date' => '2026-11-03',
            'type' => 'credit',
            'paid' => 0,
            'items' => [['product_id' => $this->product->id, 'quantity' => 100]],
        ], $body));
    }

    public function test_cutting_the_quantity_puts_the_blocks_back_and_lowers_the_udhaar(): void
    {
        // Owner ki asli ghalti yehi thi: "client ne galti se 1500 block add kar diye".
        $sale = $this->sell(100);
        $this->assertSame(900, $this->ready());

        $this->edit($sale, ['items' => [['product_id' => $this->product->id, 'quantity' => 40]]])
            ->assertSuccessful()
            ->assertJsonPath('data.invoice_no', $sale->invoice_no);

        $this->assertSame(960, $this->ready(), '60 block wapas stock me aane chahiye.');
        $this->assertSame(200000, (int) $sale->fresh()->total, '40 x Rs 50.');
        $this->assertSame(200000, (int) $this->customer->fresh()->balance);
        $this->assertSame(200000, $this->net('1100'), 'Receivable sirf naye bill jitna.');
        $this->assertSame(-200000, $this->net('4000'));
    }

    public function test_an_edit_leaves_exactly_one_entry_and_the_books_balanced(): void
    {
        $sale = $this->sell(100);
        $this->edit($sale, ['paid' => 500, 'payment_method' => 'cash'])->assertSuccessful();

        $entries = JournalEntry::where('source_type', $sale->getMorphClass())
            ->where('source_id', $sale->id)
            ->get();
        $this->assertCount(1, $entries, 'Purani entry ka tukda nahi bachna chahiye.');

        $this->assertSame(50000, $this->net('1000'), 'Rs 500 cash aaya.');
        $this->assertSame(450000, $this->net('1100'), 'Baqi udhaar.');
        $this->assertSame((int) JournalLine::sum('debit'), (int) JournalLine::sum('credit'));
        $this->assertSame(1, $sale->fresh()->items()->count());
    }

    public function test_editing_to_the_same_values_changes_nothing(): void
    {
        $sale = $this->sell(100);
        $before = [$this->ready(), (int) $this->customer->fresh()->balance, $this->net('1100'), $this->net('4000')];

        $this->edit($sale, [])->assertSuccessful();

        $after = [$this->ready(), (int) $this->customer->fresh()->balance, $this->net('1100'), $this->net('4000')];
        $this->assertSame($before, $after, 'Bina kuch badle edit karne se kuch hilna nahi chahiye.');
    }

    public function test_moving_the_bill_to_another_customer_moves_the_udhaar_too(): void
    {
        $sale = $this->sell(100);
        $doosra = Customer::create(['name' => 'Malik Traders']);

        $this->edit($sale, ['customer_id' => $doosra->id])->assertSuccessful();

        $this->assertSame(0, (int) $this->customer->fresh()->balance, 'Purane customer se udhaar utar jaye.');
        $this->assertSame(500000, (int) $doosra->fresh()->balance, 'Naye customer par chadh jaye.');
    }

    public function test_a_bill_with_money_received_on_it_cannot_be_edited(): void
    {
        $sale = $this->sell(100);
        $this->postJson("/api/v1/sales/{$sale->id}/receive", [
            'amount' => 100,
            'payment_date' => '2026-11-03',
            'method' => 'cash',
        ])->assertSuccessful();

        $before = [$this->ready(), (int) $this->customer->fresh()->balance];

        $this->edit($sale, ['items' => [['product_id' => $this->product->id, 'quantity' => 10]]])
            ->assertStatus(422);

        $this->assertSame($before, [$this->ready(), (int) $this->customer->fresh()->balance], 'Nakaam edit se kuch nahi hilna chahiye.');
    }

    public function test_an_empty_bill_is_refused(): void
    {
        $sale = $this->sell(100);

        $this->edit($sale, ['items' => []])->assertStatus(422);
        $this->assertSame(900, $this->ready());
    }
}
