<?php

namespace App\Services\Accounting;

use App\Models\Account;
use App\Models\JournalLine;
use Illuminate\Support\Collection;

/**
 * One party's running statement, read straight off the ledger.
 *
 * Customers, suppliers and drivers all carry a `balance` column, and in all
 * three cases the documents behind it keep changing after the fact: a lump
 * receipt is spread back over open invoices, a lump payment over open bills,
 * a driver payment over open trips. So `paid` columns are a moving snapshot
 * and adding them up double counts the same money.
 *
 * A journal line is written once and never moves. So every statement in the
 * app is built the same way: take the party's own documents, pull the lines
 * they posted to their control account, and run a total down the page. The
 * last running figure must equal the stored balance.
 *
 * `$docs` maps a model class to [row label, (id => human reference)].
 */
class PartyStatement
{
    /**
     * @param  array<class-string,array{0:string,1:Collection}>  $docs
     * @param  'debit'|'credit'  $increases  which side grows this party's balance
     * @return array<int,array<string,mixed>>
     */
    public function rows(string $accountCode, array $docs, string $increases, array $settledAtOnce = []): array
    {
        $rows = $this->lines([$accountCode], $docs, 'entry:id,reference,entry_date,description,source_type,source_id,created_at')
            ->filter(fn (JournalLine $l) => $l->entry !== null)
            ->map(function (JournalLine $line) use ($docs) {
                $entry = $line->entry;
                [$type, $refs] = $docs[$entry->source_type] ?? ['other', collect()];

                return [
                    'date' => $entry->entry_date?->toDateString(),
                    'at' => $entry->created_at?->format('YmdHisu'),
                    'type' => $type,
                    'reference' => $refs->get($entry->source_id) ?? $entry->reference,
                    'journal_ref' => $entry->reference,
                    'description' => $entry->description,
                    'debit' => (int) $line->debit,
                    'credit' => (int) $line->credit,
                    'link_id' => $entry->source_id,
                ];
            })
            // Jo sauda mauqe par hi poora chuk gaya (cash bikri, cash khareed,
            // wahin ada kiya gaya kiraya) us ka control account par koi line
            // banti hi nahi. Phir bhi wo is bande ke sath hua kaam hai, is liye
            // khate me usay dono taraf barabar likh dete hain: baqi par asar
            // sifar, magar nazar se ghayab bhi nahi.
            ->concat($settledAtOnce)
            // Date pehle, phir jis tarteeb se post hui. Aik hi din ki rows bhi
            // stable rahen is liye dono ko jorh kar sort karte hain.
            ->sortBy(fn (array $r) => $r['date'].'|'.$r['at'])
            ->values();

        $running = 0;

        return $rows->map(function (array $row) use (&$running, $increases) {
            $running += $increases === 'credit'
                ? $row['credit'] - $row['debit']
                : $row['debit'] - $row['credit'];
            $row['running'] = $running;
            unset($row['at']);

            return $row;
        })->all();
    }

    /**
     * Net movement on the given accounts caused by this party's documents.
     *
     * @param  string[]  $codes
     * @param  array<class-string,array{0:string,1:Collection}>  $docs
     * @param  'debit'|'credit'  $side  which side to report as positive
     */
    public function net(array $codes, array $docs, string $side = 'debit'): int
    {
        $lines = $this->lines($codes, $docs);
        $debit = (int) $lines->sum('debit');
        $credit = (int) $lines->sum('credit');

        return $side === 'credit' ? $credit - $debit : $debit - $credit;
    }

    /**
     * @param  string[]  $codes
     * @param  array<class-string,array{0:string,1:Collection}>  $docs
     * @return Collection<int,JournalLine>
     */
    public function lines(array $codes, array $docs, ?string $with = null): Collection
    {
        $accounts = Account::whereIn('code', $codes)->pluck('id');
        $live = array_filter($docs, fn (array $d) => $d[1]->isNotEmpty());
        if ($accounts->isEmpty() || $live === []) {
            return collect();
        }

        return JournalLine::query()
            ->when($with, fn ($q, $w) => $q->with($w))
            ->whereIn('account_id', $accounts)
            ->where(function ($q) use ($live) {
                foreach ($live as $class => [, $ids]) {
                    $q->orWhereHas('entry', fn ($e) => $e->where('source_type', $class)->whereIn('source_id', $ids->keys()));
                }
            })
            ->get();
    }
}
