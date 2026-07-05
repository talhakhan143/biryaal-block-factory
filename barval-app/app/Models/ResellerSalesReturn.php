<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ResellerSalesReturn extends Model
{
    use HasUuids;

    protected $fillable = [
        'reference', 'reseller_sale_id', 'customer_id', 'return_date', 'return_value',
        'deduction', 'refund_amount', 'refund_mode', 'notes', 'created_by',
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
        return $this->hasMany(ResellerSalesReturnItem::class);
    }
}
