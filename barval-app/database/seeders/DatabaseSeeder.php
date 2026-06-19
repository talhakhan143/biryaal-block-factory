<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            RolePermissionSeeder::class,
            ChartOfAccountsSeeder::class,
            CatalogSeeder::class,
        ]);

        $superAdmin = User::updateOrCreate(
            ['email' => 'mr.talha143@gmail.com'],
            ['name' => 'Talha (Super Admin)', 'password' => 'Spazio@786', 'is_active' => true],
        );
        $superAdmin->syncRoles(['Super Admin']);

        $owner = User::updateOrCreate(
            ['email' => 'owner@blockfactory.test'],
            [
                'name' => 'Factory Owner',
                'password' => 'password',
                'phone' => '03000000000',
                'is_active' => true,
            ],
        );
        $owner->syncRoles(['Owner']);

        $accountant = User::updateOrCreate(
            ['email' => 'accountant@blockfactory.test'],
            ['name' => 'Accountant', 'password' => 'password', 'is_active' => true],
        );
        $accountant->syncRoles(['Accountant']);
    }
}
