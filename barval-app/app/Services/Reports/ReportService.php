<?php

namespace App\Services\Reports;

use App\Models\Account;
use App\Models\Attendance;
use App\Models\Expense;
use App\Models\Product;
use App\Models\ProductionBatch;
use App\Models\Sale;
use Illuminate\Support\Carbon;
use InvalidArgumentException;

/**
 * Produces report data in a uniform shape so a single PDF/Excel/JSON
 * renderer can handle every report type.
 *
 * Shape: [
 *   'title' => string, 'period' => string,
 *   'columns' => [ ['key'=>..,'label'=>..,'money'=>bool,'align'=>'left|right'] ],
 *   'rows' => [ ['key'=>value, ...] ],         // money values in paisa
 *   'summary' => [ ['label'=>..,'value'=>..,'money'=>bool] ],
 * ]
 */
class ReportService
{
    public function build(string $type, ?string $from, ?string $to): array
    {
        return match ($type) {
            'sales' => $this->sales($from, $to),
            'production' => $this->production($from, $to),
            'expenses' => $this->expenses($from, $to),
            'inventory' => $this->inventory(),
            'labour' => $this->labour($from, $to),
            'profit-loss' => $this->profitLoss($from, $to),
            default => throw new InvalidArgumentException("Unknown report: {$type}"),
        };
    }

    private function period(?string $from, ?string $to): string
    {
        if (! $from && ! $to) {
            return 'All time';
        }

        return ($from ?? '…').' to '.($to ?? Carbon::today()->toDateString());
    }

    private function sales(?string $from, ?string $to): array
    {
        $sales = Sale::with('customer')
            ->when($from, fn ($q, $d) => $q->whereDate('sale_date', '>=', $d))
            ->when($to, fn ($q, $d) => $q->whereDate('sale_date', '<=', $d))
            ->orderBy('sale_date')
            ->get();

        $rows = $sales->map(fn (Sale $s) => [
            'date' => $s->sale_date->toDateString(),
            'invoice' => $s->invoice_no,
            'customer' => $s->customer?->name ?? 'Walk-in',
            'type' => ucfirst($s->type),
            'total' => (int) $s->total,
            'paid' => (int) $s->paid,
            'balance' => (int) $s->balance,
        ])->all();

        return [
            'title' => 'Sales Report',
            'period' => $this->period($from, $to),
            'columns' => [
                ['key' => 'date', 'label' => 'Date'],
                ['key' => 'invoice', 'label' => 'Invoice'],
                ['key' => 'customer', 'label' => 'Customer'],
                ['key' => 'type', 'label' => 'Type'],
                ['key' => 'total', 'label' => 'Total', 'money' => true, 'align' => 'right'],
                ['key' => 'paid', 'label' => 'Paid', 'money' => true, 'align' => 'right'],
                ['key' => 'balance', 'label' => 'Balance', 'money' => true, 'align' => 'right'],
            ],
            'rows' => $rows,
            'summary' => [
                ['label' => 'Invoices', 'value' => $sales->count()],
                ['label' => 'Total Sales', 'value' => (int) $sales->sum('total'), 'money' => true],
                ['label' => 'Received', 'value' => (int) $sales->sum('paid'), 'money' => true],
                ['label' => 'Outstanding', 'value' => (int) $sales->sum('balance'), 'money' => true],
            ],
        ];
    }

    private function production(?string $from, ?string $to): array
    {
        $batches = ProductionBatch::with('product')
            ->when($from, fn ($q, $d) => $q->whereDate('production_date', '>=', $d))
            ->when($to, fn ($q, $d) => $q->whereDate('production_date', '<=', $d))
            ->orderBy('production_date')
            ->get();

        $rows = $batches->map(fn (ProductionBatch $b) => [
            'date' => $b->production_date->toDateString(),
            'reference' => $b->reference,
            'product' => $b->product?->name,
            'shift' => ucfirst($b->shift),
            'quantity' => (int) $b->quantity_produced,
            'status' => ucfirst($b->status),
        ])->all();

        return [
            'title' => 'Production Report',
            'period' => $this->period($from, $to),
            'columns' => [
                ['key' => 'date', 'label' => 'Date'],
                ['key' => 'reference', 'label' => 'Ref'],
                ['key' => 'product', 'label' => 'Product'],
                ['key' => 'shift', 'label' => 'Shift'],
                ['key' => 'quantity', 'label' => 'Qty', 'align' => 'right'],
                ['key' => 'status', 'label' => 'Status'],
            ],
            'rows' => $rows,
            'summary' => [
                ['label' => 'Batches', 'value' => $batches->count()],
                ['label' => 'Total Produced', 'value' => (int) $batches->sum('quantity_produced')],
            ],
        ];
    }

