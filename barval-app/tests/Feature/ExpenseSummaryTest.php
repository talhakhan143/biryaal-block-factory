<?php

namespace Tests\Feature;

use App\Models\Labourer;
use App\Models\User;
use App\Services\Expenses\ExpenseService;
use App\Services\Labour\LabourService;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The Expenses page lists one table, but the factory's real cost also includes
 * labour wages and salaries, which only exist in the ledger. These cover the
 * summary endpoint that closes that gap.
 */
class ExpenseSummaryTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([RolePermissionSeeder::class, ChartOfAccountsSeeder::class]);

        $this->owner = User::factory()->create();
        $this->owner->assignRole('Owner');
        Sanctum::actingAs($this->owner);
    }

    private function seedCosts(): void
    {
        app(ExpenseService::class)->record([
            'expense_date' => '2026-06-10', 'category' => 'diesel',
            'title' => 'Generator diesel', 'amount' => 1200000, 'method' => 'cash',
        ]);
        app(ExpenseService::class)->record([
            'expense_date' => '2026-06-20', 'category' => 'electricity',
            'title' => 'WAPDA bill', 'amount' => 4800000, 'method' => 'cash',
        ]);
        // Labour wage hits 5000 Operating Expenses but never the expenses table.
        $labourer = Labourer::create(['name' => 'Rafiq', 'daily_wage' => 180000, 'is_active' => true]);
        app(LabourService::class)->markAttendance([
            'labourer_id' => $labourer->id, 'work_date' => '2026-06-10', 'status' => 'present',
        ]);
    }

    public function test_direct_total_follows_the_same_filter_as_the_list(): void
    {
        $this->seedCosts();

        $all = $this->getJson('/api/v1/expenses/summary')->assertOk();
        $this->assertSame(6000000, $all->json('direct.total'));
        $this->assertSame(2, $all->json('direct.entries'));

        $oneDay = $this->getJson('/api/v1/expenses/summary?from=2026-06-10&to=2026-06-10')->assertOk();
        $this->assertSame(1200000, $oneDay->json('direct.total'));
        $this->assertSame(1, $oneDay->json('direct.entries'));

        // And it agrees with what the list itself returns for that filter.
        $listed = $this->getJson('/api/v1/expenses?from=2026-06-10&to=2026-06-10')->assertOk()->json('data');
        $this->assertSame(1200000, array_sum(array_column($listed, 'amount')));
    }

    public function test_costs_outside_the_expenses_table_are_reported_separately(): void
    {
        $this->seedCosts();

        $body = $this->getJson('/api/v1/expenses/summary')->assertOk()->json();

        $this->assertTrue($body['other_available']);
        $this->assertSame(180000, $body['other_total'], 'The labour wage must be surfaced.');
        $this->assertSame(['Attendance'], array_column($body['other'], 'key'));
        $this->assertSame(6180000, $body['grand_total']);
        // The expenses table itself must not be double-counted into "other".
        $this->assertNotContains('Expense', array_column($body['other'], 'key'));
    }

    public function test_other_costs_are_hidden_when_a_narrowing_filter_is_on(): void
    {
        $this->seedCosts();

        // Category/search cannot be applied to salaries or wages, so showing
        // them next to a narrowed list would misstate the total.
        $body = $this->getJson('/api/v1/expenses/summary?category=diesel')->assertOk()->json();

        $this->assertFalse($body['other_available']);
        $this->assertSame([], $body['other']);
        $this->assertSame(1200000, $body['direct']['total']);
        $this->assertSame(1200000, $body['grand_total']);
    }

    public function test_sales_user_sees_its_own_expenses_but_not_salaries_or_wages(): void
    {
        $this->seedCosts();

        $sales = User::factory()->create();
        $sales->assignRole('Sales User');
        Sanctum::actingAs($sales);

        $body = $this->getJson('/api/v1/expenses/summary')->assertOk()->json();

        $this->assertSame(6000000, $body['direct']['total']);
        $this->assertFalse($body['other_available']);
        $this->assertSame([], $body['other']);
        $this->assertSame(0, $body['other_total']);
    }

    public function test_summary_route_is_not_swallowed_by_the_show_route(): void
    {
        // `expenses/summary` must be matched before `expenses/{expense}`.
        $this->getJson('/api/v1/expenses/summary')->assertOk()->assertJsonStructure(['direct', 'other', 'grand_total']);
    }
}
