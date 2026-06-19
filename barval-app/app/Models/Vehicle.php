<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Vehicle extends Model
{
    use HasUuids;

    protected $fillable = ['name', 'plate', 'type', 'default_trip_rate', 'is_active'];

    protected $casts = [
        'default_trip_rate' => 'integer',
        'is_active' => 'boolean',
    ];
}
