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
