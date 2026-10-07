<?php

namespace App\Services\Expenses;

use App\Models\Account;
use App\Models\JournalLine;
use Illuminate\Support\Collection;

/**
 * Where the money actually went.
 *
 * The Expenses page only lists the `expenses` table, but that is not the whole
 * cost of running the factory: staff salaries, daily labour wages and some
 * manual adjustments also debit 5000 Operating Expenses and never appear there.
 * That gap is why a dashboard cost figure could never be explained from the
 * expenses list.
 *
 * This reads the ledger itself and groups 5000 by whatever posted it, so a new
 * cost source added later shows up here without this class changing.
 */
class CostSummaryService
{
    /** source_type (model class) => [label, roman-urdu hint, page to open]. */
    private const SOURCES = [
        'Expense' => ['Kharchay', 'Bijli, diesel, maintenance waghera', '/expenses'],
        'Salary' => ['Staff salary', 'Mahane ki tankhwah', '/staff'],
        'Attendance' => ['Mazdoori (labour)', 'Rozana hazri ki mazdoori', '/labour'],
        'Adjustment' => ['Manual adjustments', 'Haath se ki gayi cash-out ya discount entry', '/adjustments'],
    ];

    /**
     * Net debits on 5000 for a date range, split by the document that posted them.
     *
     * @return Collection<int,array<string,mixed>>
     */
    public function bySource(?string $from = null, ?string $to = null): Collection
    {
        $account = Account::where('code', Account::EXPENSE)->value('id');
        if (! $account) {
            return collect();
        }

        return JournalLine::query()
            ->selectRaw('journal_entries.source_type as source_type')
            ->selectRaw('COUNT(DISTINCT journal_entries.id) as entries')
            ->selectRaw('COALESCE(SUM(journal_lines.debit),0) - COALESCE(SUM(journal_lines.credit),0) as total')
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_lines.journal_entry_id')
            ->where('journal_lines.account_id', $account)
            ->when($from, fn ($q, $d) => $q->whereDate('journal_entries.entry_date', '>=', $d))
            ->when($to, fn ($q, $d) => $q->whereDate('journal_entries.entry_date', '<=', $d))
            ->groupBy('journal_entries.source_type')
            ->get()
            ->map(function ($row) {
                $base = class_basename((string) $row->source_type);
                [$label, $hint, $link] = self::SOURCES[$base] ?? [$base ?: 'Doosray', 'Ledger me seedhi entry', null];

                return [
                    'key' => $base ?: 'other',
                    'label' => $label,
                    'hint' => $hint,
                    'link' => $link,
                    'entries' => (int) $row->entries,
                    'total' => (int) $row->total,
                ];
            })
            ->filter(fn (array $r) => $r['total'] !== 0)
            ->sortByDesc('total')
            ->values();
    }
}
