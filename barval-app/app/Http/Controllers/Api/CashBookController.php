<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\JournalLine;
use Illuminate\Http\Request;

class CashBookController extends Controller
{
    /**
     * Cash & bank movement with running balance.
     * A debit to cash/bank is money IN, a credit is money OUT.
     */
    public function index(Request $request)
    {
        $codes = [Account::CASH, Account::BANK];
        $accountIds = Account::whereIn('code', $codes)->pluck('id');

        // opening balance before the from-date
        $opening = 0;
        if ($request->from) {
            $rows = JournalLine::whereIn('account_id', $accountIds)
                ->whereHas('entry', fn ($q) => $q->whereDate('entry_date', '<', $request->from))
                ->selectRaw('COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c')
                ->first();
            $opening = (int) $rows->d - (int) $rows->c;
        }

        $lines = JournalLine::query()
            ->with('entry')
            ->whereIn('account_id', $accountIds)
            ->whereHas('entry', function ($q) use ($request) {
                $q->when($request->from, fn ($q, $d) => $q->whereDate('entry_date', '>=', $d))
                    ->when($request->to, fn ($q, $d) => $q->whereDate('entry_date', '<=', $d));
            })
            ->get()
            ->sortBy(fn ($l) => $l->entry->entry_date->timestamp.$l->created_at->timestamp)
            ->values();

        $balance = $opening;
        $rows = $lines->map(function (JournalLine $line) use (&$balance) {
            $in = (int) $line->debit;
            $out = (int) $line->credit;
            $balance += $in - $out;

            return [
                'date' => $line->entry->entry_date->toDateString(),
                'reference' => $line->entry->reference,
                'description' => $line->entry->description,
                'in' => $in,
                'out' => $out,
                'balance' => $balance,
            ];
        });

        return response()->json([
            'opening' => $opening,
            'closing' => $balance,
            'total_in' => (int) $rows->sum('in'),
            'total_out' => (int) $rows->sum('out'),
            'rows' => $rows,
        ]);
    }
}
