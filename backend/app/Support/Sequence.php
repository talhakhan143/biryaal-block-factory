<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Atomic, gap-free document number generator.
 * Must be called inside a DB transaction for the row lock to hold.
 */
final class Sequence
{
    /** e.g. next('INV') => "INV-000001" */
    public static function next(string $key, int $pad = 6): string
    {
        $row = DB::table('sequences')->where('key', $key)->lockForUpdate()->first();

        if (! $row) {
            DB::table('sequences')->insert([
                'key' => $key, 'value' => 0,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $current = 0;
        } else {
            $current = (int) $row->value;
        }

        $next = $current + 1;
        DB::table('sequences')->where('key', $key)->update([
            'value' => $next, 'updated_at' => now(),
        ]);

        return $key.'-'.str_pad((string) $next, $pad, '0', STR_PAD_LEFT);
    }
}
