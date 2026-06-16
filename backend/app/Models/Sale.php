<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class Sale extends Model implements AuditableContract
{
    use Auditable, HasUuids;

    protected $fillable = [
        'invoice_no', 'customer_id', 'sale_date', 'type', 'subtotal',
        'discount', 'total', 'paid', 'balance', 'status', 'payment_method',
        'bank_ref', 'notes', 'created_by',
    ];

    protected $casts = [
        'sale_date' => 'date',
        'subtotal' => 'integer',
        'discount' => 'integer',
        'total' => 'integer',
        'paid' => 'integer',
        'balance' => 'integer',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    public function dispatches(): HasMany
    {
        return $this->hasMany(Dispatch::class);
    }

    public function allocatedPayments(): MorphMany
    {
        return $this->morphMany(Payment::class, 'allocatable');
    }
}
