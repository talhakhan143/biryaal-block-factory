<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class Dispatch extends Model implements AuditableContract
{
    use Auditable, HasUuids;

    protected $fillable = [
        'reference', 'customer_id', 'sale_id', 'vehicle_id', 'driver_id',
        'dispatch_date', 'status', 'notes', 'created_by',
    ];

    protected $casts = ['dispatch_date' => 'date'];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(DispatchItem::class);
    }

    /** Jis bill ki ye delivery hai. */
    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    /** Is delivery ka kiraya. Challan ke sath yehi driver ko dena banta hai. */
    public function trip(): HasOne
    {
        return $this->hasOne(TransportTrip::class);
    }
}
