<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use OwenIt\Auditing\Auditable;
use OwenIt\Auditing\Contracts\Auditable as AuditableContract;

class TransportTrip extends Model implements AuditableContract
{
    use Auditable, HasUuids;

    /** Maal bahar bheja (customer ko). */
    public const OUTBOUND = 'out';

    /** Maal andar aaya (supplier se factory tak). */
    public const INBOUND = 'in';

    protected $fillable = [
        'reference', 'vehicle_id', 'vehicle_label', 'driver_id', 'dispatch_id', 'material_purchase_id', 'kind', 'trip_date',
        'from_location', 'to_location', 'rate', 'paid', 'balance', 'status',
        'notes', 'created_by',
    ];

    protected $casts = [
        'trip_date' => 'date',
        'rate' => 'integer',
        'paid' => 'integer',
        'balance' => 'integer',
    ];

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    /** Inbound trip: the purchase whose material this driver brought in. */
    public function materialPurchase(): BelongsTo
    {
        return $this->belongsTo(MaterialPurchase::class);
    }
}
