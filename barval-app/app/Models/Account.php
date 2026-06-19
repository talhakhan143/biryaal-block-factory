<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Account extends Model
{
    use HasUuids;

    protected $fillable = [
        'code', 'name', 'type', 'normal_balance', 'is_system',
    ];

    protected $casts = [
        'is_system' => 'boolean',
    ];

    // Well-known account codes used by the ledger engine.
    public const CASH = '1000';
    public const BANK = '1010';
    public const RECEIVABLE = '1100';
    public const INVENTORY = '1200';
    public const PAYABLE = '2000';
    public const TRANSPORT_CLEARING = '2100'; // freight collected from customer, paid to driver (pass-through)
    public const CAPITAL = '3000';
    public const SALES = '4000';
    public const OTHER_INCOME = '4100';
    public const EXPENSE = '5000';

    public function lines(): HasMany
    {
        return $this->hasMany(JournalLine::class);
    }

    /** Net balance in paisa, respecting the account's normal side. */
    public function balance(): int
    {
        $debit = (int) $this->lines()->sum('debit');
        $credit = (int) $this->lines()->sum('credit');

        return $this->normal_balance === 'debit'
            ? $debit - $credit
            : $credit - $debit;
    }
}
