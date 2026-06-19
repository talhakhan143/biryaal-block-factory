<?php

namespace App\Support;

/**
 * All monetary values are stored as integer paisa (1 PKR = 100 paisa)
 * to avoid floating point rounding errors in the ledger.
 */
final class Money
{
    /** Convert a rupee value (string|int|float) to integer paisa. */
    public static function toPaisa(string|int|float $rupees): int
    {
        return (int) round(((float) $rupees) * 100);
    }

    /** Convert integer paisa to a rupee float. */
    public static function toRupees(int $paisa): float
    {
        return $paisa / 100;
    }

    /** Format paisa as a display string, e.g. "Rs 1,250.00". */
    public static function format(int $paisa, bool $symbol = true): string
    {
        $value = number_format($paisa / 100, 2);

        return $symbol ? "Rs {$value}" : $value;
    }
}
