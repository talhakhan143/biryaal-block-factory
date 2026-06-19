<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\JournalLine;
use Illuminate\Http\Request;

class AccountingController extends Controller
{
    /** Trial balance: debit/credit totals per account. Should net to zero. */
    public function trialBalance()
    {
        $accounts = Account::orderBy('code')->get()->map(function (Account $a) {
            $debit = (int) $a->lines()->sum('debit');
            $credit = (int) $a->lines()->sum('credit');

            return [
                'code' => $a->code,
                'name' => $a->name,
                'type' => $a->type,
                'debit' => $debit,
                'credit' => $credit,
                'balance' => $a->normal_balance === 'debit' ? $debit - $credit : $credit - $debit,
            ];
        });

        return response()->json([
            'rows' => $accounts,
            'total_debit' => (int) $accounts->sum('debit'),
            'total_credit' => (int) $accounts->sum('credit'),
            'balanced' => $accounts->sum('debit') === $accounts->sum('credit'),
        ]);
    }

    /** Profit & Loss for a period: income - expenses. */
    public function profitLoss(Request $request)
    {
        $income = $this->net(Account::SALES, $request, 'credit');
        $expense = $this->net(Account::EXPENSE, $request, 'debit');

        return response()->json([
            'from' => $request->from,
            'to' => $request->to,
            'income' => $income,
            'expense' => $expense,
            'profit' => $income - $expense,
        ]);
    }

    /** Detailed ledger for a single account. */
    public function accountLedger(string $code, Request $request)
    {
        $account = Account::where('code', $code)->firstOrFail();

        $lines = JournalLine::with('entry')
            ->where('account_id', $account->id)
            ->whereHas('entry', function ($q) use ($request) {
                $q->when($request->from, fn ($q, $d) => $q->whereDate('entry_date', '>=', $d))
                    ->when($request->to, fn ($q, $d) => $q->whereDate('entry_date', '<=', $d));
            })
            ->get()
            ->sortBy(fn ($l) => $l->entry->entry_date->timestamp)
            ->map(fn (JournalLine $l) => [
                'date' => $l->entry->entry_date->toDateString(),
                'reference' => $l->entry->reference,
                'description' => $l->entry->description,
                'debit' => (int) $l->debit,
                'credit' => (int) $l->credit,
            ])->values();

        return response()->json([
            'account' => ['code' => $account->code, 'name' => $account->name],
            'rows' => $lines,
        ]);
    }

    private function net(string $code, Request $request, string $side): int
    {
        $account = Account::where('code', $code)->first();
        if (! $account) {
            return 0;
        }

        $query = $account->lines()
            ->whereHas('entry', function ($q) use ($request) {
                $q->when($request->from, fn ($q, $d) => $q->whereDate('entry_date', '>=', $d))
                    ->when($request->to, fn ($q, $d) => $q->whereDate('entry_date', '<=', $d));
            });

        return $side === 'credit'
            ? (int) $query->sum('credit') - (int) $query->sum('debit')
            : (int) $query->sum('debit') - (int) $query->sum('credit');
    }
}