    private function expenses(?string $from, ?string $to): array
    {
        $expenses = Expense::query()
            ->when($from, fn ($q, $d) => $q->whereDate('expense_date', '>=', $d))
            ->when($to, fn ($q, $d) => $q->whereDate('expense_date', '<=', $d))
            ->orderBy('expense_date')
            ->get();

        $rows = $expenses->map(fn (Expense $e) => [
            'date' => $e->expense_date->toDateString(),
            'reference' => $e->reference,
            'category' => ucfirst($e->category),
            'title' => $e->title,
            'amount' => (int) $e->amount,
        ])->all();

        return [
            'title' => 'Expense Report',
            'period' => $this->period($from, $to),
            'columns' => [
                ['key' => 'date', 'label' => 'Date'],
                ['key' => 'reference', 'label' => 'Ref'],
                ['key' => 'category', 'label' => 'Category'],
                ['key' => 'title', 'label' => 'Title'],
                ['key' => 'amount', 'label' => 'Amount', 'money' => true, 'align' => 'right'],
            ],
            'rows' => $rows,
            'summary' => [
                ['label' => 'Entries', 'value' => $expenses->count()],
                ['label' => 'Total Expense', 'value' => (int) $expenses->sum('amount'), 'money' => true],
            ],
        ];
    }

    private function inventory(): array
    {
        $products = Product::with('stock')->orderBy('name')->get();

        $rows = $products->map(fn (Product $p) => [
            'product' => $p->name,
            'curing' => (int) ($p->stock->curing_qty ?? 0),
            'ready' => (int) ($p->stock->ready_qty ?? 0),
            'damaged' => (int) ($p->stock->damaged_qty ?? 0),
        ])->all();

        return [
            'title' => 'Inventory Report (Finished Goods)',
            'period' => Carbon::now()->toDayDateTimeString(),
            'columns' => [
                ['key' => 'product', 'label' => 'Product'],
                ['key' => 'curing', 'label' => 'Curing', 'align' => 'right'],
                ['key' => 'ready', 'label' => 'Ready', 'align' => 'right'],
                ['key' => 'damaged', 'label' => 'Damaged', 'align' => 'right'],
            ],
            'rows' => $rows,
            'summary' => [
                ['label' => 'Total Ready', 'value' => (int) collect($rows)->sum('ready')],
                ['label' => 'Total Curing', 'value' => (int) collect($rows)->sum('curing')],
            ],
        ];
    }

    private function labour(?string $from, ?string $to): array
    {
        $rows = Attendance::with('labourer')
            ->when($from, fn ($q, $d) => $q->whereDate('work_date', '>=', $d))
            ->when($to, fn ($q, $d) => $q->whereDate('work_date', '<=', $d))
            ->orderBy('work_date')
            ->get();

        $data = $rows->map(fn (Attendance $a) => [
            'date' => $a->work_date->toDateString(),
            'labourer' => $a->labourer?->name,
            'status' => ucfirst($a->status),
            'wage' => (int) $a->wage,
        ])->all();

        return [
            'title' => 'Labour Report',
            'period' => $this->period($from, $to),
            'columns' => [
                ['key' => 'date', 'label' => 'Date'],
                ['key' => 'labourer', 'label' => 'Labourer'],
                ['key' => 'status', 'label' => 'Status'],
                ['key' => 'wage', 'label' => 'Wage', 'money' => true, 'align' => 'right'],
            ],
            'rows' => $data,
            'summary' => [
                ['label' => 'Attendance Entries', 'value' => $rows->count()],
                ['label' => 'Present Days', 'value' => $rows->where('status', 'present')->count()],
                ['label' => 'Total Wages', 'value' => (int) $rows->sum('wage'), 'money' => true],
            ],
        ];
    }

    private function profitLoss(?string $from, ?string $to): array
    {
        $income = $this->accountNet(Account::SALES, $from, $to, 'credit');
        $expense = $this->accountNet(Account::EXPENSE, $from, $to, 'debit');

        return [
            'title' => 'Profit & Loss',
            'period' => $this->period($from, $to),
            'columns' => [
                ['key' => 'item', 'label' => 'Item'],
                ['key' => 'amount', 'label' => 'Amount', 'money' => true, 'align' => 'right'],
            ],
            'rows' => [
                ['item' => 'Income (Sales)', 'amount' => $income],
                ['item' => 'Less: Operating Expenses', 'amount' => $expense],
            ],
            'summary' => [
                ['label' => 'Net Profit', 'value' => $income - $expense, 'money' => true],
            ],
        ];
    }

    private function accountNet(string $code, ?string $from, ?string $to, string $side): int
    {
        $account = Account::where('code', $code)->first();
        if (! $account) {
            return 0;
        }

        $query = $account->lines()->whereHas('entry', function ($q) use ($from, $to) {
            $q->when($from, fn ($q, $d) => $q->whereDate('entry_date', '>=', $d))
                ->when($to, fn ($q, $d) => $q->whereDate('entry_date', '<=', $d));
        });

        return $side === 'credit'
            ? (int) $query->sum('credit') - (int) $query->sum('debit')
            : (int) $query->sum('debit') - (int) $query->sum('credit');
    }
}
