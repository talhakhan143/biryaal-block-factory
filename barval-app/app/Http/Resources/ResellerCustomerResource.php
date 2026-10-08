<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A customer as Resellers Point is allowed to see them: the identity record
 * only.
 *
 * The two businesses share the `customers` table and nothing else. The factory
 * fields on CustomerResource (`balance`, `advance`) are block factory money and
 * must never ride along inside a reseller payload, so this resource exists
 * instead of reusing that one.
 */
class ResellerCustomerResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'phone' => $this->phone,
            'address' => $this->address,
        ];
    }
}
