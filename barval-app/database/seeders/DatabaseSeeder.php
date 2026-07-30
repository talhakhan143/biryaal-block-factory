<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            RolePermissionSeeder::class,
            ChartOfAccountsSeeder::class,
            CatalogSeeder::class,
            ResellerCatalogSeeder::class,
        ]);

        $this->ensureUser(
            env('SEED_SUPER_ADMIN_EMAIL', 'mr.talha143@gmail.com'),
            'Talha (Super Admin)',
            'Super Admin',
            env('SEED_SUPER_ADMIN_PASSWORD'),
        );

        $this->ensureUser(
            env('SEED_OWNER_EMAIL', 'muhammadali@baryal.com.pk'),
            'Muhammad Ali (Owner)',
            'Owner',
            env('SEED_OWNER_PASSWORD'),
        );

        $this->ensureUser(
            env('SEED_SALES_EMAIL', 'sales@baryal.com.pk'),
            'Saleman',
            'Sales User',
            env('SEED_SALES_PASSWORD'),
        );
    }

    /**
     * Create the account if it is missing, never touch an existing one — a reseed
     * must not reset a password somebody has already changed.
     *
     * No password is ever hardcoded here: pass one through the environment
     * (SEED_*_PASSWORD) or a random one is generated and printed once. This file
     * lives in a git repo; anything written in it is public.
     */
    private function ensureUser(string $email, string $name, string $role, ?string $password): void
    {
        $existing = User::where('email', $email)->first();

        if ($existing) {
            $existing->syncRoles([$role]);

            return;
        }

        $password = $password ?: Str::password(16);

        $user = User::create([
            'email' => $email,
            'name' => $name,
            'password' => $password,
            'is_active' => true,
        ]);
        $user->syncRoles([$role]);

        $this->command?->warn("Created {$role}: {$email} / {$password}  — note it down, it is not shown again.");
    }
}
