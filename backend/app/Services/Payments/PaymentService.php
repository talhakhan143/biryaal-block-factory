<?php

namespace App\Services\Payments;

use App\Models\Account;
use App\Models\Customer;
use App\Models\Driver;
use App\Models\JournalEntry;
use App\Models\JournalLine;
use App\Models\MaterialPurchase;
use App\Models\Payment;
use App\Models\Salary;
use App\Models\Sale;
use App\Models\Supplier;
use App\Models\TransportTrip;
use App\Services\Accounting\CashAccountResolver;
use App\Services\Accounting\LedgerService;
use App\Services\Sales\InvoiceAllocator;
use App\Support\Money;
use App\Support\Sequence;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

class PaymentService
{
    private const NO_PARTY = 'Is payment ka banda hi nahi mila, is liye yahan se kuch badla nahi ja sakta.';

    private const NO_BILL = 'Jis bill ka ye paisa tha wo bill hi nahi mila, is liye yahan se kuch badla nahi ja sakta. Pehle wo bill theek karein.';

    private const UNKNOWN_BILL = 'Is kism ke bill ka paisa yahan se nahi badla ja sakta.';

    private const MISMATCH = 'Is payment ka khata aur bill aik doosre se mail nahi khate, is liye yahan se kuch badla nahi ja sakta. Accountant ko dikhayein.';

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
     * Is row par Edit aur Rollback ke button lagenge ya nahi, aur nahi to kyun.
     *
     * Aik hi jagah se jawab aata hai taake UI aur API kabhi alag baat na karein.
     * Yahan sirf wo jaanch hai jo har row par sasti parti hai: banda mojood hai,
     * bill mojood hai, aur is kism ka bill hum wapas kholna jante hain. Gehri
     * jaanch (khata aur bill ka milan) edit ke waqt andar hoti hai, kyunki wo
     * har row par journal parhwati hai aur list dheemi kar deti hai.
     */
    public function reverseBlockReason(Payment $payment): ?string
    {
        if (! $payment->allocatable_id) {
            return $payment->party ? null : self::NO_PARTY;
        }

        $bill = $payment->allocatable;
        if (! $bill) {
            return self::NO_BILL;
        }

        return $this->knownBill($bill) ? null : self::UNKNOWN_BILL;
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
     * Jo paisa kisi aik bill ke sath juda hai (sale ki rasid, khareed ki
     * adaigi, trip ka kiraya, tankhwa) us me aik kaam zyada hai: us bill ka
     * apna paid/balance/status bhi wahin wapas jana chahiye jahan payment se
     * pehle tha. Warna khata saaf ho jata hai magar bill par paisa para hua
     * dikhta rehta hai, aur ye farq kisi ko nazar hi nahi aata.
     *
     * Payment ka apna record Auditable hai, is liye kis ne kab rollback kiya
     * wo audit log me mehfooz reh jata hai.
     */
    public function reverse(Payment $payment): void
    {
        DB::transaction(function () use ($payment) {
            if ($reason = $this->reverseBlockReason($payment)) {
                throw new InvalidArgumentException($reason);
            }

            $party = $payment->party;
            $bill = $payment->allocatable_id ? $payment->allocatable : null;
            $moved = $this->postedEffect($payment);

            // Bill ka hisaab pehle. Agar yahan paisa likha hua hi nahi to kuch
            // aur pehle se kharab hai, aur aage barhne se bill minus me chala
            // jata, is liye wahin ruk jate hain.
            if ($bill) {
                $this->assertLedgerMatchesBill($payment, $moved);
                $this->unwindFromBill($bill, $payment);
            }

            if ($moved !== 0 && $party && $this->partyBalanceMoves($bill)) {
                $party->increment('balance', $moved);
            }

            $this->postedEntries($payment)->each(function (JournalEntry $entry) {
                $entry->lines()->delete();
                $entry->delete();
            });

            $payment->delete();

            if ($party instanceof Customer) {
                $this->allocator->rebuild($party->refresh());
            }
        });
    }

    /**
     * Galat rakam ya galat tareekh theek karna.
     *
     * Rollback karke dobara likhne ke bajae wahi record badalte hain, taake
     * parchi ka reference wahi rahe jo bande ko pehle de diya gaya tha. Andar
     * se kaam wahi hota hai: purana asar hata kar naya lagana, aur jahan paisa
     * kisi bill ka hai wahan bill ka apna hisaab bhi sath hi hilta hai.
     *
     * @param  array{payment_date?:string,amount?:int,method?:string,bank_ref?:string,notes?:string}  $data
     */
    public function update(Payment $payment, array $data): Payment
    {
        return DB::transaction(function () use ($payment, $data) {
            if ($reason = $this->reverseBlockReason($payment)) {
                throw new InvalidArgumentException($reason);
            }

            $party = $payment->party;
            $bill = $payment->allocatable_id ? $payment->allocatable : null;

            $amount = (int) ($data['amount'] ?? $payment->amount);
            $this->assertPositive($amount);

            $date = $data['payment_date'] ?? $payment->payment_date->toDateString();
            $method = $data['method'] ?? $payment->method;
            $isReceipt = $payment->direction === Payment::RECEIPT;

            $moved = $this->postedEffect($payment);

            $entries = $this->postedEntries($payment);
            $description = $entries->first()?->description ?? "Payment {$payment->reference}";
            $entries->each(function (JournalEntry $entry) {
                $entry->lines()->delete();
                $entry->delete();
            });

            // Purana asar hatao.
            if ($bill) {
                $this->assertLedgerMatchesBill($payment, $moved);
                $this->unwindFromBill($bill, $payment);
            }
            if ($moved !== 0 && $party && $this->partyBalanceMoves($bill)) {
                $party->increment('balance', $moved);
            }

            // Phir nayi rakam ka asar lagao, usi shart ke sath jo payment pehli
            // dafa likhte waqt lagti hai.
            if ($bill) {
                $this->assertFitsBill($bill, $amount);
                if ($bill instanceof MaterialPurchase && $party) {
                    // Doosri layer, bilkul payForPurchase wali: bill par jagah
                    // ho magar supplier ka khata saaf ho to paisa bahar nahi
                    // jana chahiye.
                    $this->assertWithinOutstanding($amount, (int) $party->balance);
                }
                $this->shiftBill($bill, $amount);
            }
            if ($party && $this->partyBalanceMoves($bill)) {
                $party->decrement('balance', $amount);
            }

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
                $isReceipt
                    ? [
                        ['account' => $cashAccount, 'debit' => $amount],
                        ['account' => Account::RECEIVABLE, 'credit' => $amount, 'memo' => $party?->name],
                    ]
                    : [
                        ['account' => Account::PAYABLE, 'debit' => $amount, 'memo' => $party?->name],
                        ['account' => $cashAccount, 'credit' => $amount],
                    ],
                $payment,
            );

            if ($party instanceof Customer) {
                $this->allocator->rebuild($party->refresh());
            }

            return $payment->refresh();
        });
    }

