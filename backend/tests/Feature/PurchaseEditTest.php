<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Driver;
use App\Models\JournalLine;
use App\Models\MaterialPurchase;
use App\Models\RawMaterial;
use App\Models\Supplier;
use App\Models\TransportTrip;
use App\Models\User;
use App\Services\Accounting\LedgerService;
use App\Services\Payments\PaymentService;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Galat likhi hui khareed theek karna.
 *
 * Owner ka sawal yehi tha: "har row par edit ka button ho jahan main changes
 * kar sakun." Khareed par aik hi form se teen cheezein hilti hain: kache maal
 * ka stock, supplier ka udhaar aur khata. Is liye har test aik hi baat sabit
 * karta hai: edit ke baad teenon theek us jagah hain jahan nayi values kehti
 * hain, aur debit credit barabar hi rehte hain.
 */
class PurchaseEditTest extends TestCase
{
    use RefreshDatabase;

    private Supplier $supplier;

    private RawMaterial $material;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([RolePermissionSeeder::class, ChartOfAccountsSeeder::class]);

        $owner = User::factory()->create();
        $owner->assignRole('Owner');
        Sanctum::actingAs($owner);

        $this->supplier = Supplier::create(['name' => 'Chenab Sand']);
        $this->material = RawMaterial::create(['name' => 'Raiti', 'unit' => 'trolley', 'current_qty' => 0, 'low_stock_threshold' => 0]);
    }

    /** Ek poora snapshot: har wo figure jo galat edit se kharab ho sakta hai. */
    private function snapshot(): array
    {
        return [
            'material_qty' => (float) $this->material->fresh()->current_qty,
            'supplier_balance' => (int) $this->supplier->fresh()->balance,
            'cash' => $this->net(Account::CASH),
            'inventory' => $this->net(Account::INVENTORY),
            'payable' => $this->net(Account::PAYABLE),
            'debit_total' => (int) JournalLine::sum('debit'),
            'credit_total' => (int) JournalLine::sum('credit'),
        ];
    }

    private function net(string $code): int
    {
        $lines = JournalLine::query()->whereHas('account', fn ($q) => $q->where('code', $code));

        return (int) $lines->clone()->sum('debit') - (int) $lines->clone()->sum('credit');
    }

    /** Maal 10 × Rs 5,000 + loading Rs 1,000 = Rs 51,000, us me se Rs 20,000 diya. */
    private function buy(array $extra = []): MaterialPurchase
    {
        $body = array_merge([
            'supplier_id' => $this->supplier->id,
            'raw_material_id' => $this->material->id,
            'purchase_date' => '2026-06-10',
            'quantity' => 10,
            'unit_cost' => 5000,       // rupees, controller paisa me badalta hai
            'loading_cost' => 1000,
            'paid_amount' => 20000,
            'method' => 'cash',
        ], $extra);

        $id = $this->postJson('/api/v1/purchases', $body)->assertSuccessful()->json('data.id');

        return MaterialPurchase::findOrFail($id);
    }

    public function test_the_edit_moves_stock_khata_aur_udhaar_to_the_new_values(): void
    {
        $purchase = $this->buy();

        $this->assertSame([
            'material_qty' => 10.0,
            'supplier_balance' => 3100000,
            'cash' => -2000000,
            'inventory' => 5100000,
            'payable' => -3100000,
            'debit_total' => 5100000,
            'credit_total' => 5100000,
        ], $this->snapshot(), 'Pehle ki haalat.');

        // Qty, rate aur diya hua paisa, teenon aik hi dafa badal diye.
        // loading bheja hi nahi: jo bheja nahi gaya wo pehle jaisa rehna chahiye.
        $this->patchJson("/api/v1/purchases/{$purchase->id}", [
            'quantity' => 8,
            'unit_cost' => 6000,
            'paid_amount' => 10000,
            'method' => 'cash',
        ])->assertOk()
            ->assertJsonPath('data.reference', $purchase->reference)
            ->assertJsonPath('data.total_cost', 4900000)
            ->assertJsonPath('data.paid_amount', 1000000)
            ->assertJsonPath('data.payment_status', 'partial');

        $this->assertSame([
            'material_qty' => 8.0,
            'supplier_balance' => 3900000,
            'cash' => -1000000,
            'inventory' => 4900000,
            'payable' => -3900000,
            'debit_total' => 4900000,
            'credit_total' => 4900000,
        ], $this->snapshot(), 'Har figure nayi values par.');

        $this->assertSame(100000, (int) $purchase->fresh()->loading_cost, 'Loading jaisi thi waisi.');
        $this->assertSame(1, MaterialPurchase::count(), 'Edit se nayi row nahi banni chahiye.');
    }

    public function test_changing_the_supplier_moves_the_udhaar_off_the_old_one(): void
    {
        $purchase = $this->buy();
        $other = Supplier::create(['name' => 'Ravi Crush']);

        $this->patchJson("/api/v1/purchases/{$purchase->id}", ['supplier_id' => $other->id])->assertOk();

        $this->assertSame(0, (int) $this->supplier->fresh()->balance, 'Purane supplier par kuch baqi nahi.');
        $this->assertSame(3100000, (int) $other->fresh()->balance, 'Poora udhaar naye supplier par.');
        $this->assertSame((int) JournalLine::sum('debit'), (int) JournalLine::sum('credit'));

        // Khate ki memo bhi naye supplier ki honi chahiye, warna ledger me
        // purana naam chipka reh jata hai.
        $memos = JournalLine::query()
            ->whereHas('account', fn ($q) => $q->where('code', Account::PAYABLE))
            ->pluck('memo')->all();
        $this->assertSame(['Ravi Crush'], $memos);
    }

    public function test_changing_the_material_moves_the_stock_to_the_other_one(): void
    {
        $purchase = $this->buy();
        $crush = RawMaterial::create(['name' => 'Crush', 'unit' => 'trolley', 'current_qty' => 4, 'low_stock_threshold' => 0]);

        $this->patchJson("/api/v1/purchases/{$purchase->id}", ['raw_material_id' => $crush->id, 'quantity' => 6])->assertOk();

        $this->assertSame(0.0, (float) $this->material->fresh()->current_qty, 'Raiti se poori qty wapas.');
        $this->assertSame(10.0, (float) $crush->fresh()->current_qty, 'Crush par 4 + 6.');
    }

    public function test_a_bill_paid_from_its_own_pay_button_cannot_be_edited_from_here(): void
    {
        $purchase = $this->buy();

        $this->postJson("/api/v1/purchases/{$purchase->id}/pay", [
            'payment_date' => '2026-06-12', 'amount' => 5000, 'method' => 'cash',
        ])->assertCreated();

        $before = $this->snapshot();
        $this->patchJson("/api/v1/purchases/{$purchase->id}", ['quantity' => 2])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Is bill par "Pay" karke paisa diya gaya hai, is liye yahan se tabdeeli nahi hoti. Pehle wo payment wapas lein, phir ye khareed theek karein.');

        $this->assertSame($before, $this->snapshot(), 'Rukne wali edit se kuch bhi nahi hilna chahiye.');
    }

    public function test_a_lump_supplier_payment_also_locks_the_bill(): void
    {
        $purchase = $this->buy();

        // Supplier ko aik hi dafa poora paisa. Ye kisi aik bill se juda nahi
        // hota, magar andar jaa kar is bill ka paid_amount hila deta hai.
        app(PaymentService::class)->payToSupplier([
            'supplier_id' => $this->supplier->id, 'payment_date' => '2026-06-12',
            'amount' => 3100000, 'method' => 'cash',
        ]);
        $this->assertSame(5100000, (int) $purchase->fresh()->paid_amount);

        $this->patchJson("/api/v1/purchases/{$purchase->id}", ['quantity' => 2])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Is supplier ko di gayi payment is bill par lag chuki hai, is liye yahan se tabdeeli nahi hoti. Pehle Payments me se wo payment wapas lein, phir ye khareed theek karein.');
    }

    public function test_an_old_bill_whose_kiraya_sits_inside_it_cannot_be_edited(): void
    {
        $purchase = $this->buy();
        $driver = Driver::create(['name' => 'Akram', 'is_active' => true]);

        // Purana tareeqa: kiraya bill ke andar chadh kar clearing se driver ko
        // jata tha. Aise bill ko dobara likhein to clearing me sirf driver
        // wali taraf reh jati hai.
        $purchase->forceFill(['transport_cost' => 800000])->save();
        TransportTrip::create([
            'reference' => 'TRP-TEST', 'driver_id' => $driver->id,
            'material_purchase_id' => $purchase->id, 'kind' => TransportTrip::INBOUND,
            'trip_date' => '2026-06-10', 'rate' => 800000, 'paid' => 0,
            'balance' => 800000, 'status' => 'unpaid',
        ]);

        $this->patchJson("/api/v1/purchases/{$purchase->id}", ['quantity' => 2])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Ye purani entry hai jis ka kiraya bill ke andar chadha hua hai aur driver ke khate se juda hua hai, is liye yahan se nahi badalti. Pehle "Maal ka Kiraya" par us trip ko theek karein.');
    }

    public function test_a_clearing_line_on_the_bill_blocks_the_edit_too(): void
    {
        $purchase = $this->buy();

        // Doosri layer: row par kiraya sifar ho magar khate me clearing wali
        // line maujood ho, tab bhi hath nahi lagana.
        app(LedgerService::class)->post('2026-06-10', 'Purani inbound freight', [
            ['account' => Account::EXPENSE, 'debit' => 500000],
            ['account' => Account::TRANSPORT_CLEARING, 'credit' => 500000],
        ], $purchase);

        $this->patchJson("/api/v1/purchases/{$purchase->id}", ['quantity' => 2])->assertStatus(422);
    }

    public function test_the_kiraya_wali_trip_of_the_new_flow_does_not_block_the_edit(): void
    {
        $purchase = $this->buy();
        $driver = Driver::create(['name' => 'Akram', 'is_active' => true]);

        // Ab ka tareeqa: kiraya seedha driver ke naam, purchase par sifar. Is
        // trip ka apna khata alag hai, is liye khareed yahin se theek hoti hai.
        $trip = TransportTrip::findOrFail($this->postJson('/api/v1/transport-trips', [
            'driver_id' => $driver->id, 'kind' => 'in', 'trip_date' => '2026-06-10',
            'material_purchase_id' => $purchase->id, 'to_location' => 'Factory',
            'rate' => 8000, 'paid' => 0, 'method' => 'cash',
        ])->assertCreated()->json('data.id'));

        $this->patchJson("/api/v1/purchases/{$purchase->id}", ['quantity' => 12])->assertOk();

        $this->assertSame(12.0, (float) $this->material->fresh()->current_qty);
        $this->assertSame($purchase->id, $trip->fresh()->material_purchase_id, 'Trip usi row se judi rehni chahiye.');
        $this->assertSame(800000, (int) $driver->fresh()->balance, 'Driver ka kiraya is edit se nahi hilta.');
        $this->assertSame((int) JournalLine::sum('debit'), (int) JournalLine::sum('credit'));
    }

    public function test_the_stock_is_not_allowed_to_go_minus(): void
    {
        $purchase = $this->buy(['paid_amount' => 0]);

        // 10 trolley aaye the, 6 production me chale gaye (stock 4 bacha).
        // Ab is khareed ko 2 par le jana stock minus me daal dega.
        $this->material->decrement('current_qty', 6);
        $before = $this->snapshot();

        $this->patchJson("/api/v1/purchases/{$purchase->id}", ['quantity' => 2])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Is tabdeeli se Raiti ka stock minus me chala jata hai. Pehle stock theek karein, phir ye khareed badlein.');

        $this->assertSame($before, $this->snapshot());
    }

    public function test_paying_more_than_the_new_bill_is_refused(): void
    {
        $purchase = $this->buy();

        $this->patchJson("/api/v1/purchases/{$purchase->id}", ['quantity' => 1, 'paid_amount' => 20000])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Diya hua paisa Rs 20,000.00 hai jo naye bill Rs 6,000.00 se zyada hai. Pehle rakam kam karein.');
    }

    public function test_bank_wali_khareed_ka_paisa_bank_hi_se_jata_hai(): void
    {
        $purchase = $this->buy();

        $this->patchJson("/api/v1/purchases/{$purchase->id}", [
            'method' => 'bank', 'bank_ref' => 'HBL-9981', 'paid_amount' => 15000,
        ])->assertOk()->assertJsonPath('data.bank_ref', 'HBL-9981');

        $this->assertSame(0, $this->net(Account::CASH), 'Cash me se kuch nahi gaya.');
        $this->assertSame(-1500000, $this->net(Account::BANK));

        // Bank par bina reference kuch nahi likha ja sakta.
        $this->patchJson("/api/v1/purchases/{$purchase->id}", ['method' => 'bank', 'bank_ref' => ''])
            ->assertStatus(422)
            ->assertJsonPath('errors.bank_ref.0', 'Bank payment par bank/reference likhna zaroori hai.');
    }

    public function test_only_someone_who_can_write_purchases_may_edit_one(): void
    {
        $purchase = $this->buy();

        // Supervisor production aur dispatch chalata hai, khareed uski nahi.
        // (Sales User khareed likhta hai, is liye wo yahan misaal nahi.)
        $supervisor = User::factory()->create();
        $supervisor->assignRole('Supervisor');
        Sanctum::actingAs($supervisor);

        $this->patchJson("/api/v1/purchases/{$purchase->id}", ['quantity' => 2])->assertStatus(403);
        $this->assertSame(10.0, (float) $this->material->fresh()->current_qty);
    }
}
