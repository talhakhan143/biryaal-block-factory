<?php

namespace App\Services\Payments;

use App\Models\Account;
use App\Models\Customer;
use App\Models\Payment;
use App\Models\Supplier;
use App\Services\Accounting\LedgerService;
use App\Support\Sequence;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class PaymentService
{
    public function __construct(private LedgerService $ledger) {}

    /**
     * Record money received from a customer (settles receivable).
     *
     * @param  array{customer_id:string,payment_date:string,amount:int,method?:string,notes?:string}  $data
     */
    public function receiveFromCustomer(array $data): Payment
    {
        return DB::transaction(function () use ($data) {
            $customer = Customer::findOrFail($data['customer_id']);
            $amount = (int) $data['amount'];
            $this->assertPositive($amount);

            $payment = Payment::create([
                'reference' => Sequence::next('PAY'),
                'direction' => Payment::RECEIPT,
                'party_type' => $customer->getMorphClass(),
                'party_id' => $customer->id,
                'payment_date' => $data['payment_date'],
                'amount' => $amount,
                'method' => $data['method'] ?? 'cash',
                'notes' => $data['notes'] ?? null,
                'created_by' => Auth::id(),
            ]);

            $customer->decrement('balance', $amount);

            $cashAccount = ($data['method'] ?? 'cash') === 'bank' ? Account::BANK : Account::CASH;
            $this->ledger->post(
                $data['payment_date'],
                "Receipt {$payment->reference} from {$customer->name}",
                [
                    ['account' => $cashAccount, 'debit' => $amount],
                    ['account' => Account::RECEIVABLE, 'credit' => $amount, 'memo' => $customer->name],
                ],
                $payment,
            );

            return $payment;
        });
    }

    /**
     * Record money paid to a supplier (settles payable).
     *
     * @param  array{supplier_id:string,payment_date:string,amount:int,method?:string,notes?:string}  $data
     */
    public function payToSupplier(array $data): Payment
    {
        return DB::transaction(function () use ($data) {
            $supplier = Supplier::findOrFail($data['supplier_id']);
            $amount = (int) $data['amount'];
            $this->assertPositive($amount);

            $payment = Payment::create([
                'reference' => Sequence::next('PAY'),
                'direction' => Payment::PAYMENT,
                'party_type' => $supplier->getMorphClass(),
                'party_id' => $supplier->id,
                'payment_date' => $data['payment_date'],
                'amount' => $amount,
                'method' => $data['method'] ?? 'cash',
                'notes' => $data['notes'] ?? null,
                'created_by' => Auth::id(),
            ]);

            $supplier->decrement('balance', $amount);

            $cashAccount = ($data['method'] ?? 'cash') === 'bank' ? Account::BANK : Account::CASH;
            $this->ledger->post(
                $data['payment_date'],
                "Payment {$payment->reference} to {$supplier->name}",
                [
                    ['account' => Account::PAYABLE, 'debit' => $amount, 'memo' => $supplier->name],
                    ['account' => $cashAccount, 'credit' => $amount],
                ],
                $payment,
            );

            return $payment;
        });
    }

    /**
     * Settle a payable owed to any party that carries a `balance` column
     * (e.g. Driver, Labourer). Dr Payable, Cr Cash/Bank.
     */
    public function settleParty(Model $party, array $data): Payment
    {
        return DB::transaction(function () use ($party, $data) {
            $amount = (int) $data['amount'];
            $this->assertPositive($amount);

            $payment = Payment::create([
                'reference' => Sequence::next('PAY'),
                'direction' => Payment::PAYMENT,
                'party_type' => $party->getMorphClass(),
                'party_id' => $party->getKey(),
                'payment_date' => $data['payment_date'],
                'amount' => $amount,
                'method' => $data['method'] ?? 'cash',
                'notes' => $data['notes'] ?? null,
                'created_by' => Auth::id(),
            ]);

            $party->decrement('balance', $amount);

            $cashAccount = ($data['method'] ?? 'cash') === 'bank' ? Account::BANK : Account::CASH;
            $name = $party->name ?? class_basename($party);
            $this->ledger->post(
                $data['payment_date'],
                "Payment {$payment->reference} to {$name}",
                [
                    ['account' => Account::PAYABLE, 'debit' => $amount, 'memo' => $name],
                    ['account' => $cashAccount, 'credit' => $amount],
                ],
                $payment,
            );

            return $payment;
        });
    }

    private function assertPositive(int $amount): void
    {
        if ($amount <= 0) {
            throw new InvalidArgumentException('Payment amount must be positive.');
        }
    }
}
