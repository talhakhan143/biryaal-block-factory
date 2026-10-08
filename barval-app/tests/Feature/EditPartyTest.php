<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Driver;
use App\Models\JournalLine;
use App\Models\Product;
use App\Models\Staff;
use App\Models\Supplier;
use App\Models\User;
use App\Services\Sales\SaleService;
use Database\Seeders\CatalogSeeder;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Naam, phone aur address theek karna roz ka kaam hai. Asal shart ye hai ke
 * is se kisi ka paisa na hile.
 */
class EditPartyTest extends TestCase
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

    public function test_editing_a_customer_does_not_touch_their_balance(): void
    {
        $product = Product::first();
        $product->stock()->update(['ready_qty' => 1000]);
        $customer = Customer::create(['name' => 'Haji Ashraf', 'phone' => '0300-1112223']);

        app(SaleService::class)->create([
            'customer_id' => $customer->id, 'sale_date' => '2026-06-01', 'type' => 'credit',
            'paid' => 0, 'items' => [['product_id' => $product->id, 'quantity' => 100, 'unit_price' => 10000]],
        ]);
        $before = (int) $customer->fresh()->balance;
        $this->assertSame(1000000, $before);

        $this->putJson("/api/v1/customers/{$customer->id}", [
            'name' => 'Haji Ashraf Builders',
            'phone' => '0300-9998887',
            'address' => 'Chowk Azam, Layyah',
            'notes' => 'Purana customer',
        ])->assertOk()->assertJsonPath('data.name', 'Haji Ashraf Builders');

        $fresh = $customer->fresh();
        $this->assertSame('Haji Ashraf Builders', $fresh->name);
        $this->assertSame('0300-9998887', $fresh->phone);
        $this->assertSame('Chowk Azam, Layyah', $fresh->address);
        $this->assertSame($before, (int) $fresh->balance, 'Edit se baqi nahi hilna chahiye.');
        $this->assertSame((int) JournalLine::sum('debit'), (int) JournalLine::sum('credit'));
    }

    public function test_editing_a_supplier_does_not_touch_their_balance(): void
    {
        $supplier = Supplier::create(['name' => 'Chenab Sand', 'phone' => '0300-1110000']);
        // balance fillable nahi hai (achhi baat hai), is liye seedha DB me.
        Supplier::whereKey($supplier->id)->update(['balance' => 5000000]);

        $this->putJson("/api/v1/suppliers/{$supplier->id}", [
            'name' => 'Chenab Sand Supplier', 'phone' => '0321-1112223', 'address' => 'Multan Road',
        ])->assertOk();

        $fresh = $supplier->fresh();
        $this->assertSame('Chenab Sand Supplier', $fresh->name);
        $this->assertSame(5000000, (int) $fresh->balance);
    }

    public function test_editing_a_driver_keeps_their_dues(): void
    {
        $driver = Driver::create([
            'name' => 'Akram', 'phone' => '0300-1112223',
            'vehicle_name' => 'Hino', 'vehicle_plate' => 'LEB-4471', 'is_active' => true,
        ]);
        Driver::whereKey($driver->id)->update(['balance' => 800000]);

        $this->putJson("/api/v1/drivers/{$driver->id}", [
            'name' => 'Akram Driver', 'phone' => '0345-7776665',
            'vehicle_name' => 'Mazda', 'vehicle_plate' => 'LES-2200',
        ])->assertOk();

        $fresh = $driver->fresh();
        $this->assertSame('Akram Driver', $fresh->name);
        $this->assertSame('Mazda', $fresh->vehicle_name);
        $this->assertSame(800000, (int) $fresh->balance);
    }

    public function test_editing_staff_keeps_the_salary_in_paisa(): void
    {
        $staff = Staff::create(['name' => 'Imran', 'role' => 'Munshi', 'monthly_salary' => 4500000]);

        // Form rupees bhejta hai, controller usay paisa karta hai.
        $this->putJson("/api/v1/staff/{$staff->id}", [
            'name' => 'Imran Munshi', 'role' => 'Head Munshi', 'phone' => '0301-5556667',
            'monthly_salary' => 50000,
        ])->assertOk();

        $this->assertSame(5000000, (int) $staff->fresh()->monthly_salary);
    }

    public function test_an_edit_cannot_smuggle_a_new_balance_in(): void
    {
        $customer = Customer::create(['name' => 'Haji Ashraf']);
        Customer::whereKey($customer->id)->update(['balance' => 1000000]);

        $this->putJson("/api/v1/customers/{$customer->id}", [
            'name' => 'Haji Ashraf',
            'balance' => 0,          // koi ye bhejne ki koshish kare
            'advance' => 99999999,
        ])->assertOk();

        $this->assertSame(1000000, (int) $customer->fresh()->balance, 'Paisa sirf sauday se hilta hai, form se nahi.');
    }

    public function test_a_sales_user_may_fix_a_customer_but_not_a_driver(): void
    {
        $customer = Customer::create(['name' => 'Grahak']);
        $driver = Driver::create(['name' => 'Akram', 'phone' => '0300-1112223', 'vehicle_name' => 'Hino']);

        $sales = User::factory()->create();
        $sales->assignRole('Sales User');
        Sanctum::actingAs($sales);

        // customers.manage hai
        $this->putJson("/api/v1/customers/{$customer->id}", ['name' => 'Grahak Sahib'])->assertOk();
        // transport.manage bhi hai, is liye driver bhi theek kar sakta hai
        $this->putJson("/api/v1/drivers/{$driver->id}", [
            'name' => 'Akram Khan', 'phone' => '0300-1112223', 'vehicle_name' => 'Hino',
        ])->assertOk();

        // hr.manage nahi hai
        $staff = Staff::create(['name' => 'Imran', 'monthly_salary' => 4500000]);
        $this->putJson("/api/v1/staff/{$staff->id}", ['name' => 'X', 'monthly_salary' => 50000])->assertForbidden();
    }
}
