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

        // Baryal — real owner login.
        $baryalOwner = User::updateOrCreate(
            ['email' => 'muhammadali@baryal.pk'],
            ['name' => 'Muhammad Ali (Owner)', 'password' => 'm_ali_owner@786', 'is_active' => true],
        );
        $baryalOwner->syncRoles(['Owner']);

        // Baryal — sales person login (password managed by Owner).
        $baryalSales = User::updateOrCreate(
            ['email' => 'sales@baryal.pk'],
            ['name' => 'Saleman', 'password' => 'm_ali_sales@786', 'is_active' => true],
        );
        $baryalSales->syncRoles(['Sales User']);
    }
}
