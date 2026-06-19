<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RolePermissionSeeder extends Seeder
{
    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $permissions = [
            'dashboard.view',
            'suppliers.view', 'suppliers.manage',
            'materials.view', 'materials.manage',
            'purchases.view', 'purchases.manage',
            'production.view', 'production.manage',
            'inventory.view', 'inventory.manage',
            'customers.view', 'customers.manage',
            'sales.view', 'sales.manage',
            'payments.view', 'payments.manage',
            'expenses.view', 'expenses.manage',
            'accounting.view',
            'reports.view',
            'users.manage',
            // Phase 2
            'dispatch.view', 'dispatch.manage',
            'transport.view', 'transport.manage',
            'labour.view', 'labour.manage',
            'hr.view', 'hr.manage',
            'audit.view',
        ];

        foreach ($permissions as $name) {
            Permission::firstOrCreate(['name' => $name, 'guard_name' => 'web']);
        }

        // Super Admin (developer) — full access; also bypasses via Gate::before.
        $superAdmin = Role::firstOrCreate(['name' => 'Super Admin', 'guard_name' => 'web']);
        $superAdmin->syncPermissions($permissions);

        $owner = Role::firstOrCreate(['name' => 'Owner', 'guard_name' => 'web']);
        $owner->syncPermissions($permissions); // full access

        $accountant = Role::firstOrCreate(['name' => 'Accountant', 'guard_name' => 'web']);
        $accountant->syncPermissions([
            'dashboard.view', 'suppliers.view', 'materials.view',
            'purchases.view', 'purchases.manage', 'inventory.view',
            'customers.view', 'sales.view', 'payments.view', 'payments.manage',
            'expenses.view', 'expenses.manage', 'accounting.view', 'reports.view',
            'transport.view', 'labour.view', 'hr.view', 'hr.manage', 'dispatch.view',
            'audit.view',
        ]);

        $supervisor = Role::firstOrCreate(['name' => 'Supervisor', 'guard_name' => 'web']);
        $supervisor->syncPermissions([
            'dashboard.view', 'materials.view',
            'production.view', 'production.manage',
            'inventory.view', 'inventory.manage',
            'dispatch.view', 'dispatch.manage',
            'transport.view', 'transport.manage',
            'labour.view', 'labour.manage',
        ]);

        $sales = Role::firstOrCreate(['name' => 'Sales User', 'guard_name' => 'web']);
        $sales->syncPermissions([
            'dashboard.view', 'customers.view', 'customers.manage',
            'sales.view', 'sales.manage', 'payments.view', 'payments.manage',
            'inventory.view', 'dispatch.view', 'dispatch.manage',
        ]);
    }
}
