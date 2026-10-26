<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Dashboard par parda: aamdani aur farokht chhupana.
 *
 * Owner ki baat: "income aur total sale dashboard par na dikhe, takay nazar na
 * phren. Switch Settings mein ho aur apna password daal kar khole."
 *
 * Baad mein owner ne saaf kaha: "ye setting password protected hogi, mtlb koi b
 * akr chnage nhe kr skaega." Yani password HAR tabdeeli par, lagane par bhi aur
 * kholne par bhi.
 *
 * Is liye do cheezein yahan se guzarti hain. Aik, chhupi hui raqam response
 * mein bhejni hi nahi, warna saath khara banda devtools khol kar parh lega aur
 * parda sirf naam ka reh jayega. Do, bina sahi password ye setting hilti hi
 * nahi. Dono mein se koi aik bhi toot jaye to feature bemani hai.
 */
class DashboardPrivacyTest extends TestCase
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

        // Galat password ki ginti cache mein rehti hai aur RefreshDatabase usay
        // saaf nahi karta, jabke user id har test mein phir 1 se shuru hoti hai.
        // Clear na karein to aik test ki nakaam koshish agle test ko rate limit
        // kar deti hai aur suite bila wajah flaky ho jati hai.
        RateLimiter::clear('dashboard-privacy:'.$this->owner->id);
    }

    /** UserFactory har banda isi password par banata hai. */
    private const PASSWORD = 'password';

    /**
     * Password har tabdeeli par lagta hai, is liye helper khud daal deta hai.
     * Jis test ko khali ya galat password bhejna ho wo apni key khud deta hai
     * (array union mein left side jeet jati hai) ya seedha patchJson use karta hai.
     */
    private function save(array $body)
    {
        return $this->patchJson('/api/v1/settings/dashboard-privacy', $body + ['current_password' => self::PASSWORD]);
    }

    private function dashboard(): array
    {
        return $this->getJson('/api/v1/dashboard')->assertOk()->json();
    }

    private function storedHidden(): array
    {
        return $this->owner->fresh()->hiddenDashboardGroups();
    }

    /**
     * Pehle din kuch chhupa hua nahi hota.
     *
     * Ye us din ke liye hai jab koi default badal de: feature bina maange kisi
     * ki screen se aik raqam bhi gayab nahi karega.
     */
    public function test_by_default_every_figure_is_visible(): void
    {
        $payload = $this->dashboard();

        foreach (['sales_total', 'money_in', 'money_out', 'expenses_total'] as $key) {
            $this->assertArrayHasKey($key, $payload['today'], "today.$key pehle din dikhna chahiye.");
        }
        foreach (['sales_total', 'income', 'expenses_total', 'net_profit'] as $key) {
            $this->assertArrayHasKey($key, $payload['month'], "month.$key pehle din dikhna chahiye.");
        }
        foreach (['cash_in_hand', 'bank_balance', 'total_cash', 'receivables', 'payables'] as $key) {
            $this->assertArrayHasKey($key, $payload, "$key pehle din dikhna chahiye.");
        }

        $this->assertSame([], $payload['hidden'], 'Shuru mein kuch chhupa hua nahi hota.');
    }

    /**
     * Taala lagane ke liye password nahi poocha jata, aur lagne ke baad raqam
     * response mein hoti hi nahi.
     *
     * Sirf zero kar dena kaafi nahi hota, is liye key ki maujoodgi hi pakadte
     * hain. Saath hi production_qty, due_counts aur stock zinda rehne chahiye,
     * warna parda lagate hue poora dashboard khali ho jayega.
     */
    public function test_hiding_the_money_also_needs_the_password(): void
    {
        // Pehle bina password: owner ka rule hai ke koi aa kar badal na sake,
        // is liye parda lagana bhi muft nahi hai.
        $this->patchJson('/api/v1/settings/dashboard-privacy', ['hidden' => ['sales', 'income']])
            ->assertStatus(422)
            ->assertJsonValidationErrors('current_password');

        $this->assertSame([], $this->storedHidden(), 'Bina password setting hilni nahi chahiye.');

        $this->save(['hidden' => ['sales', 'income']])
            ->assertOk()
            ->assertJsonPath('data.dashboard_hidden', ['income', 'sales']);

        $this->getJson('/api/v1/dashboard')
            ->assertOk()
            ->assertJsonMissingPath('today.sales_total')
            ->assertJsonMissingPath('today.money_in')
            ->assertJsonMissingPath('today.money_out')
            ->assertJsonMissingPath('month.sales_total')
            ->assertJsonMissingPath('month.income')
            ->assertJsonMissingPath('month.net_profit');

        $payload = $this->dashboard();

        $this->assertArrayNotHasKey('sales_total', $payload['today']);
        $this->assertArrayNotHasKey('money_in', $payload['today']);
        $this->assertArrayNotHasKey('money_out', $payload['today']);
        $this->assertArrayNotHasKey('sales_total', $payload['month']);
        $this->assertArrayNotHasKey('income', $payload['month']);
        $this->assertArrayNotHasKey('net_profit', $payload['month']);

        // Owner ne saaf kaha "expenses q hide kr rhe": kharch kabhi nahi chhupta,
        // na aaj ka na is mahine ka, chahe dono parde lage hon.
        $this->assertArrayHasKey('expenses_total', $payload['today'], 'Aaj ka kharch chhupna nahi chahiye.');
        $this->assertArrayHasKey('expenses_total', $payload['month'], 'Is mahine ka kharch chhupna nahi chahiye.');

        // Blocks ki ginti bhi kabhi nahi chhupti, wo paisa nahi hai.
        $this->assertArrayHasKey('production_qty', $payload['today'], 'Kaam ke figure chhupne nahi chahiye.');
        $this->assertArrayHasKey('blocks_sold', $payload['today'], 'Aaj bike blocks ki ginti chhupni nahi chahiye.');
        $this->assertArrayHasKey('sold', $payload['totals'], 'Ab tak bike blocks ki ginti chhupni nahi chahiye.');
        $this->assertArrayHasKey('due_counts', $payload);
        $this->assertArrayHasKey('stock', $payload);
        $this->assertSame(['income', 'sales'], $payload['hidden']);
    }

    /**
     * Sabse zaroori test: parda khali haath nahi uthta.
     *
     * Bina password kholne ki koshish 422 deti hai aur stored setting ko haath
     * bhi nahi lagti. Agar kal koi validation ko service se pehle se hata de to
     * raqam chup chaap khul jayegi aur kisi ko pata nahi chalega.
     */
    public function test_revealing_without_a_password_is_refused_and_changes_nothing(): void
    {
        $this->save(['hidden' => ['income', 'sales']])->assertOk();

        $this->patchJson('/api/v1/settings/dashboard-privacy', ['hidden' => ['income']])
            ->assertStatus(422)
            ->assertJsonValidationErrors('current_password');

        $this->assertSame(['income', 'sales'], $this->storedHidden(), 'Nakaam koshish se setting nahi badalni chahiye.');

        $this->getJson('/api/v1/dashboard')
            ->assertOk()
            ->assertJsonMissingPath('today.sales_total')
            ->assertJsonMissingPath('month.net_profit');
    }

    /**
     * Galat password bhi wahi 422 deta hai, aur setting wahin ki wahin rehti hai.
     * Yani andaze se taala kholne ki koshish bekaar jati hai.
     */
    public function test_revealing_with_a_wrong_password_is_refused_too(): void
    {
        $this->save(['hidden' => ['cash']])->assertOk();

        $this->save(['hidden' => [], 'current_password' => 'ghalat-password'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('current_password');

        $this->assertSame(['cash'], $this->storedHidden());
        $this->getJson('/api/v1/dashboard')->assertOk()->assertJsonMissingPath('cash_in_hand');
    }

    /** Apna sahi password dalne par taala khulta hai aur raqam wapas aa jati hai. */
    public function test_revealing_with_the_right_password_brings_the_figures_back(): void
    {
        $this->save(['hidden' => ['income', 'sales', 'cash']])->assertOk();

        $this->save(['hidden' => [], 'current_password' => self::PASSWORD])
            ->assertOk()
            ->assertJsonPath('data.dashboard_hidden', []);

        $payload = $this->dashboard();

        $this->assertArrayHasKey('sales_total', $payload['today']);
        $this->assertArrayHasKey('net_profit', $payload['month']);
        $this->assertArrayHasKey('cash_in_hand', $payload);
        $this->assertSame([], $payload['hidden']);
        $this->assertSame([], $this->storedHidden());
    }

    /**
     * Sirf wohi chaar slug chalte hain jo tay hue the. Koi apni marzi ka naam
     * bheje to 422, aur preferences mein kuch likha nahi jata, warna dashboard
     * ke paas aisa slug reh jayega jo wo samajhta hi nahi.
     */
    public function test_an_unknown_slug_is_rejected_and_nothing_is_stored(): void
    {
        $this->save(['hidden' => ['profit', 'everything']])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['hidden.0', 'hidden.1']);

        $this->assertNull($this->owner->fresh()->preferences, 'Galat slug par kuch bhi save nahi hona chahiye.');
        $this->assertSame([], $this->storedHidden());
    }

    /**
     * Parda har bande ka apna hai.
     *
     * Owner apni screen chhupaye to accountant ki screen par koi asar na ho,
     * warna ye setting chori chupke poore system ka switch ban jayegi.
     */
    public function test_one_persons_curtain_does_not_cover_anyone_else(): void
    {
        $this->save(['hidden' => ['cash']])->assertOk();
        $this->getJson('/api/v1/dashboard')->assertOk()->assertJsonMissingPath('cash_in_hand');

        $doosra = User::factory()->create();
        $doosra->assignRole('Owner');
        Sanctum::actingAs($doosra);

        $payload = $this->dashboard();

        $this->assertArrayHasKey('cash_in_hand', $payload, 'Doosre bande ka cash chhupna nahi chahiye.');
        $this->assertSame([], $payload['hidden']);
    }

    /**
     * Resellers Point ki books alag hain magar dekhne wali aankhein wahi, is
     * liye Settings ka wahi switch us screen par bhi chalta hai. Jo kaam ka
     * figure hai (items_count) wo zinda rehta hai.
     */
    public function test_the_reseller_dashboard_honours_the_same_switch(): void
    {
        $this->save(['hidden' => ['income']])->assertOk();

        $response = $this->getJson('/api/v1/reseller/dashboard')
            ->assertOk()
            ->assertJsonMissingPath('data.sales.profit')
            ->assertJsonMissingPath('data.profit');

        $data = $response->json('data');

        $this->assertArrayNotHasKey('profit', $data['sales']);
        $this->assertArrayNotHasKey('profit', $data);
        $this->assertContains('income', $data['hidden']);
        $this->assertArrayHasKey('items_count', $data, 'Ginti wale figure chhupne nahi chahiye.');
    }

    /**
     * /me login ke saath hi bata deta hai kya chhupa hua hai, warna frontend ko
     * pehla render karne se pehle aik extra call maarni paregi aur aik lamhe ke
     * liye chhupi hui raqam bhi jhalak jayegi.
     */
    public function test_me_reports_what_is_hidden(): void
    {
        $this->getJson('/api/v1/me')->assertOk()->assertJsonPath('data.dashboard_hidden', []);

        $this->save(['hidden' => ['dues']])->assertOk();

        $this->getJson('/api/v1/me')->assertOk()->assertJsonPath('data.dashboard_hidden', ['dues']);
    }

    /**
     * preferences mein aage chal kar doosri settings bhi aayengi. Parda save
     * karne se unmein se kuch mitna nahi chahiye, warna aik setting badalne par
     * baqi chup chaap ur jayengi.
     */
    public function test_saving_the_curtain_keeps_other_preferences_intact(): void
    {
        $this->owner->forceFill(['preferences' => ['language' => 'ur', 'pos_print' => false]])->save();

        $this->save(['hidden' => ['cash']])->assertOk();

        $preferences = $this->owner->fresh()->preferences;

        $this->assertSame('ur', $preferences['language'] ?? null);
        $this->assertFalse($preferences['pos_print'] ?? null);
        $this->assertSame(['cash'], $preferences['dashboard_hidden']);
    }
}
