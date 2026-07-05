<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ResellerDispatchItem extends Model
{
    use HasUuids;

    protected $fillable = ['reseller_dispatch_id', 'reseller_item_id', 'quantity'];

    protected $casts = ['quantity' => 'decimal:3'];

    public function dispatch(): BelongsTo
    {
        return $this->belongsTo(ResellerDispatch::class, 'reseller_dispatch_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(ResellerItem::class, 'reseller_item_id');
    }
}
