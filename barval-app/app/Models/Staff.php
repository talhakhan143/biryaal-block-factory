<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Staff extends Model
{
    use HasUuids;

    protected $table = 'staff';

    protected $fillable = ['name', 'role', 'phone', 'monthly_salary', 'is_active'];

    protected $casts = [
        'monthly_salary' => 'integer',
        'is_active' => 'boolean',
    ];

    public function salaries(): HasMany
    {
        return $this->hasMany(Salary::class);
    }
}
