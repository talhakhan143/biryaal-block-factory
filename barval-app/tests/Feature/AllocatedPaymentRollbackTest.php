<?php

namespace Tests\Feature;

use App\Models\Driver;
use App\Models\JournalLine;
use App\Models\MaterialPurchase;
use App\Models\Payment;
use App\Models\RawMaterial;
use App\Models\Salary;
use App\Models\Staff;
use App\Models\Supplier;
use App\Models\TransportTrip;
use App\Models\User;
use App\Services\Payroll\PayrollService;
use App\Services\Purchasing\PurchaseService;
use App\Services\Transport\TransportService;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Kisi aik bill se judi payment theek karna aur wapas lena.
 *
 * Owner ne payments ka naam sab se pehle liya tha, aur aksar galti usi paise me
 * hoti hai jo kisi aik bill par likha jata hai: khareed ki adaigi, driver ka
 * kiraya, staff ki tankhwa. Har test aik hi baat sabit karta hai: rollback ke
 * baad khata, banda aur us bill ka apna hisaab, teenon wahin wapas hain jahan
 * payment se pehle the. Sale wala yehi kaam PaymentRollbackTest me hai, kyunki
 * wahan customer ka allocator bhi beech me aata hai.
 */
class AllocatedPaymentRollbackTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([RolePermissionSeeder::class, ChartOfAccountsSeeder::class]);

        $boss = User::factory()->create();
        $boss->assignRole('Super Admin');
        Sanctum::actingAs($boss);
    }

    private function net(string $code): int
    {
        $lines = JournalLine::query()->whereHas('account', fn ($q) => $q->where('code', $code));

        return (int) $lines->clone()->sum('debit') - (int) $lines->clone()->sum('credit');
    }

    /** Khate ka poora chehra: cash, dono control account aur dono taraf ka total. */
    private function books(): array
    {
        return [
            'cash' => $this->net('1000'),
            'receivable' => $this->net('1100'),
            'payable' => $this->net('2000'),
            'debit_total' => (int) JournalLine::sum('debit'),
            'credit_total' => (int) JournalLine::sum('credit'),
        ];
    }

    public function test_money_paid_against_one_purchase_bill_can_be_fixed_and_rolled_back(): void
    {
        $supplier = Supplier::create(['name' => 'Chenab Sand']);
        $material = RawMaterial::create(['name' => 'Raiti', 'unit' => 'cft', 'is_active' => true]);

        // Rs 5,000 ka maal, poora udhaar.
        $purchase = app(PurchaseService::class)->record([
            'supplier_id' => $supplier->id,
            'raw_material_id' => $material->id,
            'purchase_date' => '2026-06-10',
            'quantity' => 100,
            'unit_cost' => 5000,
        ]);

        $snap = fn () => $this->books() + [
            'supplier_balance' => (int) $supplier->fresh()->balance,
            'bill' => MaterialPurchase::findOrFail($purchase->id)->only(['paid_amount', 'payment_status']),
        ];

        $before = $snap();
        $this->assertSame(500000, $before['supplier_balance']);

        $this->postJson("/api/v1/purchases/{$purchase->id}/pay", [
            'payment_date' => '2026-06-11', 'amount' => 1000, 'method' => 'cash',
        ])->assertCreated();

        $payment = Payment::whereNotNull('allocatable_id')->firstOrFail();
        $this->assertSame(100000, (int) MaterialPurchase::findOrFail($purchase->id)->paid_amount);
        $this->assertSame(400000, (int) $supplier->fresh()->balance);

        // Jaise hazaar ki jaga do hazaar likhna tha.
        $this->patchJson("/api/v1/payments/{$payment->id}", ['amount' => 2000])
            ->assertOk()
            ->assertJsonPath('data.amount', 200000)
            ->assertJsonPath('data.reference', $payment->reference);

        $this->assertSame(200000, (int) MaterialPurchase::findOrFail($purchase->id)->paid_amount);
        $this->assertSame('partial', MaterialPurchase::findOrFail($purchase->id)->payment_status);
        $this->assertSame(300000, (int) $supplier->fresh()->balance);
        // Cash me se poore do hazaar nikle, purani hazaar wali entry nahi bachi.
        $this->assertSame($before['cash'] - 200000, $this->net('1000'));
        $this->assertSame((int) JournalLine::sum('debit'), (int) JournalLine::sum('credit'));

        // Bill se zyada nahi likha ja sakta.
        $this->patchJson("/api/v1/payments/{$payment->id}", ['amount' => 9000])->assertStatus(422);
        $this->assertSame(200000, (int) MaterialPurchase::findOrFail($purchase->id)->paid_amount);

        $this->deleteJson("/api/v1/payments/{$payment->id}")->assertNoContent();

        $this->assertSame($before, $snap(), 'Rollback ke baad khata aur bill dono pehle jaise hone chahiye.');
        $this->assertSame(0, Payment::count());
    }

    public function test_a_drivers_trip_payment_can_be_fixed_and_rolled_back(): void
    {
        $driver = Driver::create(['name' => 'Akram', 'is_active' => true]);

        // Rs 3,000 ka kiraya, abhi kuch nahi diya.
        $trip = app(TransportService::class)->recordTrip([
            'driver_id' => $driver->id,
            'kind' => TransportTrip::INBOUND,
            'trip_date' => '2026-06-10',
            'rate' => 300000,
            'paid' => 0,
        ]);

        $snap = fn () => $this->books() + [
            'driver_balance' => (int) $driver->fresh()->balance,
            'bill' => TransportTrip::findOrFail($trip->id)->only(['paid', 'balance', 'status']),
        ];

        $before = $snap();
        $this->assertSame(300000, $before['driver_balance']);

        $this->postJson("/api/v1/transport-trips/{$trip->id}/pay", [
            'payment_date' => '2026-06-11', 'amount' => 1000, 'method' => 'cash',
        ])->assertCreated();

        $payment = Payment::whereNotNull('allocatable_id')->firstOrFail();
        $this->assertSame(200000, (int) $driver->fresh()->balance);

        $this->patchJson("/api/v1/payments/{$payment->id}", ['amount' => 1500])->assertOk();
        $this->assertSame(150000, (int) TransportTrip::findOrFail($trip->id)->paid);
        $this->assertSame(150000, (int) TransportTrip::findOrFail($trip->id)->balance);
        $this->assertSame(150000, (int) $driver->fresh()->balance);

        $this->patchJson("/api/v1/payments/{$payment->id}", ['amount' => 5000])->assertStatus(422);

        $this->deleteJson("/api/v1/payments/{$payment->id}")->assertNoContent();

        $this->assertSame($before, $snap(), 'Kiraya wapas poora baqi hona chahiye.');
        $this->assertSame('unpaid', TransportTrip::findOrFail($trip->id)->status);
        $this->assertSame(0, Payment::count());
    }

    public function test_a_staff_salary_payment_can_be_fixed_and_rolled_back(): void
    {
        $staff = Staff::create(['name' => 'Munshi Sahib', 'monthly_salary' => 2000000, 'is_active' => true]);

        $salary = app(PayrollService::class)->generate(['staff_id' => $staff->id, 'month' => '2026-06']);

        // Tankhwa ka baqi staff ke khate par nahi, isi row par likha hota hai,
        // is liye rollback par staff ko kuch wapas nahi chadhana.
        $this->assertFalse(Schema::hasColumn('staff', 'balance'));

        $snap = fn () => $this->books() + [
            'bill' => Salary::findOrFail($salary->id)->only(['paid', 'balance', 'status']),
        ];

        $before = $snap();
        $this->assertSame(2000000, (int) Salary::findOrFail($salary->id)->balance);

        $this->postJson("/api/v1/salaries/{$salary->id}/pay", [
            'payment_date' => '2026-06-30', 'amount' => 5000, 'method' => 'cash',
        ])->assertCreated();

        $payment = Payment::whereNotNull('allocatable_id')->firstOrFail();
        $this->assertSame(500000, (int) Salary::findOrFail($salary->id)->paid);

        $this->patchJson("/api/v1/payments/{$payment->id}", ['amount' => 8000])->assertOk();
        $this->assertSame(800000, (int) Salary::findOrFail($salary->id)->paid);
        $this->assertSame(1200000, (int) Salary::findOrFail($salary->id)->balance);
        $this->assertSame('partial', Salary::findOrFail($salary->id)->status);

        // Poori tankhwa se zyada nahi.
        $this->patchJson("/api/v1/payments/{$payment->id}", ['amount' => 25000])->assertStatus(422);

        $this->deleteJson("/api/v1/payments/{$payment->id}")->assertNoContent();

        $this->assertSame($before, $snap(), 'Tankhwa dobara poori baqi hone chahiye.');
        $this->assertSame('unpaid', Salary::findOrFail($salary->id)->status);
        $this->assertSame(0, Payment::count());
    }

    public function test_the_api_and_the_ui_agree_on_which_bill_payments_can_be_touched(): void
    {
        $staff = Staff::create(['name' => 'Munshi Sahib', 'monthly_salary' => 1000000, 'is_active' => true]);
        $salary = app(PayrollService::class)->generate(['staff_id' => $staff->id, 'month' => '2026-07']);

        $this->postJson("/api/v1/salaries/{$salary->id}/pay", [
            'payment_date' => '2026-07-31', 'amount' => 2000, 'method' => 'cash',
        ])->assertCreated();
        $payment = Payment::whereNotNull('allocatable_id')->firstOrFail();

        $row = $this->getJson('/api/v1/payments')->assertOk()->json('data.0');
        $this->assertTrue($row['can_rollback'], 'Bill se judi payment bhi yahin se theek honi chahiye.');
        $this->assertNull($row['rollback_block']);

        // Jis bill ka paisa tha wo bill hi ghayab ho jaye to API aur UI dono ko
        // aik hi jawab dena chahiye: yahan se kuch nahi hota.
        Salary::whereKey($salary->id)->delete();

        $row = $this->getJson('/api/v1/payments')->assertOk()->json('data.0');
        $this->assertFalse($row['can_rollback']);
        $this->assertNotNull($row['rollback_block']);

        $this->deleteJson("/api/v1/payments/{$payment->id}")->assertStatus(422);
        $this->patchJson("/api/v1/payments/{$payment->id}", ['amount' => 100])->assertStatus(422);
        $this->assertSame(1, Payment::count());
    }
}
