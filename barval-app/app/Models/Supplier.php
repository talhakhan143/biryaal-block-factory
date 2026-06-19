<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class Supplier extends Model implements AuditableContract
{
    use Auditable, HasUuids, SoftDeletes;

    protected $fillable = ['name', 'phone', 'address', 'notes', 'is_active'];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function purchases(): HasMany
    {
        return $this->hasMany(MaterialPurchase::class);
    }

    public function payments(): MorphMany
    {
        return $this->morphMany(Payment::class, 'party');
    }
}
