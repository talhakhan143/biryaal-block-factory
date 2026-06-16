<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class Payment extends Model implements AuditableContract
{
    use Auditable, HasUuids;

    public const RECEIPT = 'receipt';   // money in from customer
    public const PAYMENT = 'payment';   // money out to supplier

    protected $fillable = [
        'reference', 'direction', 'party_type', 'party_id', 'payment_date',
        'amount', 'method', 'bank_ref', 'allocatable_type', 'allocatable_id',
        'notes', 'created_by',
    ];

    protected $casts = [
        'payment_date' => 'date',
        'amount' => 'integer',
    ];

    public function party(): MorphTo
    {
        return $this->morphTo();
    }

    public function allocatable(): MorphTo
    {
        return $this->morphTo();
    }
}
