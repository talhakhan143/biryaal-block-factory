<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

class ResellerRental extends Model
{
    use HasUuids;

    protected $fillable = [
        'reference', 'customer_id', 'item_name', 'unit', 'quantity', 'per_day_rate',
        'start_date', 'return_date', 'days', 'accrued_total', 'paid_amount', 'status',
        'notes', 'created_by',
    ];

    protected $casts = [
        'start_date' => 'date',
        'return_date' => 'date',
        'quantity' => 'decimal:3',
        'per_day_rate' => 'integer',
        'days' => 'integer',
        'accrued_total' => 'integer',
        'paid_amount' => 'integer',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** Days charged so far: frozen count if returned, else start→today inclusive. */
    public function chargeableDays(): int
    {
        if ($this->status === 'returned') {
            return (int) $this->days;
        }

        $start = $this->start_date instanceof Carbon ? $this->start_date : Carbon::parse($this->start_date);

        return $start->startOfDay()->diffInDays(Carbon::today()) + 1;
    }

    /** Running bill (paisa): days × rate × qty. Frozen once returned. */
    public function currentAccrued(): int
    {
        if ($this->status === 'returned') {
            return (int) $this->accrued_total;
        }

        return (int) round($this->chargeableDays() * (int) $this->per_day_rate * (float) $this->quantity);
    }
}
