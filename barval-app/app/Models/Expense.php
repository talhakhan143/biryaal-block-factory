<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class Expense extends Model implements AuditableContract
{
    use Auditable, HasUuids;

    protected $fillable = [
        'reference', 'expense_date', 'category', 'amount',
        'method', 'title', 'bank_ref', 'notes', 'created_by',
    ];

    protected $casts = [
        'expense_date' => 'date',
        'amount' => 'integer',
    ];
}
