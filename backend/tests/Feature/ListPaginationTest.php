<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Customer;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Supplier;
use App\Models\User;
use App\Services\Accounting\LedgerService;
use Database\Seeders\CatalogSeeder;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Har list page by page aani chahiye, search chalni chahiye, aur jo filter
 * pehle se lagte thay wo na toote. Cash book ka balance page badalne par bhi
 * sahi jagah se shuru hona chahiye.
 */
class ListPaginationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([RolePermissionSeeder::class, ChartOfAccountsSeeder::class]);

        $user = User::factory()->create();
        $user->assignRole('Owner');
        Sanctum::actingAs($user);
    }

    public function test_cash_book_pages_carry_the_running_balance_forward(): void
    {
        $ledger = app(LedgerService::class);
        for ($i = 1; $i <= 7; $i++) {
            $ledger->post('2026-03-0'.$i, 'Receipt number '.$i, [
                ['account' => Account::CASH, 'debit' => 10000],
                ['account' => Account::SALES, 'credit' => 10000],
            ]);
        }

        $first = $this->getJson('/api/v1/cash-book?per_page=3')->assertOk()->json();
        $this->assertSame(7, $first['meta']['total']);
        $this->assertSame(3, $first['meta']['last_page']);
        $this->assertCount(3, $first['rows']);
        $this->assertSame(0, $first['page_opening']);
        $this->assertSame(30000, $first['rows'][2]['balance']);
        $this->assertTrue($first['running_balance_exact']);

        $second = $this->getJson('/api/v1/cash-book?per_page=3&page=2')->assertOk()->json();
        $this->assertSame(30000, $second['page_opening']);
        $this->assertSame(40000, $second['rows'][0]['balance']);

        $last = $this->getJson('/api/v1/cash-book?per_page=3&page=3')->assertOk()->json();
        $this->assertSame(70000, $last['rows'][0]['balance']);
        $this->assertSame(70000, $last['closing']);
        $this->assertSame(70000, $last['total_in']);
    }

    public function test_cash_book_search_narrows_rows_and_flags_the_balance(): void
    {
        $ledger = app(LedgerService::class);
        $ledger->post('2026-03-01', 'Receipt se paisa aaya', [
            ['account' => Account::CASH, 'debit' => 10000],
            ['account' => Account::SALES, 'credit' => 10000],
        ]);
        $ledger->post('2026-03-02', 'Diesel ka kharcha', [
            ['account' => Account::EXPENSE, 'debit' => 4000],
            ['account' => Account::CASH, 'credit' => 4000],
        ]);

        $hit = $this->getJson('/api/v1/cash-book?search=Diesel')->assertOk()->json();
        $this->assertSame(1, $hit['meta']['total']);
        $this->assertSame(4000, $hit['total_out']);
        $this->assertFalse($hit['running_balance_exact']);

        // LIKE ke wildcards aam harf hain, warna "%" poori list khol deta
        $this->assertSame(0, $this->getJson('/api/v1/cash-book?search=%25')->assertOk()->json('meta.total'));
    }

    public function test_payments_search_finds_the_party_name_without_dropping_filters(): void
    {
        $customer = Customer::create(['name' => 'Haji Ashraf Builders']);
        $supplier = Supplier::create(['name' => 'Chenab Sand Supplier']);

        Payment::create([
            'reference' => 'PAY-000001', 'direction' => Payment::RECEIPT,
            'party_type' => Customer::class, 'party_id' => $customer->id,
            'payment_date' => '2026-03-01', 'amount' => 50000, 'method' => 'cash',
        ]);
        Payment::create([
            'reference' => 'PAY-000002', 'direction' => Payment::PAYMENT,
            'party_type' => Supplier::class, 'party_id' => $supplier->id,
            'payment_date' => '2026-03-02', 'amount' => 70000, 'method' => 'cash',
        ]);

        $byParty = $this->getJson('/api/v1/payments?search=Haji')->assertOk()->json();
        $this->assertSame(1, $byParty['meta']['total']);
        $this->assertSame('PAY-000001', $byParty['data'][0]['reference']);

        // search aur direction dono lagne chahiye, ya nahi
        $this->assertSame(0, $this->getJson('/api/v1/payments?search=Haji&direction=payment')
            ->assertOk()->json('meta.total'));
        $this->assertSame(1, $this->getJson('/api/v1/payments?search=Chenab&direction=payment')
            ->assertOk()->json('meta.total'));
        $this->assertSame(1, $this->getJson('/api/v1/payments?from=2026-03-02')
            ->assertOk()->json('meta.total'));
    }

    public function test_finished_goods_pages_but_totals_stay_whole(): void
    {
        $this->seed(CatalogSeeder::class);
        $all = Product::where('is_active', true)->count();
        $this->assertGreaterThan(1, $all);

        $page = $this->getJson('/api/v1/finished-goods?per_page=1')->assertOk()->json();
        $this->assertCount(1, $page['data']);
        $this->assertSame($all, $page['meta']['total']);
        $this->assertArrayHasKey('ready_qty', $page['totals']);

        $second = $this->getJson('/api/v1/finished-goods?per_page=1&page=2')->assertOk()->json();
        $this->assertNotSame($page['data'][0]['id'], $second['data'][0]['id']);
        $this->assertSame($page['totals'], $second['totals']);
    }
}
