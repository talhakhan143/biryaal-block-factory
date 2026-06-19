<?php

namespace App\Services\Accounting;

use App\Models\Account;
use App\Models\JournalEntry;
use App\Support\Sequence;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Posts balanced double-entry journal entries.
 *
 * Every money event in the system (purchase, sale, payment, expense)
 * routes through post(). Debits must equal credits or the post is rejected,
 * which guarantees the trial balance always balances.
 */
class LedgerService
{
    /** @var array<string,string> cache of account code => id */
    private array $accountIds = [];

    /**
     * @param  array<int,array{account:string,debit?:int,credit?:int,memo?:string}>  $lines
     */
    public function post(string $date, string $description, array $lines, ?Model $source = null): JournalEntry
    {
        $totalDebit = 0;
        $totalCredit = 0;

        foreach ($lines as $line) {
            $totalDebit += (int) ($line['debit'] ?? 0);
            $totalCredit += (int) ($line['credit'] ?? 0);
        }

        if ($totalDebit !== $totalCredit) {
            throw new InvalidArgumentException(
                "Unbalanced journal entry: debit {$totalDebit} != credit {$totalCredit}"
            );
        }

        if ($totalDebit === 0) {
            throw new InvalidArgumentException('Journal entry has zero value.');
        }

        return DB::transaction(function () use ($date, $description, $lines, $source) {
            $entry = JournalEntry::create([
                'reference' => Sequence::next('JE'),
                'entry_date' => $date,
                'description' => $description,
                'source_type' => $source?->getMorphClass(),
                'source_id' => $source?->getKey(),
                'created_by' => Auth::id(),
            ]);

            foreach ($lines as $line) {
                $entry->lines()->create([
                    'account_id' => $this->accountId($line['account']),
                    'debit' => (int) ($line['debit'] ?? 0),
                    'credit' => (int) ($line['credit'] ?? 0),
                    'memo' => $line['memo'] ?? null,
                ]);
            }

            return $entry;
        });
    }

    /** Resolve an account UUID from its well-known code. */
    private function accountId(string $code): string
    {
        if (! isset($this->accountIds[$code])) {
            $account = Account::where('code', $code)->first();

            if (! $account) {
                throw new InvalidArgumentException("Unknown account code: {$code}");
            }

            $this->accountIds[$code] = $account->id;
        }

        return $this->accountIds[$code];
    }
}
