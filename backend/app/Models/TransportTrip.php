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

    protected $fillable = [
        'reference', 'vehicle_id', 'driver_id', 'dispatch_id', 'trip_date',
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
}