    /**
     * Is payment ki journal lines, khate se seedhi.
     *
     * @return Collection<int,JournalLine>
     */
    private function postedLines(Payment $payment): Collection
    {
        return JournalLine::query()
            ->with('account')
            ->whereHas('entry', fn ($q) => $q
                ->where('source_type', $payment->getMorphClass())
                ->where('source_id', $payment->id))
            ->get();
    }

    /**
     * Is payment ki journal entries.
     *
     * @return Collection<int,JournalEntry>
     */
    private function postedEntries(Payment $payment): Collection
    {
        return JournalEntry::where('source_type', $payment->getMorphClass())
            ->where('source_id', $payment->id)
            ->get();
    }

    /**
     * Is payment ne party ke control account par jitna paisa hilaya tha.
     *
     * Paisa aaya to hisaab 1100 par chalta hai, paisa gaya to 2000 par; har
     * payment likhne wali jagah isi tarteeb par chalti hai. Dono soorat me
     * party ka balance utna hi NEECHE gaya tha jitna control account par hila,
     * is liye yahan se wapas utna hi upar chadhta hai.
     *
     * Rakam payment ke apne column se nahi, khate se parhi jati hai: paid aur
     * balance wale column baad me allocation se badal jate hain, journal line
     * aik dafa likhi jati hai aur phir kabhi hilti nahi.
     */
    private function postedEffect(Payment $payment): int
    {
        $isReceipt = $payment->direction === Payment::RECEIPT;
        $code = $isReceipt ? Account::RECEIVABLE : Account::PAYABLE;

        return (int) $this->postedLines($payment)
            ->filter(fn (JournalLine $l) => $l->account?->code === $code)
            ->sum(fn (JournalLine $l) => $isReceipt
                ? (int) $l->credit - (int) $l->debit
                : (int) $l->debit - (int) $l->credit);
    }

    /** Jin bills ka paisa hum wapas kholna jante hain. */
    private function knownBill(Model $bill): bool
    {
        return $bill instanceof Sale
            || $bill instanceof MaterialPurchase
            || $bill instanceof TransportTrip
            || $bill instanceof Salary;
    }

    /**
     * Party ke khate par is payment ka asar tha ya nahi.
     *
     * Tankhwa ka hisaab staff ke khate par nahi chalta, salaries.balance par
     * chalta hai (staff par balance ka column hi nahi hai), is liye us ka paisa
     * hatane par staff ko kuch wapas nahi chadhana. Baqi har soorat me chadhta
     * hai.
     */
    private function partyBalanceMoves(?Model $bill): bool
    {
        return ! $bill instanceof Salary;
    }

