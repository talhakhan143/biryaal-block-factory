<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ResellerDispatch extends Model
{
    use HasUuids;

    protected $fillable = [
        'reference', 'reseller_sale_id', 'customer_id', 'driver_id', 'vehicle_id',
        'trip_rate', 'trip_paid', 'dispatch_date', 'status', 'delivered_at', 'notes', 'created_by',
    ];

    protected $casts = [
        'dispatch_date' => 'date',
        'delivered_at' => 'datetime',
        'trip_rate' => 'integer',
        'trip_paid' => 'integer',
    ];

    public function sale(): BelongsTo
    {
        return $this->belongsTo(ResellerSale::class, 'reseller_sale_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(ResellerDispatchItem::class);
    }
}
