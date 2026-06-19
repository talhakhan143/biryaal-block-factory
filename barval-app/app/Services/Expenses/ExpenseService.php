<?php

namespace App\Services\Expenses;

use App\Models\Account;
use App\Models\Expense;
use App\Services\Accounting\CashAccountResolver;
use App\Services\Accounting\LedgerService;
use App\Support\Sequence;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ExpenseService
{
    public function __construct(private LedgerService $ledger) {}

    /**
     * @param  array{expense_date:string,category:string,amount:int,method?:string,title:string,notes?:string}  $data
     */
    public function record(array $data): Expense
    {
        return DB::transaction(function () use ($data) {
            $expense = Expense::create([
                'reference' => Sequence::next('EXP'),
                'expense_date' => $data['expense_date'],
                'category' => $data['category'],
                'amount' => (int) $data['amount'],
                'method' => $data['method'] ?? 'cash',
                'bank_ref' => $data['bank_ref'] ?? null,
                'title' => $data['title'],
                'notes' => $data['notes'] ?? null,
                'created_by' => Auth::id(),
            ]);

            $cashAccount = CashAccountResolver::code($data['method'] ?? 'cash');
            $this->ledger->post(
                $data['expense_date'],
                "Expense {$expense->reference} - {$expense->title}",
                [
                    ['account' => Account::EXPENSE, 'debit' => $expense->amount, 'memo' => $expense->category],
                    ['account' => $cashAccount, 'credit' => $expense->amount],
                ],
                $expense,
            );

            return $expense;
        });
    }
}
