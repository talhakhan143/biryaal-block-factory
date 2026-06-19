<?php

namespace Database\Seeders;

use App\Models\Account;
use Illuminate\Database\Seeder;

class ChartOfAccountsSeeder extends Seeder
{
    public function run(): void
    {
        $accounts = [
            [Account::CASH, 'Cash in Hand', 'asset', 'debit'],
            [Account::BANK, 'Bank', 'asset', 'debit'],
            [Account::RECEIVABLE, 'Accounts Receivable', 'asset', 'debit'],
            [Account::INVENTORY, 'Inventory', 'asset', 'debit'],
            [Account::PAYABLE, 'Accounts Payable', 'liability', 'credit'],
            [Account::TRANSPORT_CLEARING, 'Transport Clearing (Freight)', 'liability', 'credit'],
            [Account::CAPITAL, 'Owner Capital', 'equity', 'credit'],
            [Account::SALES, 'Sales Revenue', 'income', 'credit'],
            [Account::OTHER_INCOME, 'Other Income / Adjustments', 'income', 'credit'],
            [Account::EXPENSE, 'Operating Expenses', 'expense', 'debit'],
        ];

        foreach ($accounts as [$code, $name, $type, $normal]) {
            Account::updateOrCreate(
                ['code' => $code],
                ['name' => $name, 'type' => $type, 'normal_balance' => $normal, 'is_system' => true],
            );
        }
    }
}
