<?php

namespace App\Services\Accounting;

use App\Models\Account;

/**
 * Maps a payment method to the ledger account CODE that the money hits.
 * cash -> Cash in Hand, bank -> Bank. The specific bank/cheque is just
 * recorded as free text (bank_ref) on the transaction, not a managed account.
 */
class CashAccountResolver
{
    public static function code(?string $method): string
    {
        return ($method ?? 'cash') === 'bank' ? Account::BANK : Account::CASH;
    }
}
