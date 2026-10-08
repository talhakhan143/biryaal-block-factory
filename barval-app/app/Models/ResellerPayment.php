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

    // Jis sauday ka paisa hai. Parchi par uska reference likha jata hai.

    public function sale(): BelongsTo
    {
        return $this->belongsTo(ResellerSale::class, 'reseller_sale_id');
    }

    public function purchase(): BelongsTo
    {
        return $this->belongsTo(ResellerPurchase::class, 'reseller_purchase_id');
    }

    public function rental(): BelongsTo
    {
        return $this->belongsTo(ResellerRental::class, 'reseller_rental_id');
    }

    public function salesReturn(): BelongsTo
    {
        return $this->belongsTo(ResellerSalesReturn::class, 'reseller_sales_return_id');
    }
}