    /** Bill ki poori rakam, jaisi us bill ko likhne wala code ginta hai. */
    private function billTotal(Model $bill): int
    {
        return match (true) {
            $bill instanceof Sale => (int) $bill->total,
            // Jis khareed ka kiraya driver ko gaya, us ka supplier bill
            // total_cost se kam hai. supplierBill() wahi farq sambhalta hai.
            $bill instanceof MaterialPurchase => $bill->supplierBill(),
            $bill instanceof TransportTrip => (int) $bill->rate,
            $bill instanceof Salary => (int) $bill->amount,
            default => throw new InvalidArgumentException(self::UNKNOWN_BILL),
        };
    }

    /** Bill par ab tak kitna paisa likha hua hai. */
    private function billPaid(Model $bill): int
    {
        return match (true) {
            $bill instanceof MaterialPurchase => (int) $bill->paid_amount,
            $bill instanceof Sale,
            $bill instanceof TransportTrip,
            $bill instanceof Salary => (int) $bill->paid,
            default => throw new InvalidArgumentException(self::UNKNOWN_BILL),
        };
    }

    /**
     * Bill ka apna hisaab hilana: $delta me plus rakam = payment lagi, minus
     * rakam = hat gayi. Har kism wahi column usi tarah chalati hai jaise us par
     * payment lagate waqt chalta hai, is liye ye alag alag likha hua hai.
     */
    private function shiftBill(Model $bill, int $delta): void
    {
        if ($bill instanceof Sale) {
            $paid = (int) $bill->paid + $delta;
            $bill->update([
                'paid' => $paid,
                'balance' => (int) $bill->total - $paid,
                'status' => $this->billStatus((int) $bill->total, $paid),
            ]);

            return;
        }

        if ($bill instanceof MaterialPurchase) {
            // Khareed par balance ka column nahi hai, bill supplierBill() se banta hai.
            $paid = (int) $bill->paid_amount + $delta;
            $bill->update([
                'paid_amount' => $paid,
                'payment_status' => $this->billStatus($bill->supplierBill(), $paid),
            ]);

            return;
        }

        if ($bill instanceof TransportTrip) {
            $paid = (int) $bill->paid + $delta;
            $bill->update([
                'paid' => $paid,
                'balance' => (int) $bill->rate - $paid,
                'status' => $this->billStatus((int) $bill->rate, $paid),
            ]);

            return;
        }

        if ($bill instanceof Salary) {
            $paid = (int) $bill->paid + $delta;
            $bill->update([
                'paid' => $paid,
                'balance' => (int) $bill->amount - $paid,
                'status' => $this->billStatus((int) $bill->amount, $paid),
            ]);

            return;
        }

        throw new InvalidArgumentException(self::UNKNOWN_BILL);
    }

    /** Bill par se is payment ka paisa utarna, pehle ye dekh kar ke wahan hai bhi. */
    private function unwindFromBill(Model $bill, Payment $payment): void
    {
        $amount = (int) $payment->amount;

        if ($this->billPaid($bill) < $amount) {
            throw new InvalidArgumentException(self::MISMATCH);
        }

        $this->shiftBill($bill, -$amount);
    }

    /**
     * Khata aur bill ka milan.
     *
     * Bill par payment ki poori rakam chadhi thi aur khate par bhi utni hi.
     * Dono aik na hon to is row ke peeche koi purani gadbad hai, aur andaze par
     * bill chhedna us gadbad ko chhupa dega.
     */
    private function assertLedgerMatchesBill(Payment $payment, int $moved): void
    {
        if ($moved !== (int) $payment->amount) {
            throw new InvalidArgumentException(self::MISMATCH);
        }
    }

    /**
     * Bill par jitni gunjaish bachi hai us se zyada nahi likha ja sakta.
     *
     * Payment pehli dafa likhte waqt rakam khud chhoti kar di jati hai, magar
     * edit par chup chaap kam karna sab se bura hoga: bande ne jo likha wo na
     * bache to usay saaf bata dena chahiye. Ye jaanch purana asar hatane ke
     * baad chalti hai, is liye gunjaish me is payment ka apna hissa shamil hai.
     */
    private function assertFitsBill(Model $bill, int $amount): void
    {
        $room = $this->billTotal($bill) - $this->billPaid($bill);

        if ($amount > $room) {
            throw ValidationException::withMessages([
                'amount' => 'Is bill par sirf '.Money::format(max($room, 0)).' ki gunjaish hai, us se zyada nahi likha ja sakta.',
            ]);
        }
    }

    private function billStatus(int $total, int $paid): string
    {
        if ($paid <= 0) {
            return 'unpaid';
        }

        return $paid >= $total ? 'paid' : 'partial';
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
