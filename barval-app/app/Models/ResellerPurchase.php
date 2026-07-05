<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ResellerPurchase extends Model
{
    use HasUuids;

    protected $fillable = [
        'reference', 'reseller_supplier_id', 'reseller_item_id', 'purchase_date',
        'quantity', 'unit_cost', 'transport_cost', 'loading_cost', 'unloading_cost',
        'total_cost', 'paid_amount', 'payment_status', 'bank_ref', 'notes', 'created_by',
    ];

    protected $casts = [
        'purchase_date' => 'date',
        'quantity' => 'decimal:3',
        'unit_cost' => 'integer',
        'transport_cost' => 'integer',
        'loading_cost' => 'integer',
        'unloading_cost' => 'integer',
        'total_cost' => 'integer',
        'paid_amount' => 'integer',
    ];

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(ResellerSupplier::class, 'reseller_supplier_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(ResellerItem::class, 'reseller_item_id');
    }
}
