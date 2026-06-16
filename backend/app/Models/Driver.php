<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Driver extends Model
{
    use HasUuids;

    protected $fillable = ['name', 'phone', 'license_no', 'is_active'];

    protected $casts = ['is_active' => 'boolean'];

    public function trips(): HasMany
    {
        return $this->hasMany(TransportTrip::class);
    }

    public function payments(): MorphMany
    {
        return $this->morphMany(Payment::class, 'party');
    }
}
