<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasOne;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class Product extends Model implements AuditableContract
{
    use Auditable, HasUuids;

    protected $fillable = [
        'name', 'sku', 'size', 'unit', 'default_curing_days',
        'sale_price', 'low_stock_threshold', 'is_active',
    ];

    protected $casts = [
        'sale_price' => 'integer',
        'default_curing_days' => 'integer',
        'low_stock_threshold' => 'integer',
        'is_active' => 'boolean',
    ];

    public function stock(): HasOne
    {
        return $this->hasOne(FinishedGoodsStock::class);
    }
}
