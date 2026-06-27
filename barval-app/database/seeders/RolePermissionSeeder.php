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
            'suppliers.view', 'suppliers.manage', 'suppliers.delete',
            'materials.view', 'materials.manage', 'materials.delete',
            'purchases.view', 'purchases.manage',
            'production.view', 'production.manage',
            'inventory.view', 'inventory.manage', 'inventory.delete',
            'customers.view', 'customers.manage', 'customers.delete',
            'sales.view', 'sales.manage', 'sales.delete',
            // payments.receive = customer money IN only (receipts).
            // payments.manage = money OUT + advances + adjustments (theft-sensitive).
            'payments.view', 'payments.receive', 'payments.manage',
            'expenses.view', 'expenses.manage',
            'accounting.view',
            'reports.view',
            'users.manage',
            // Phase 2
            'dispatch.view', 'dispatch.manage',
            'transport.view', 'transport.manage', 'transport.delete',
            'labour.view', 'labour.manage', 'labour.delete',
            'hr.view', 'hr.manage', 'hr.delete',
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
            'customers.view', 'sales.view',
            'payments.view', 'payments.receive', 'payments.manage',
            'expenses.view', 'expenses.manage', 'accounting.view', 'reports.view',
            'transport.view', 'labour.view', 'hr.view', 'hr.manage', 'hr.delete', 'dispatch.view',
            'audit.view',
        ]);

        $supervisor = Role::firstOrCreate(['name' => 'Supervisor', 'guard_name' => 'web']);
        $supervisor->syncPermissions([
            'dashboard.view', 'materials.view',
            'production.view', 'production.manage',
            'inventory.view', 'inventory.manage', 'inventory.delete',
            'dispatch.view', 'dispatch.manage',
            'transport.view', 'transport.manage', 'transport.delete',
            'labour.view', 'labour.manage', 'labour.delete',
        ]);

        // Sales User — runs the whole operation (sales, production, dispatch, stock,
        // attendance, expenses) but CANNOT commit theft: no money-out (driver/labour/
        // supplier pay, advances), no manual adjustments, and no deletes anywhere.
        // Can only RECEIVE customer money (payments.receive), not pay it out.
        $sales = Role::firstOrCreate(['name' => 'Sales User', 'guard_name' => 'web']);
        $sales->syncPermissions([
            'dashboard.view',
            'customers.view', 'customers.manage',         // add/edit customers, no delete
            'sales.view', 'sales.manage',                 // make sales/returns, no delete
            'payments.view', 'payments.receive',          // take customer cash, NOT pay out
            'production.view', 'production.manage',        // record daily block production
            'inventory.view', 'inventory.manage',          // finished goods + product rates
            'materials.view', 'materials.manage',          // raw material in
            'purchases.view', 'purchases.manage',          // record purchases (cannot pay them)
            'expenses.view', 'expenses.manage',            // record petty expenses
            'dispatch.view', 'dispatch.manage',            // challan / delivery
            'transport.view', 'transport.manage',          // vehicles, drivers, trips (no pay/delete)
            'labour.view', 'labour.manage',                // labourers + attendance (no pay/delete)
            'reports.view',                                // operational reports
            // NOT granted: payments.manage, *.delete, accounting.view (cash book / P&L),
            // hr.*, users.manage, audit.view.
        ]);
    }
}
