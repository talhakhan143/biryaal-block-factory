<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class ResellerSupplier extends Model
{
    use HasUuids, SoftDeletes;

    protected $fillable = ['name', 'phone', 'address', 'notes', 'balance', 'is_active'];

    protected $casts = [
        'balance' => 'integer',
        'is_active' => 'boolean',
    ];

    public function purchases(): HasMany
    {
        return $this->hasMany(ResellerPurchase::class);
    }
}
