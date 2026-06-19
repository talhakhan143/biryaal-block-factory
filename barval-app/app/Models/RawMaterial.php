<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class RawMaterial extends Model implements AuditableContract
{
    use Auditable, HasUuids;

    protected $fillable = [
        'name', 'unit', 'current_qty', 'low_stock_threshold', 'is_active',
    ];

    protected $casts = [
        'current_qty' => 'decimal:3',
        'low_stock_threshold' => 'decimal:3',
        'is_active' => 'boolean',
    ];

    public function purchases(): HasMany
    {
        return $this->hasMany(MaterialPurchase::class);
    }
}
