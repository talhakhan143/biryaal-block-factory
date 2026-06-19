<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinishedGoodsStock extends Model
{
    use HasUuids;

    protected $table = 'finished_goods_stock';

    protected $fillable = [
        'product_id', 'curing_qty', 'ready_qty', 'damaged_qty',
    ];

    protected $casts = [
        'curing_qty' => 'integer',
        'ready_qty' => 'integer',
        'damaged_qty' => 'integer',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
