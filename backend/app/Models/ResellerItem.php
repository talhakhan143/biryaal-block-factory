<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ResellerItem extends Model
{
    use HasUuids;

    protected $fillable = [
        'name', 'unit', 'sale_price', 'avg_cost', 'stock_qty', 'low_stock_threshold', 'is_active',
    ];

    protected $casts = [
        'sale_price' => 'integer',
        'avg_cost' => 'integer',
        'stock_qty' => 'decimal:3',
        'low_stock_threshold' => 'decimal:3',
        'is_active' => 'boolean',
    ];

    public function purchases(): HasMany
    {
        return $this->hasMany(ResellerPurchase::class);
    }
}
