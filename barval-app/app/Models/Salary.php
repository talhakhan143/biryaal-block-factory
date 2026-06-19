<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Salary extends Model
{
    use HasUuids;

    protected $fillable = [
        'reference', 'staff_id', 'month', 'amount', 'paid', 'balance',
        'status', 'notes', 'created_by',
    ];

    protected $casts = [
        'amount' => 'integer',
        'paid' => 'integer',
        'balance' => 'integer',
    ];

    public function staff(): BelongsTo
    {
        return $this->belongsTo(Staff::class);
    }
}
