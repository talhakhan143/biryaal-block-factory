<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class SalesReturn extends Model implements AuditableContract
{
    use Auditable, HasUuids;

    protected $fillable = [
        'reference', 'sale_id', 'customer_id', 'return_date', 'return_value',
        'deduction', 'refund_amount', 'refund_mode', 'bank_ref', 'notes', 'created_by',
    ];

    protected $casts = [
        'return_date' => 'date',
        'return_value' => 'integer',
        'deduction' => 'integer',
        'refund_amount' => 'integer',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(SalesReturnItem::class);
    }
}
