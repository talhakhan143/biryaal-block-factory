<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Resellers Point ke paise ki aik entry.
 *
 * Shape jaan bujh kar factory wale PaymentResource jaisa rakha hai, taake
 * chhapne wali parchi dono taraf aik hi component se bane. Books phir bhi
 * bilkul alag hain: ye row sirf reseller ki apni hai.
 */
class ResellerPaymentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'direction' => $this->direction,
            'party_name' => $this->supplier?->name ?? $this->customer?->name ?? null,
            'payment_date' => $this->payment_date?->toDateString(),
            'amount' => (int) $this->amount,
            'method' => $this->method,
            'bank_ref' => $this->bank_ref,
            'notes' => $this->notes,
            // Kis sauday ka paisa hai. Parchi par likha jata hai.
            'against' => $this->against(),
            'created_at' => $this->created_at,
        ];
    }

    /** @return array{type:string,reference:?string}|null */
    private function against(): ?array
    {
        foreach ([
            'ResellerSale' => ['reseller_sale_id', 'sale'],
            'ResellerPurchase' => ['reseller_purchase_id', 'purchase'],
            'ResellerRental' => ['reseller_rental_id', 'rental'],
            'ResellerSalesReturn' => ['reseller_sales_return_id', 'salesReturn'],
        ] as $type => [$column, $relation]) {
            if ($this->{$column}) {
                $doc = $this->relationLoaded($relation) ? $this->{$relation} : null;

                return ['type' => $type, 'reference' => $doc?->reference ?? $doc?->invoice_no];
            }
        }

        return null;
    }
}
