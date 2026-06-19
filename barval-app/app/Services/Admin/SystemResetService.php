<?php

namespace App\Services\Admin;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Hard "factory reset" for the Super Admin: wipes ALL business/test data so a
 * client can start on a clean slate after a demo.
 *
 * KEPT (never touched): users, roles, permissions, personal access tokens
 * (so nobody is logged out), and the chart of accounts structure. Because every
 * account balance is derived from journal_lines, deleting the journals alone
 * resets all balances to zero — the account rows themselves stay intact.
 */
class SystemResetService
{
    /**
     * Order is leaf-first, but FK checks are disabled during the wipe so the
     * exact order does not actually matter — listed logically for clarity.
     */
    private const TABLES = [
        // Sales side
        'sale_items', 'sales',
        'sales_return_items', 'sales_returns',
        'dispatch_items', 'dispatches',
        // Money
        'payments', 'expenses', 'adjustments',
        // Purchases / stock
        'material_purchases',
        'production_batches',
        'stock_movements',
        'finished_goods_stock',
        // Transport
        'transport_trips', 'vehicles', 'drivers',
        // People / HR
        'attendances', 'salaries', 'staff', 'labourers',
        // Master parties / catalog (test data)
        'customers', 'suppliers', 'products', 'raw_materials',
        // Ledger backbone — clearing this zeroes every account balance
        'journal_lines', 'journal_entries',
        // Misc
        'audits',
        // Document numbering — restart from 1
        'sequences',
    ];

    public function reset(): array
    {
        $wiped = [];

        Schema::disableForeignKeyConstraints();
        try {
            foreach (self::TABLES as $table) {
                if (Schema::hasTable($table)) {
                    DB::table($table)->truncate();
                    $wiped[] = $table;
                }
            }
        } finally {
            Schema::enableForeignKeyConstraints();
        }

        return $wiped;
    }
}
