<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class ProductionBatch extends Model implements AuditableContract
{
    use Auditable, HasUuids;

    protected $fillable = [
        'reference', 'product_id', 'production_date', 'shift',
        'quantity_produced', 'curing_days', 'ready_at', 'status',
        'supervisor_id', 'notes', 'created_by',
    ];

    protected $casts = [
        'production_date' => 'date',
        'ready_at' => 'date',
        'quantity_produced' => 'integer',
        'curing_days' => 'integer',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function supervisor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'supervisor_id');
    }
}
