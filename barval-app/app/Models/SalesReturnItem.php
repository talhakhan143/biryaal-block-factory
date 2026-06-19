<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SalesReturnItem extends Model
{
    use HasUuids;

    protected $fillable = ['sales_return_id', 'product_id', 'quantity', 'unit_price', 'line_total'];

    protected $casts = [
        'quantity' => 'integer',
        'unit_price' => 'integer',
        'line_total' => 'integer',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
