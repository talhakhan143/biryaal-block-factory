<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class MaterialPurchase extends Model implements AuditableContract
{
    use Auditable, HasUuids;

    protected $fillable = [
        'reference', 'supplier_id', 'raw_material_id', 'purchase_date',
        'quantity', 'unit_cost', 'transport_cost', 'loading_cost',
        'unloading_cost', 'total_cost', 'paid_amount', 'payment_status',
        'bank_ref', 'notes', 'created_by',
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

    /** Inbound freight trip, when a driver was assigned to bring this material. */
    public function trip(): HasOne
    {
        return $this->hasOne(TransportTrip::class);
    }

    /**
     * What the SUPPLIER is owed, which is not always the landed cost.
     *
     * `total_cost` always carries the full landed cost (material + kiraya +
     * loading) because that is what the material really cost us. But when a
     * driver was assigned, the kiraya is owed to that driver, not to the
     * supplier, so it comes out of the supplier's bill.
     */
    public function supplierBill(): int
    {
        $freightToDriver = $this->relationLoaded('trip') ? $this->trip !== null : $this->trip()->exists();

        return (int) $this->total_cost - ($freightToDriver ? (int) $this->transport_cost : 0);
    }
}
