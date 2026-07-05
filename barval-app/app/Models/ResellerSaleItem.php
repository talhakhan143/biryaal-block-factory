<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ResellerSaleItem extends Model
{
    use HasUuids;

    protected $fillable = [
        'reseller_sale_id', 'reseller_item_id', 'quantity', 'unit_price', 'unit_cost', 'line_total',
    ];

    protected $casts = [
        'quantity' => 'decimal:3',
        'unit_price' => 'integer',
        'unit_cost' => 'integer',
        'line_total' => 'integer',
    ];

    public function sale(): BelongsTo
    {
        return $this->belongsTo(ResellerSale::class, 'reseller_sale_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(ResellerItem::class, 'reseller_item_id');
    }
}
