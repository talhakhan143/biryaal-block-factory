<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ResellerSalesReturnItem extends Model
{
    use HasUuids;

    protected $fillable = ['reseller_sales_return_id', 'reseller_item_id', 'quantity', 'unit_price', 'line_total'];

    protected $casts = [
        'quantity' => 'decimal:3',
        'unit_price' => 'integer',
        'line_total' => 'integer',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(ResellerItem::class, 'reseller_item_id');
    }
}
