<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class Adjustment extends Model implements AuditableContract
{
    use Auditable, HasUuids;

    protected $fillable = [
        'reference', 'mode', 'party_type', 'party_id', 'adjustment_date',
        'amount', 'method', 'bank_ref', 'reason', 'created_by',
    ];

    protected $casts = [
        'adjustment_date' => 'date',
        'amount' => 'integer',
    ];

    public function party(): MorphTo
    {
        return $this->morphTo();
    }
}
