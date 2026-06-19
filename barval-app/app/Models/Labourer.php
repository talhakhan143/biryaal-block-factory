<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Labourer extends Model
{
    use HasUuids;

    protected $fillable = ['name', 'phone', 'daily_wage', 'is_active'];

    protected $casts = [
        'daily_wage' => 'integer',
        'is_active' => 'boolean',
    ];

    public function attendances(): HasMany
    {
        return $this->hasMany(Attendance::class);
    }

    public function payments(): MorphMany
    {
        return $this->morphMany(Payment::class, 'party');
    }
}
