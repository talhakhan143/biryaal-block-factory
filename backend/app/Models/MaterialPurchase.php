<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class MaterialPurchase extends Model implements AuditableContract
{
    use Auditable, HasUuids;

    protected $fillable = [
        'reference', 'supplier_id', 'raw_material_id', 'purchase_date',
        'quantity', 'unit_cost', 'transport_cost', 'loading_cost',
        'unloading_cost', 'total_cost', 'paid_amount', 'payment_status',
        'notes', 'created_by',
    ];

    protected $casts = [
        'purchase_date' => 'date',
        'quantity' => 'decimal:3',
        'unit_cost' => 'integer',
        'transport_cost' => 'integer',
        'loading_cost' => 'integer',
        'unloading_cost' => 'integer',
        'total_cost' => 'integer',
        'paid_amount' => 'integer',
    ];

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function rawMaterial(): BelongsTo
    {
        return $this->belongsTo(RawMaterial::class);
    }
}
