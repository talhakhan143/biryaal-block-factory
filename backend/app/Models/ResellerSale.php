<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ResellerSale extends Model
{
    use HasUuids;

    protected $fillable = [
        'invoice_no', 'customer_id', 'sale_date', 'type', 'subtotal', 'discount',
        'transport_fare', 'total', 'paid', 'balance', 'status', 'payment_method',
        'bank_ref', 'notes', 'created_by',
    ];

    protected $casts = [
        'sale_date' => 'date',
        'subtotal' => 'integer',
        'discount' => 'integer',
        'transport_fare' => 'integer',
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
        return $this->hasMany(ResellerSaleItem::class);
    }

    public function dispatches(): HasMany
    {
        return $this->hasMany(ResellerDispatch::class);
    }
}
