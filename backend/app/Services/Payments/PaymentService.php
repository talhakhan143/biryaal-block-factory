<?php

namespace App\Services\Payments;

use App\Models\Account;
use App\Models\Customer;
use App\Models\Driver;
use App\Models\JournalEntry;
use App\Models\JournalLine;
use App\Models\MaterialPurchase;
use App\Models\Payment;
use App\Models\Sale;
use App\Models\Supplier;
use App\Models\TransportTrip;
use App\Services\Accounting\CashAccountResolver;
use App\Services\Accounting\LedgerService;
use App\Services\Sales\InvoiceAllocator;
use App\Support\Money;
use App\Support\Sequence;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

class PaymentService
{
    public function __construct(private LedgerService $ledger, private InvoiceAllocator $allocator) {}

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
            $this->assertWithinOutstanding($amount, (int) $customer->balance);

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
            $this->assertWithinOutstanding($amount, (int) $supplier->balance);

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
            // Kiraya driver ko gaya ho to wo supplier ke bill me nahi hai.
            $remaining = $purchase->supplierBill() - (int) $purchase->paid_amount;
            $amount = min((int) $data['amount'], $remaining);
            $this->assertPositive($amount);

            $supplier = $purchase->supplier;
            // Doosri layer: bill par baqi dikhe magar supplier ka khata saaf ho
            // to paisa bahar nahi jana chahiye.
            if ($amount > (int) $supplier->balance) {
                throw ValidationException::withMessages([
                    'amount' => 'Is supplier ka baqi sirf '.Money::format(max((int) $supplier->balance, 0)).' hai, us se zyada nahi diya ja sakta.',
                ]);
            }
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
                'payment_status' => $paid >= $purchase->supplierBill() ? 'paid' : 'partial',
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
            $this->assertWithinOutstanding($amount, (int) $party->balance);

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
     * Take an ADVANCE from a customer: paisa pehle, maal baad me.
     *
     * The customer's balance goes NEGATIVE, which is exactly what a credit
     * balance on the receivable control account means: we are holding their
     * money. Every later sale to them draws it down automatically, because a
     * sale debits the same account.
     *
     * Reference prefix is ADV so an advance is tellable from an ordinary
     * receipt anywhere it is listed, without a new column.
     *
     * @param  array{payment_date:string,amount:int,method?:string,bank_ref?:string,notes?:string}  $data
     */
    public function advanceFromCustomer(Customer $customer, array $data): Payment
    {
        return DB::transaction(function () use ($customer, $data) {
            $amount = (int) $data['amount'];
            $this->assertPositive($amount);

            $payment = Payment::create([
                'reference' => Sequence::next('ADV'),
                'direction' => Payment::RECEIPT,
                'party_type' => $customer->getMorphClass(),
                'party_id' => $customer->id,
                'payment_date' => $data['payment_date'],
                'amount' => $amount,
                'method' => $data['method'] ?? 'cash',
                'bank_ref' => $data['bank_ref'] ?? null,
                'notes' => trim('Advance. '.($data['notes'] ?? '')),
                'created_by' => Auth::id(),
            ]);

            // Minus balance = jo paisa hum ne pakad rakha hai.
            $customer->decrement('balance', $amount);

            // Agar is waqt koi bill khula para hai to advance usi par lagta hai,
            // warna customers.balance aur sales.balance alag alag kahani kehte
            // hain aur beech ka paisa na wasool hota hai na wapas.
            $this->allocator->rebuild($customer->refresh());

            $cashAccount = CashAccountResolver::code($data['method'] ?? 'cash');
            $this->ledger->post(
                $data['payment_date'],
                "Advance {$payment->reference} from {$customer->name}",
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
     * Pay an ADVANCE to a party that carries a `balance` column (Driver,
     * Labourer), money given before any dues exist. This intentionally drives
     * the balance NEGATIVE; that negative balance is the outstanding advance
     * (the party will work it off against future dues). It does NOT settle any
     * open trips. Same ledger posting as a normal payment: Dr Payable, Cr Cash.
     */
    public function advanceToParty(Model $party, array $data): Payment
    {
        return DB::transaction(function () use ($party, $data) {
            $amount = (int) $data['amount'];
            $this->assertPositive($amount);

            $name = $party->name ?? class_basename($party);
            $note = trim('Advance. '.($data['notes'] ?? ''), " .\t\n");

            $payment = Payment::create([
                'reference' => Sequence::next('PAY'),
                'direction' => Payment::PAYMENT,
                'party_type' => $party->getMorphClass(),
                'party_id' => $party->getKey(),
                'payment_date' => $data['payment_date'],
                'amount' => $amount,
                'method' => $data['method'] ?? 'cash',
                'bank_ref' => $data['bank_ref'] ?? null,
                'notes' => $note,
                'created_by' => Auth::id(),
            ]);

            // Negative balance = advance still to be worked off.
            $party->decrement('balance', $amount);

            $cashAccount = CashAccountResolver::code($data['method'] ?? 'cash');
            $this->ledger->post(
                $data['payment_date'],
                "Advance {$payment->reference} to {$name}",
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

        // Filter PHP me, SQL me nahi: jis purchase ka kiraya driver ko gaya hai
        // us ka supplier bill total_cost se kam hai, aur wo SQL column nahi.
        $purchases = MaterialPurchase::with('trip')
            ->where('supplier_id', $supplier->getKey())
            // supplierBill() hamesha total_cost se kam ya barabar hoti hai, is
            // liye ye sasta SQL filter kuch chhorta nahi, bas kaam ghata deta hai.
            ->whereColumn('paid_amount', '<', 'total_cost')
            ->orderBy('purchase_date')
            ->orderBy('created_at')
            ->get()
            ->filter(fn (MaterialPurchase $p) => (int) $p->paid_amount < $p->supplierBill());

        foreach ($purchases as $purchase) {
            if ($remaining <= 0) {
                break;
            }

            $bill = $purchase->supplierBill();
            $due = $bill - (int) $purchase->paid_amount;
            $apply = min($remaining, $due);
            $paid = (int) $purchase->paid_amount + $apply;

            $purchase->update([
                'paid_amount' => $paid,
                'payment_status' => $paid >= $bill ? 'paid' : ($paid > 0 ? 'partial' : 'unpaid'),
            ]);

            $remaining -= $apply;
        }
    }

    /**
     * Galat likhi hui payment ko wapas lena (rollback).
     *
     * Usool wahi hai jo baqi jagah hai: andaza mat lagao, khate se parho. Is
     * payment ne party ke control account par jitna paisa hilaya tha utna hi
     * wapas chadha dete hain, phir uski journal entry hata dete hain. Customer
     * ka hisaab allocator khud dobara bana leta hai, is liye jo bills is paise
     * se chuk gaye the wo wapas khul jate hain.
     *
     * Payment ka apna record Auditable hai, is liye kis ne kab rollback kiya
     * wo audit log me mehfooz reh jata hai.
     */
    public function reverse(Payment $payment): void
    {
        DB::transaction(function () use ($payment) {
            if ($payment->allocatable_id) {
                throw new InvalidArgumentException(
                    'Ye paisa kisi aik bill ke sath juda hua hai, is liye yahan se wapas nahi hota. Usi bill par ja kar handle karein.'
                );
            }

            $party = $payment->party;
            if (! $party) {
                throw new InvalidArgumentException('Is payment ka banda hi nahi mila, rollback nahi ho sakta.');
            }

            $lines = JournalLine::query()
                ->with('account')
                ->whereHas('entry', fn ($q) => $q
                    ->where('source_type', $payment->getMorphClass())
                    ->where('source_id', $payment->id))
                ->get();

            // Customer ka hisaab 1100 par chalta hai, baqi sab ka 2000 par.
            // Dono soorat me party ka balance utna hi NEECHE gaya tha jitna
            // control account par hila, is liye wapas utna hi upar chadhega.
            $isCustomer = $party instanceof Customer;
            $code = $isCustomer ? Account::RECEIVABLE : Account::PAYABLE;
            $moved = (int) $lines
                ->filter(fn (JournalLine $l) => $l->account?->code === $code)
                ->sum(fn (JournalLine $l) => $isCustomer
                    ? (int) $l->credit - (int) $l->debit
                    : (int) $l->debit - (int) $l->credit);

            if ($moved !== 0) {
                $party->increment('balance', $moved);
            }

            JournalEntry::where('source_type', $payment->getMorphClass())
                ->where('source_id', $payment->id)
                ->get()
                ->each(function (JournalEntry $entry) {
                    $entry->lines()->delete();
                    $entry->delete();
                });

            $payment->delete();

            if ($isCustomer) {
                $this->allocator->rebuild($party->refresh());
            }
        });
    }

    /**
     * Galat rakam ya galat tareekh theek karna.
     *
     * Rollback karke dobara likhne ke bajae wahi record badalte hain, taake
     * parchi ka reference wahi rahe jo bande ko pehle de diya gaya tha. Andar
     * se kaam wahi hota hai: purana asar hata kar naya lagana.
     *
     * @param  array{payment_date?:string,amount?:int,method?:string,bank_ref?:string,notes?:string}  $data
     */
    public function update(Payment $payment, array $data): Payment
    {
        return DB::transaction(function () use ($payment, $data) {
            if ($payment->allocatable_id) {
                throw new InvalidArgumentException(
                    'Ye paisa kisi aik bill ke sath juda hua hai, is liye yahan se badla nahi ja sakta. Usi bill par ja kar handle karein.'
                );
            }

            $party = $payment->party;
            if (! $party) {
                throw new InvalidArgumentException('Is payment ka banda hi nahi mila, tabdeeli nahi ho sakti.');
            }

            $amount = (int) ($data['amount'] ?? $payment->amount);
            $this->assertPositive($amount);

            $date = $data['payment_date'] ?? $payment->payment_date->toDateString();
            $method = $data['method'] ?? $payment->method;
            $isCustomer = $party instanceof Customer;

            $lines = JournalLine::query()
                ->with('account')
                ->whereHas('entry', fn ($q) => $q
                    ->where('source_type', $payment->getMorphClass())
                    ->where('source_id', $payment->id))
                ->get();
            $code = $isCustomer ? Account::RECEIVABLE : Account::PAYABLE;
            $moved = (int) $lines
                ->filter(fn (JournalLine $l) => $l->account?->code === $code)
                ->sum(fn (JournalLine $l) => $isCustomer
                    ? (int) $l->credit - (int) $l->debit
                    : (int) $l->debit - (int) $l->credit);

            $entries = JournalEntry::where('source_type', $payment->getMorphClass())
                ->where('source_id', $payment->id)
                ->get();
            $description = $entries->first()?->description ?? "Payment {$payment->reference}";
            $entries->each(function (JournalEntry $entry) {
                $entry->lines()->delete();
                $entry->delete();
            });

            // Purana asar hata kar nayi rakam ka asar lagao.
            if ($moved !== 0) {
                $party->increment('balance', $moved);
            }
            $party->decrement('balance', $amount);

            $payment->update([
                'payment_date' => $date,
                'amount' => $amount,
                'method' => $method,
                'bank_ref' => $data['bank_ref'] ?? $payment->bank_ref,
                'notes' => $data['notes'] ?? $payment->notes,
            ]);

            $cashAccount = CashAccountResolver::code($method);
            $this->ledger->post(
                $date,
                $description,
                $isCustomer
                    ? [
                        ['account' => $cashAccount, 'debit' => $amount],
                        ['account' => Account::RECEIVABLE, 'credit' => $amount, 'memo' => $party->name],
                    ]
                    : [
                        ['account' => Account::PAYABLE, 'debit' => $amount, 'memo' => $party->name],
                        ['account' => $cashAccount, 'credit' => $amount],
                    ],
                $payment,
            );

            if ($isCustomer) {
                $this->allocator->rebuild($party->refresh());
            }

            return $payment->refresh();
        });
    }

    private function assertPositive(int $amount): void
    {
        if ($amount <= 0) {
            throw new InvalidArgumentException('Payment amount must be positive.');
        }
    }

    /**
     * Block a settlement from exceeding what is actually owed. Overpaying is how
     * money silently "disappears" (balance goes negative untracked), to give
     * more than the dues, the explicit Advance flow must be used instead.
     */
    private function assertWithinOutstanding(int $amount, int $outstanding): void
    {
        if ($outstanding <= 0) {
            throw ValidationException::withMessages([
                'amount' => 'Iska koi baqi nahi, sab clear hai. Zyada dena ho to "Advance" ka option use karein.',
            ]);
        }
        if ($amount > $outstanding) {
            throw ValidationException::withMessages([
                'amount' => 'Baqi sirf '.Money::format($outstanding).' hai, us se zyada "Pay" nahi ho sakta. Zyada dena ho to "Advance" ka option use karein.',
            ]);
        }
    }
}
