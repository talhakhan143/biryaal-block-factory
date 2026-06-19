<?php

namespace App\Services\Payments;

use App\Models\Account;
use App\Models\Customer;
use App\Models\Driver;
use App\Models\MaterialPurchase;
use App\Models\Payment;
use App\Models\Sale;
use App\Models\Supplier;
use App\Models\TransportTrip;
use App\Services\Accounting\CashAccountResolver;
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
                'bank_ref' => $data['bank_ref'] ?? null,
                'notes' => $data['notes'] ?? null,
                'created_by' => Auth::id(),
            ]);

            $customer->decrement('balance', $amount);

            // A customer's dues are the sum of their unpaid sale invoices. Spread
            // this receipt across those invoices (oldest first) so the Sales tab
            // stays in sync with the customer's balance.
            $this->allocateToCustomerSales($customer, $amount);

            $cashAccount = CashAccountResolver::code($data['method'] ?? 'cash');
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
                'bank_ref' => $data['bank_ref'] ?? null,
                'notes' => $data['notes'] ?? null,
                'created_by' => Auth::id(),
            ]);

            $supplier->decrement('balance', $amount);

            // Spread this payment across the supplier's unpaid purchase bills
            // (oldest first) so the Purchases tab stays in sync.
            $this->allocateToSupplierPurchases($supplier, $amount);

            $cashAccount = CashAccountResolver::code($data['method'] ?? 'cash');
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
     * Pay against a specific purchase bill: settles the supplier and updates
     * this purchase's paid_amount / payment_status. Dr Payable, Cr Cash/Bank.
     *
     * @param  array{amount:int,payment_date:string,method?:string,bank_ref?:string}  $data
     */
    public function payForPurchase(MaterialPurchase $purchase, array $data): Payment
    {
        return DB::transaction(function () use ($purchase, $data) {
            $remaining = (int) $purchase->total_cost - (int) $purchase->paid_amount;
            $amount = min((int) $data['amount'], $remaining);
            $this->assertPositive($amount);

            $supplier = $purchase->supplier;
            $payment = Payment::create([
                'reference' => Sequence::next('PAY'),
                'direction' => Payment::PAYMENT,
                'party_type' => $supplier->getMorphClass(),
                'party_id' => $supplier->id,
                'payment_date' => $data['payment_date'],
                'amount' => $amount,
                'method' => $data['method'] ?? 'cash',
                'bank_ref' => $data['bank_ref'] ?? null,
                'allocatable_type' => $purchase->getMorphClass(),
                'allocatable_id' => $purchase->id,
                'created_by' => Auth::id(),
            ]);

            $paid = (int) $purchase->paid_amount + $amount;
            $purchase->update([
                'paid_amount' => $paid,
                'payment_status' => $paid >= (int) $purchase->total_cost ? 'paid' : 'partial',
            ]);
            $supplier->decrement('balance', $amount);

            $cashAccount = CashAccountResolver::code($data['method'] ?? 'cash');
            $this->ledger->post(
                $data['payment_date'],
                "Payment {$payment->reference} for {$purchase->reference}",
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
     * Receive payment against a specific sale invoice: updates the sale's
     * paid/balance/status and the customer. Dr Cash/Bank, Cr Receivable.
     *
     * @param  array{amount:int,payment_date:string,method?:string,bank_ref?:string}  $data
     */
    public function receiveForSale(Sale $sale, array $data): Payment
    {
        return DB::transaction(function () use ($sale, $data) {
            $amount = min((int) $data['amount'], (int) $sale->balance);
            $this->assertPositive($amount);

            $customer = $sale->customer;
            $payment = Payment::create([
                'reference' => Sequence::next('PAY'),
                'direction' => Payment::RECEIPT,
                'party_type' => $customer?->getMorphClass(),
                'party_id' => $customer?->id,
                'payment_date' => $data['payment_date'],
                'amount' => $amount,
                'method' => $data['method'] ?? 'cash',
                'bank_ref' => $data['bank_ref'] ?? null,
                'allocatable_type' => $sale->getMorphClass(),
                'allocatable_id' => $sale->id,
                'created_by' => Auth::id(),
            ]);

            $paid = (int) $sale->paid + $amount;
            $sale->update([
                'paid' => $paid,
                'balance' => (int) $sale->total - $paid,
                'status' => $paid >= (int) $sale->total ? 'paid' : 'partial',
            ]);
            $customer?->decrement('balance', $amount);

            $cashAccount = CashAccountResolver::code($data['method'] ?? 'cash');
            $this->ledger->post(
                $data['payment_date'],
                "Receipt {$payment->reference} for {$sale->invoice_no}",
                [
                    ['account' => $cashAccount, 'debit' => $amount],
                    ['account' => Account::RECEIVABLE, 'credit' => $amount, 'memo' => $customer?->name],
                ],
                $payment,
            );

            return $payment;
        });
    }

    /**
     * Pay a specific transport trip's fare to its driver: updates the trip's
     * paid/balance and the driver's dues. Dr Payable, Cr Cash/Bank.
     *
     * @param  array{amount:int,payment_date:string,method?:string,bank_ref?:string}  $data
     */
    public function payForTrip(TransportTrip $trip, array $data): Payment
    {
        return DB::transaction(function () use ($trip, $data) {
            $amount = min((int) $data['amount'], (int) $trip->balance);
            $this->assertPositive($amount);

            $driver = $trip->driver;
            $payment = Payment::create([
                'reference' => Sequence::next('PAY'),
                'direction' => Payment::PAYMENT,
                'party_type' => $driver?->getMorphClass(),
                'party_id' => $driver?->id,
                'payment_date' => $data['payment_date'],
                'amount' => $amount,
                'method' => $data['method'] ?? 'cash',
                'bank_ref' => $data['bank_ref'] ?? null,
                'allocatable_type' => $trip->getMorphClass(),
                'allocatable_id' => $trip->id,
                'created_by' => Auth::id(),
            ]);

            $paid = (int) $trip->paid + $amount;
            $trip->update([
                'paid' => $paid,
                'balance' => (int) $trip->rate - $paid,
                'status' => $paid >= (int) $trip->rate ? 'paid' : 'partial',
            ]);
            $driver?->decrement('balance', $amount);

            $cashAccount = CashAccountResolver::code($data['method'] ?? 'cash');
            $this->ledger->post(
                $data['payment_date'],
                "Payment {$payment->reference} for trip {$trip->reference}",
                [
                    ['account' => Account::PAYABLE, 'debit' => $amount, 'memo' => $driver?->name ?? 'Driver'],
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
                'bank_ref' => $data['bank_ref'] ?? null,
                'notes' => $data['notes'] ?? null,
                'created_by' => Auth::id(),
            ]);

            $party->decrement('balance', $amount);

            // A driver's dues are the sum of their unpaid transport trips. Spread
            // this payment across those trips (oldest first) so the Transport tab
            // stays in sync with the driver's balance.
            if ($party instanceof Driver) {
                $this->allocateToDriverTrips($party, $amount);
            }

            $cashAccount = CashAccountResolver::code($data['method'] ?? 'cash');
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

    /**
     * Apply a lump driver payment to their open trips (oldest first), updating
     * each trip's paid/balance/status until the amount is consumed.
     */
    private function allocateToDriverTrips(Driver $driver, int $amount): void
    {
        $remaining = $amount;

        $trips = TransportTrip::where('driver_id', $driver->getKey())
            ->where('balance', '>', 0)
            ->orderBy('trip_date')
            ->orderBy('created_at')
            ->get();

        foreach ($trips as $trip) {
            if ($remaining <= 0) {
                break;
            }

            $apply = min($remaining, (int) $trip->balance);
            $paid = (int) $trip->paid + $apply;

            $trip->update([
                'paid' => $paid,
                'balance' => (int) $trip->rate - $paid,
                'status' => $paid >= (int) $trip->rate ? 'paid' : ($paid > 0 ? 'partial' : 'unpaid'),
            ]);

            $remaining -= $apply;
        }
    }

    /** Apply a lump customer receipt to their open sale invoices (oldest first). */
    private function allocateToCustomerSales(Customer $customer, int $amount): void
    {
        $remaining = $amount;

        $sales = Sale::where('customer_id', $customer->getKey())
            ->where('balance', '>', 0)
            ->orderBy('sale_date')
            ->orderBy('created_at')
            ->get();

        foreach ($sales as $sale) {
            if ($remaining <= 0) {
                break;
            }

            $apply = min($remaining, (int) $sale->balance);
            $paid = (int) $sale->paid + $apply;

            $sale->update([
                'paid' => $paid,
                'balance' => (int) $sale->total - $paid,
                'status' => $paid >= (int) $sale->total ? 'paid' : ($paid > 0 ? 'partial' : 'unpaid'),
            ]);

            $remaining -= $apply;
        }
    }

    /** Apply a lump supplier payment to their open purchase bills (oldest first). */
    private function allocateToSupplierPurchases(Supplier $supplier, int $amount): void
    {
        $remaining = $amount;

        $purchases = MaterialPurchase::where('supplier_id', $supplier->getKey())
            ->whereColumn('paid_amount', '<', 'total_cost')
            ->orderBy('purchase_date')
            ->orderBy('created_at')
            ->get();

        foreach ($purchases as $purchase) {
            if ($remaining <= 0) {
                break;
            }

            $due = (int) $purchase->total_cost - (int) $purchase->paid_amount;
            $apply = min($remaining, $due);
            $paid = (int) $purchase->paid_amount + $apply;

            $purchase->update([
                'paid_amount' => $paid,
                'payment_status' => $paid >= (int) $purchase->total_cost ? 'paid' : ($paid > 0 ? 'partial' : 'unpaid'),
            ]);

            $remaining -= $apply;
        }
    }

    private function assertPositive(int $amount): void
    {
        if ($amount <= 0) {
            throw new InvalidArgumentException('Payment amount must be positive.');
        }
    }
}
