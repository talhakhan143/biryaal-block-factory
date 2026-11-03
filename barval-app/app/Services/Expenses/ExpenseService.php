<?php

namespace App\Services\Expenses;

use App\Models\Account;
use App\Models\Expense;
use App\Models\JournalEntry;
use App\Models\JournalLine;
use App\Services\Accounting\CashAccountResolver;
use App\Services\Accounting\LedgerService;
use App\Support\Money;
use App\Support\Sequence;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class ExpenseService
{
    public function __construct(private LedgerService $ledger) {}

    /**
     * @param  array{expense_date:string,category:string,amount:int,method?:string,title:string,notes?:string}  $data
     */
    public function record(array $data): Expense
    {
        return DB::transaction(function () use ($data) {
            $expense = Expense::create([
                'reference' => Sequence::next('EXP'),
                'expense_date' => $data['expense_date'],
                'category' => $data['category'],
                'amount' => (int) $data['amount'],
                'method' => $data['method'] ?? 'cash',
                'bank_ref' => $data['bank_ref'] ?? null,
                'title' => $data['title'],
                'notes' => $data['notes'] ?? null,
                'created_by' => Auth::id(),
            ]);

            $cashAccount = CashAccountResolver::code($data['method'] ?? 'cash');
            $this->ledger->post(
                $data['expense_date'],
                "Expense {$expense->reference} - {$expense->title}",
                [
                    ['account' => Account::EXPENSE, 'debit' => $expense->amount, 'memo' => $expense->category],
                    ['account' => $cashAccount, 'credit' => $expense->amount],
                ],
                $expense,
            );

            return $expense;
        });
    }

    /**
     * Galat likha hua kharcha theek karna.
     *
     * Rollback karke dobara likhne ke bajae wahi row badalte hain, taake parchi
     * ka reference wahi rahe jo bande ko pehle de diya gaya tha. Andar se kaam
     * wahi hota hai: purana asar khate se parh kar hatao, phir naya lagao.
     *
     * Kharche ke sath koi party ya stock nahi hilta, is liye poora asar bas us
     * ki journal entry hai: 5000 par debit aur cash/bank par credit.
     *
     * @param  array{expense_date?:string,category?:string,amount?:int,method?:string,bank_ref?:string,title?:string,notes?:string}  $data
     */
    public function update(Expense $expense, array $data): Expense
    {
        return DB::transaction(function () use ($expense, $data) {
            $amount = (int) ($data['amount'] ?? $expense->amount);
            if ($amount <= 0) {
                throw new InvalidArgumentException('Kharche ki rakam zero ya minus nahi ho sakti.');
            }

            $entries = JournalEntry::where('source_type', $expense->getMorphClass())
                ->where('source_id', $expense->id)
                ->get();

            if ($entries->isEmpty()) {
                throw new InvalidArgumentException(
                    'Is kharche ki khate me koi entry nahi mili, is liye yahan se badla nahi ja sakta. Accounts wale se check karwayein.'
                );
            }

            // Usool: purana asar row ke amount column se nahi, khate ki lines se
            // parho. Column baad me bhi badal sakta hai, line aik dafa likhi
            // jati hai aur phir hilti nahi.
            $lines = JournalLine::query()
                ->with('account')
                ->whereIn('journal_entry_id', $entries->modelKeys())
                ->get();
            $posted = (int) $lines
                ->filter(fn (JournalLine $l) => $l->account?->code === Account::EXPENSE)
                ->sum(fn (JournalLine $l) => (int) $l->debit - (int) $l->credit);

            // Khata aur row aik doosre se ulat hain to andaze se badalna sab se
            // khatarnak soorat hai: kisi ko pata bhi nahi chalega. Ruk jao.
            if ($posted !== (int) $expense->amount) {
                throw new InvalidArgumentException(
                    'Is kharche ka khata row se mel nahi khata (khate me '.Money::format($posted)
                    .', row par '.Money::format((int) $expense->amount)
                    .'), is liye yahan se badalna theek nahi. Accounts wale se check karwayein.'
                );
            }

            $entries->each(function (JournalEntry $entry) {
                $entry->lines()->delete();
                $entry->delete();
            });

            $expense->update([
                'expense_date' => $data['expense_date'] ?? $expense->expense_date->toDateString(),
                'category' => $data['category'] ?? $expense->category,
                'amount' => $amount,
                'method' => $data['method'] ?? $expense->method,
                'bank_ref' => $data['bank_ref'] ?? $expense->bank_ref,
                'title' => $data['title'] ?? $expense->title,
                'notes' => $data['notes'] ?? $expense->notes,
            ]);
            $expense->refresh();

            // Tafseel dobara banate hain, purani nahi rakhte: naam badla ho to
            // cash book me purana naam reh jata aur dono jagah alag likha hota.
            $this->ledger->post(
                $expense->expense_date->toDateString(),
                "Expense {$expense->reference} - {$expense->title}",
                [
                    ['account' => Account::EXPENSE, 'debit' => $expense->amount, 'memo' => $expense->category],
                    ['account' => CashAccountResolver::code($expense->method), 'credit' => $expense->amount],
                ],
                $expense,
            );

            return $expense;
        });
    }
}
