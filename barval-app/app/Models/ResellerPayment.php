<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ResellerPayment extends Model
{
    use HasUuids;

    public const IN = 'in';   // kiraya receipt from customer
    public const OUT = 'out'; // payment to supplier

    protected $fillable = [
        'reference', 'direction', 'reseller_supplier_id', 'customer_id',
        'reseller_purchase_id', 'reseller_rental_id', 'reseller_sale_id',
        'reseller_sales_return_id', 'reseller_dispatch_id', 'payment_date', 'amount',
        'method', 'bank_ref', 'notes', 'created_by',
    ];

    protected $casts = [
        'payment_date' => 'date',
        'amount' => 'integer',
    ];

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(ResellerSupplier::class, 'reseller_supplier_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
