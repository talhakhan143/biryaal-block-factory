<?php

namespace App\Services\Accounting;

use App\Models\Account;
use App\Models\Adjustment;
use App\Models\Customer;
use App\Models\Supplier;
use App\Support\Sequence;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Manual adjustments — correct a customer/supplier balance (discount / extra
 * charge) or record a one-off cash in/out. Every mode posts a balanced journal
 * entry so the cash book, accounts and dashboard all stay in sync.
 */
class AdjustmentService
{
    public function __construct(private LedgerService $ledger) {}

    /**
     * @param  array{mode:string,party_id?:string,adjustment_date:string,amount:int,method?:string,bank_ref?:string,reason:string}  $data
     */
    public function create(array $data): Adjustment
    {
        $mode = $data['mode'];
        $amount = (int) $data['amount'];
        if ($amount <= 0) {
            throw new InvalidArgumentException('Amount must be positive.');
        }
        $date = $data['adjustment_date'];
        $reason = $data['reason'];

        return DB::transaction(function () use ($mode, $amount, $date, $reason, $data) {
            $party = null;
            $partyType = null;

            // resolve ledger legs + side effects per mode
            $cash = CashAccountResolver::code($data['method'] ?? 'cash');
            [$debit, $credit] = match ($mode) {
                'customer_discount' => [Account::EXPENSE, Account::RECEIVABLE],   // dues kam, loss
                'customer_charge' => [Account::RECEIVABLE, Account::OTHER_INCOME], // dues zyada, income
                'supplier_discount' => [Account::PAYABLE, Account::OTHER_INCOME],  // hum kam dein, income
                'supplier_charge' => [Account::EXPENSE, Account::PAYABLE],         // hum zyada dein, loss
                'cash_out' => [Account::EXPENSE, $cash],
                'cash_in' => [$cash, Account::OTHER_INCOME],
                default => throw new InvalidArgumentException("Unknown adjustment mode: {$mode}"),
            };

            // party balance side-effects
            if (str_starts_with($mode, 'customer_')) {
                $party = Customer::findOrFail($data['party_id']);
                $partyType = $party->getMorphClass();
                $party->increment('balance', $mode === 'customer_charge' ? $amount : -$amount);
            } elseif (str_starts_with($mode, 'supplier_')) {
                $party = Supplier::findOrFail($data['party_id']);
                $partyType = $party->getMorphClass();
                $party->increment('balance', $mode === 'supplier_charge' ? $amount : -$amount);
            }

            $adjustment = Adjustment::create([
                'reference' => Sequence::next('ADJ'),
                'mode' => $mode,
                'party_type' => $partyType,
                'party_id' => $party?->getKey(),
                'adjustment_date' => $date,
                'amount' => $amount,
                'method' => in_array($mode, ['cash_in', 'cash_out']) ? ($data['method'] ?? 'cash') : null,
                'bank_ref' => $data['bank_ref'] ?? null,
                'reason' => $reason,
                'created_by' => Auth::id(),
            ]);

            $this->ledger->post($date, "Adjustment {$adjustment->reference} - {$reason}", [
                ['account' => $debit, 'debit' => $amount, 'memo' => $reason],
                ['account' => $credit, 'credit' => $amount, 'memo' => $party?->name],
            ], $adjustment);

            return $adjustment;
        });
    }
}
