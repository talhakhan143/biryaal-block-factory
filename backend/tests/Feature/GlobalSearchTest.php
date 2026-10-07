<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Staff;
use App\Models\Supplier;
use App\Models\User;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Aik dabba, poora system. Jo cheez kisi user ko nazar nahi aani chahiye, wo
 * search se bhi nahi milni chahiye.
 */
class GlobalSearchTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([RolePermissionSeeder::class, ChartOfAccountsSeeder::class]);

        Customer::create(['name' => 'Haji Ashraf Builders', 'phone' => '0300-4455661']);
        Supplier::create(['name' => 'Chenab Sand Supplier', 'phone' => '0300-1110000']);
        Staff::create(['name' => 'Imran Munshi', 'role' => 'Munshi', 'phone' => '0301-5556667', 'monthly_salary' => 4500000]);
    }

    private function actAs(string $role): User
    {
        $user = User::factory()->create();
        $user->assignRole($role);
        Sanctum::actingAs($user);

        return $user;
    }

    private function groupKeys(string $q): array
    {
        return array_column($this->getJson('/api/v1/search?q='.urlencode($q))->assertOk()->json('groups'), 'key');
    }

    public function test_it_finds_things_by_name_and_by_phone(): void
    {
        $this->actAs('Owner');

        $byName = $this->getJson('/api/v1/search?q=Haji')->assertOk()->json();
        $this->assertContains('customers', array_column($byName['groups'], 'key'));
        $this->assertSame('Haji Ashraf Builders', $byName['groups'][0]['items'][0]['title']);

        $byPhone = $this->getJson('/api/v1/search?q=4455661')->assertOk()->json();
        $this->assertSame(1, $byPhone['total']);
    }

    public function test_a_result_carries_the_page_to_open(): void
    {
        $this->actAs('Owner');
        $customer = Customer::first();

        $hit = $this->getJson('/api/v1/search?q=Haji')->assertOk()->json('groups.0.items.0');

        $this->assertSame("/customers/{$customer->id}", $hit['to']);
    }

    public function test_one_letter_searches_nothing(): void
    {
        // Warna har harf par poora database scan hota hai.
        $this->actAs('Owner');

        $this->getJson('/api/v1/search?q=H')->assertOk()
            ->assertJsonPath('groups', [])
            ->assertJsonPath('total', 0);
    }

    public function test_a_sales_user_cannot_find_staff_salaries(): void
    {
        // Sales User ke paas hr.view nahi hai, is liye Staff ka page bhi band
        // hai. Search us deewar me surakh nahi bana sakti.
        $this->actAs('Sales User');
        $keys = $this->groupKeys('Imran');

        $this->assertNotContains('staff', $keys);
        $this->assertSame(0, $this->getJson('/api/v1/search?q=Imran')->json('total'));
    }

    public function test_an_owner_can_find_staff(): void
    {
        $this->actAs('Owner');

        $this->assertContains('staff', $this->groupKeys('Imran'));
    }

    public function test_a_user_with_no_roles_gets_nothing(): void
    {
        $outsider = User::factory()->create();
        $outsider->syncRoles([]);
        Sanctum::actingAs($outsider);

        $this->getJson('/api/v1/search?q=Haji')->assertOk()
            ->assertJsonPath('groups', [])
            ->assertJsonPath('total', 0);
    }

    public function test_search_needs_a_login(): void
    {
        $this->getJson('/api/v1/search?q=Haji')->assertUnauthorized();
    }
}
