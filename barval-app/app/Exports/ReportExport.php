<?php

namespace App\Exports;

use App\Support\Money;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithTitle;

/**
 * Turns a ReportService structure into an Excel sheet.
 * Money columns are formatted to rupee values.
 */
class ReportExport implements FromArray, WithHeadings, WithTitle
{
    public function __construct(private array $report) {}

    public function title(): string
    {
        return substr($this->report['title'] ?? 'Report', 0, 28);
    }

    public function headings(): array
    {
        return array_map(fn ($c) => $c['label'], $this->report['columns']);
    }

    public function array(): array
    {
        $columns = $this->report['columns'];
        $rows = array_map(function ($row) use ($columns) {
            return array_map(function ($col) use ($row) {
                $value = $row[$col['key']] ?? '';
                if (! empty($col['money']) && is_numeric($value)) {
                    return Money::toRupees((int) $value);
                }

                return $value;
            }, $columns);
        }, $this->report['rows']);

        // append summary rows
        foreach ($this->report['summary'] ?? [] as $s) {
            $value = ! empty($s['money']) ? Money::toRupees((int) $s['value']) : $s['value'];
            $line = array_fill(0, max(1, count($columns) - 1), '');
            $line[0] = $s['label'];
            $line[count($columns) - 1] = $value;
            $rows[] = $line;
        }

        return $rows;
    }
}
