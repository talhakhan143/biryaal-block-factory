<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\JournalLine;
use App\Support\Search;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CashBookController extends Controller
{
    /**
     * Cash & bank movement with running balance.
     * A debit to cash/bank is money IN, a credit is money OUT.
     *
     * Rows purane se naye ki tarteeb me aate hain aur page by page milte hain.
     * Har page ka balance us page se pehle wali saari entries ka jor laga kar
     * shuru hota hai, is liye page 2 ka pehla balance bhi sahi khata wala hota
     * hai. Search lagate hi balance sirf milne wali entries ka jor reh jata
     * hai, asli khata ka balance nahi, is liye `running_balance_exact` false
     * aa jata hai aur screen par usay running balance keh kar dikhana ghalat
     * hoga.
     */
    public function index(Request $request)
    {
        $accountIds = Account::whereIn('code', [Account::CASH, Account::BANK])->pluck('id');

        $cashLines = fn () => JournalLine::query()
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_lines.journal_entry_id')
            ->whereIn('journal_lines.account_id', $accountIds);

        $dated = function () use ($request, $cashLines) {
            return $cashLines()
                ->when($request->from, fn ($q, $d) => $q->whereDate('journal_entries.entry_date', '>=', $d))
                ->when($request->to, fn ($q, $d) => $q->whereDate('journal_entries.entry_date', '<=', $d));
        };

        $filtered = function () use ($request, $dated) {
            return $dated()
                ->when($request->search, function ($q, $s) {
                    $like = Search::like((string) $s);
                    $q->where(fn ($q) => $q
                        ->where('journal_entries.reference', 'like', $like)
                        ->orWhere('journal_entries.description', 'like', $like));
                });
        };

        // opening balance before the from-date (poora khata, search se bay-asar)
        $opening = 0;
        if ($request->from) {
            $before = $cashLines()
                ->whereDate('journal_entries.entry_date', '<', $request->from)
                ->selectRaw('COALESCE(SUM(journal_lines.debit),0) d, COALESCE(SUM(journal_lines.credit),0) c')
                ->first();
            $opening = (int) $before->d - (int) $before->c;
        }

        // Khate ka jorh search se bay-asar hai. Closing matlab "is arse ke
        // baad khate me kitna bacha", aur wo is baat par nahi badalta ke user
        // ne search box me kya likha. Warna search karte hi closing aik bay
        // matlab number ban jata hai.
        $bookSums = $dated()
            ->selectRaw('COALESCE(SUM(journal_lines.debit),0) d, COALESCE(SUM(journal_lines.credit),0) c')
            ->first();
        $totalIn = (int) $bookSums->d;
        $totalOut = (int) $bookSums->c;

        // Aur ye sirf un rows ka jorh jo search se match hui hain.
        $shown = $filtered()
            ->selectRaw('COALESCE(SUM(journal_lines.debit),0) d, COALESCE(SUM(journal_lines.credit),0) c')
            ->first();
        $shownIn = (int) $shown->d;
        $shownOut = (int) $shown->c;

        $perPage = max(1, $request->integer('per_page', 15));
        $page = max(1, $request->integer('page', 1));

        $ordered = fn () => $filtered()
            ->orderBy('journal_entries.entry_date')
            ->orderBy('journal_lines.created_at')
            ->orderBy('journal_lines.id');

        $skipped = DB::query()
            ->fromSub(
                $ordered()
                    ->select('journal_lines.debit as debit', 'journal_lines.credit as credit')
                    ->limit(($page - 1) * $perPage),
                'skipped'
            )
            ->selectRaw('COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c')
            ->first();
        $pageOpening = $opening + (int) $skipped->d - (int) $skipped->c;

        $paginator = $ordered()
            ->with('entry')
            ->select('journal_lines.*')
            ->paginate($perPage, ['*'], 'page', $page);

        $balance = $pageOpening;
        $rows = $paginator->getCollection()->map(function (JournalLine $line) use (&$balance) {
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
        })->values();

        return response()->json([
            'opening' => $opening,
            'closing' => $opening + $totalIn - $totalOut,
            'total_in' => $totalIn,
            'total_out' => $totalOut,
            // Search lagi ho to ye un rows ka jorh hai jo neeche dikh rahi hain.
            'shown_in' => $shownIn,
            'shown_out' => $shownOut,
            'page_opening' => $pageOpening,
            'running_balance_exact' => ! $request->search,
            'rows' => $rows,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }
}
