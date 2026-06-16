<?php

namespace App\Services\Payroll;

use App\Models\Account;
use App\Models\Payment;
use App\Models\Salary;
use App\Models\Staff;
use App\Services\Accounting\LedgerService;
use App\Support\Sequence;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class PayrollService
{
    public function __construct(private LedgerService $ledger) {}

    /**
     * Accrue a monthly salary as a payable (Dr Expense, Cr Payable).
     *
     * @param  array{staff_id:string,month:string,amount?:int,notes?:string}  $data
     */
    public function generate(array $data): Salary
    {
        return DB::transaction(function () use ($data) {
            $staff = Staff::findOrFail($data['staff_id']);

            if (Salary::where('staff_id', $staff->id)->where('month', $data['month'])->exists()) {
                throw new InvalidArgumentException('Salary already generated for this month.');
            }

            $amount = (int) ($data['amount'] ?? $staff->monthly_salary);

            $salary = Salary::create([
                'reference' => Sequence::next('SAL'),
                'staff_id' => $staff->id,
                'month' => $data['month'],
                'amount' => $amount,
                'paid' => 0,
                'balance' => $amount,
                'status' => 'unpaid',
                'notes' => $data['notes'] ?? null,
                'created_by' => Auth::id(),
            ]);

            $this->ledger->post(
                $data['month'].'-01',
                "Salary {$salary->reference} - {$staff->name} ({$data['month']})",
                [
                    ['account' => Account::EXPENSE, 'debit' => $amount, 'memo' => 'Staff salary'],
                    ['account' => Account::PAYABLE, 'credit' => $amount, 'memo' => $staff->name],
                ],
                $salary,
            );

            return $salary;
        });
    }

    /**
     * Pay (part of) a salary: Dr Payable, Cr Cash/Bank.
     *
     * @param  array{amount:int,payment_date:string,method?:string}  $data
     */
    public function pay(Salary $salary, array $data): Payment
    {
        return DB::transaction(function () use ($salary, $data) {
            $amount = (int) $data['amount'];
            if ($amount <= 0) {
                throw new InvalidArgumentException('Amount must be positive.');
            }
            if ($amount > $salary->balance) {
                throw new InvalidArgumentException('Amount exceeds outstanding salary balance.');
            }

            $staff = $salary->staff;
            $payment = Payment::create([
                'reference' => Sequence::next('PAY'),
                'direction' => Payment::PAYMENT,
                'party_type' => $staff->getMorphClass(),
                'party_id' => $staff->id,
                'payment_date' => $data['payment_date'],
                'amount' => $amount,
                'method' => $data['method'] ?? 'cash',
                'allocatable_type' => $salary->getMorphClass(),
                'allocatable_id' => $salary->id,
                'created_by' => Auth::id(),
            ]);

            $paid = $salary->paid + $amount;
            $salary->update([
                'paid' => $paid,
                'balance' => $salary->amount - $paid,
                'status' => $paid >= $salary->amount ? 'paid' : 'partial',
            ]);

            $cashAccount = ($data['method'] ?? 'cash') === 'bank' ? Account::BANK : Account::CASH;
            $this->ledger->post(
                $data['payment_date'],
                "Salary payment {$payment->reference} - {$staff->name}",
                [
                    ['account' => Account::PAYABLE, 'debit' => $amount, 'memo' => $staff->name],
                    ['account' => $cashAccount, 'credit' => $amount],
                ],
                $payment,
            );

            return $payment;
        });
    }
}
