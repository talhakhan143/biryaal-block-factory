<?php

namespace Tests\Feature;

use App\Models\Expense;
use App\Models\JournalEntry;
use App\Models\JournalLine;
use App\Models\User;
use App\Services\Expenses\ExpenseService;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Galat likha hua kharcha theek karna.
 *
 * Owner ka sawal yehi tha: "row par se hi theek ho jana chahiye." Is liye har
 * test aik hi cheez sabit karta hai: edit ke baad cash aur kharche ka khata
 * nayi rakam par hai, debit credit barabar hai, aur parchi ka reference wahi
 * hai jo bande ko pehle de diya gaya tha.
 */
class ExpenseEditTest extends TestCase
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

    /** Ek poora snapshot: har wo figure jo galti se kharab ho sakta hai. */
    private function snapshot(): array
    {
        return [
            'cash' => $this->net('1000'),
            'bank' => $this->net('1010'),
            'cost' => $this->net('5000'),
            'debit_total' => (int) JournalLine::sum('debit'),
            'credit_total' => (int) JournalLine::sum('credit'),
            'entries' => (int) JournalEntry::count(),
            'rows' => Expense::orderBy('reference')
                ->get(['reference', 'expense_date', 'category', 'amount', 'method', 'title'])
                ->toArray(),
        ];
    }

    private function net(string $code): int
    {
        $lines = JournalLine::query()->whereHas('account', fn ($q) => $q->where('code', $code));

        return (int) $lines->clone()->sum('debit') - (int) $lines->clone()->sum('credit');
    }

    private function diesel(int $amount, string $method = 'cash'): Expense
    {
        return app(ExpenseService::class)->record([
            'expense_date' => '2026-06-10',
            'category' => 'diesel',
            'amount' => $amount,
            'method' => $method,
            'title' => 'Generator ka diesel',
        ]);
    }

    public function test_editing_an_expense_moves_cash_and_the_cost_account_to_the_new_amount(): void
    {
        $expense = $this->diesel(500000);
        $this->assertSame(-500000, $this->net('1000'));
        $this->assertSame(500000, $this->net('5000'));

        // Jaise paanch hazar ki jaga do hazar likhna tha.
        $this->patchJson("/api/v1/expenses/{$expense->id}", [
            'amount' => 2000,
            'expense_date' => '2026-06-12',
            'title' => 'Generator ka diesel (theek kiya)',
        ])
            ->assertOk()
            ->assertJsonPath('data.amount', 200000)
            ->assertJsonPath('data.expense_date', '2026-06-12')
            ->assertJsonPath('data.reference', $expense->reference);

        $this->assertSame(-200000, $this->net('1000'), 'Cash nayi rakam par aana chahiye.');
        $this->assertSame(200000, $this->net('5000'), 'Kharche ka khata bhi nayi rakam par.');
        $this->assertSame((int) JournalLine::sum('debit'), (int) JournalLine::sum('credit'));
        $this->assertSame(1, Expense::count(), 'Edit se naya kharcha nahi banna chahiye.');

        $entries = JournalEntry::where('source_type', $expense->getMorphClass())
            ->where('source_id', $expense->id)
            ->get();
        $this->assertCount(1, $entries, 'Sirf aik hi entry honi chahiye, purani hat jati hai.');
        $this->assertSame('2026-06-12', $entries->first()->entry_date->toDateString());
        $this->assertStringContainsString('theek kiya', $entries->first()->description);
    }

    public function test_switching_to_bank_moves_the_money_out_of_cash(): void
    {
        $expense = $this->diesel(300000);

        $this->patchJson("/api/v1/expenses/{$expense->id}", [
            'amount' => 3000,
            'method' => 'bank',
            'bank_ref' => 'HBL 7788',
        ])->assertOk();

        $this->assertSame(0, $this->net('1000'), 'Cash par kuch nahi bachna chahiye.');
        $this->assertSame(-300000, $this->net('1010'), 'Paisa ab bank se gaya hai.');
        $this->assertSame(300000, $this->net('5000'));
        $this->assertSame('HBL 7788', Expense::first()->bank_ref);
    }

    public function test_a_failed_edit_leaves_every_figure_exactly_where_it_was(): void
    {
        $expense = $this->diesel(400000);
        $before = $this->snapshot();

        // Bank likha magar bank/reference nahi diya.
        $this->patchJson("/api/v1/expenses/{$expense->id}", ['method' => 'bank'])->assertStatus(422);
        // Minus rakam.
        $this->patchJson("/api/v1/expenses/{$expense->id}", ['amount' => -5])->assertStatus(422);

        $this->assertSame($before, $this->snapshot(), 'Nakaam edit ke baad har figure wahi hona chahiye.');
    }

    public function test_an_expense_whose_ledger_entry_is_missing_cannot_be_edited(): void
    {
        $expense = $this->diesel(600000);

        // Aisa kharcha jiska khate me nishan hi nahi: naya post karna uska
        // matlab hota 5000 par wo debit lagana jo pehle kabhi laga hi nahi tha.
        JournalEntry::where('source_type', $expense->getMorphClass())
            ->where('source_id', $expense->id)
            ->get()
            ->each(function (JournalEntry $entry) {
                $entry->lines()->delete();
                $entry->delete();
            });
        $before = $this->snapshot();

        $this->patchJson("/api/v1/expenses/{$expense->id}", ['amount' => 1000])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Is kharche ki khate me koi entry nahi mili, is liye yahan se badla nahi ja sakta. Accounts wale se check karwayein.');

        $this->assertSame($before, $this->snapshot());
    }

    /**
     * Edit usi permission par hai jis par kharcha likhna hai (expenses.manage),
     * is liye jis bande ko wo nahi mili usay edit bhi nahi milta.
     */
    public function test_someone_without_the_expense_permission_cannot_edit_it(): void
    {
        $expense = $this->diesel(100000);

        Sanctum::actingAs(User::factory()->create());

        $this->patchJson("/api/v1/expenses/{$expense->id}", ['amount' => 1])->assertStatus(403);
        $this->assertSame(100000, (int) Expense::first()->amount);
    }
}
