<?php

namespace Tests\Feature;

use App\Models\Driver;
use App\Models\JournalLine;
use App\Models\Labourer;
use App\Models\Staff;
use App\Models\User;
use App\Services\Labour\LabourService;
use App\Services\Payments\PaymentService;
use App\Services\Payroll\PayrollService;
use App\Services\Transport\TransportService;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class Phase2FlowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RolePermissionSeeder::class, ChartOfAccountsSeeder::class]);
        $owner = User::factory()->create();
        $owner->assignRole('Owner');
        Sanctum::actingAs($owner);
    }

    private function assertBalanced(): void
    {
        $this->assertSame((int) JournalLine::sum('debit'), (int) JournalLine::sum('credit'));
    }

    public function test_transport_trip_accrues_driver_dues_and_stays_balanced(): void
    {
        $driver = Driver::create(['name' => 'Akram']);

        app(TransportService::class)->recordTrip([
            'driver_id' => $driver->id,
            'trip_date' => '2026-06-16',
            'rate' => 300000,   // Rs 3000
            'paid' => 100000,   // Rs 1000
        ]);

        $this->assertSame(200000, (int) $driver->fresh()->balance); // unpaid dues
        $this->assertBalanced();

        // settle the dues
        app(PaymentService::class)->settleParty($driver->fresh(), [
            'payment_date' => '2026-06-16', 'amount' => 200000,
        ]);
        $this->assertSame(0, (int) $driver->fresh()->balance);
        $this->assertBalanced();
    }

    public function test_labour_attendance_accrues_wage_payable(): void
    {
        $labourer = Labourer::create(['name' => 'Bilal', 'daily_wage' => 150000]);

        app(LabourService::class)->markAttendance([
            'labourer_id' => $labourer->id,
            'work_date' => '2026-06-16',
            'status' => 'present',
        ]);

        $this->assertSame(150000, (int) $labourer->fresh()->balance);
        $this->assertBalanced();

        // half day = half wage
        app(LabourService::class)->markAttendance([
            'labourer_id' => $labourer->id,
            'work_date' => '2026-06-17',
            'status' => 'half',
        ]);
        $this->assertSame(225000, (int) $labourer->fresh()->balance);
        $this->assertBalanced();
    }

    public function test_salary_generate_and_pay_settles_and_stays_balanced(): void
    {
        $staff = Staff::create(['name' => 'Supervisor', 'monthly_salary' => 4000000]);
        $payroll = app(PayrollService::class);

        $salary = $payroll->generate(['staff_id' => $staff->id, 'month' => '2026-06']);
        $this->assertSame(4000000, (int) $salary->balance);
        $this->assertBalanced();

        $payroll->pay($salary->fresh(), ['payment_date' => '2026-06-16', 'amount' => 4000000]);
        $this->assertSame('paid', $salary->fresh()->status);
        $this->assertSame(0, (int) $salary->fresh()->balance);
        $this->assertBalanced();
    }
}
