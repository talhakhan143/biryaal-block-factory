<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    /**
     * The original seed created demo logins (owner@blockfactory.test / "password",
     * accountant@blockfactory.test) that the login page used to pre-fill. The
     * pre-fill and the seeder entries are gone, but any database seeded before
     * that still carries those rows, so anyone who knows the address can sign in.
     *
     * Deactivate them, scramble the password and revoke their API tokens. The
     * rows stay so `created_by` audit trails keep resolving.
     */
    public function up(): void
    {
        $ids = DB::table('users')
            ->where('email', 'like', '%@blockfactory.test')
            ->pluck('id');

        if ($ids->isEmpty()) {
            return;
        }

        DB::table('users')->whereIn('id', $ids)->update([
            'is_active' => false,
            'password' => Hash::make(Str::random(48)),
            'remember_token' => null,
            'updated_at' => now(),
        ]);

        if (Schema::hasTable('personal_access_tokens')) {
            DB::table('personal_access_tokens')
                ->where('tokenable_type', \App\Models\User::class)
                ->whereIn('tokenable_id', $ids)
                ->delete();
        }
    }

    public function down(): void
    {
        // One-way: these accounts must never come back.
    }
};
