<?php

namespace App\Http\Resources;

use App\Services\Payments\PaymentService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PaymentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        // Jawab service se aata hai, yahan se nahi. Pehle yahan apni shart
        // likhi hui thi aur UI wo button chhupa deti thi jo backend khushi se
        // chala deta, is liye dono baat aik hi jagah se nikalti hai.
        $blocked = app(PaymentService::class)->reverseBlockReason($this->resource);

        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'direction' => $this->direction,
            'party_type' => class_basename($this->party_type),
            'party_id' => $this->party_id,
            'party_name' => $this->whenLoaded('party', fn () => $this->party?->name),
            // Kis sauday ka paisa hai. Receipt par ye likha jata hai, warna
            // bande ko pata nahi chalta ke ye rasid kis bill ki hai.
            'against' => $this->when((bool) $this->allocatable_type, fn () => [
                'type' => class_basename($this->allocatable_type),
                'reference' => $this->allocatable?->reference ?? $this->allocatable?->invoice_no,
            ]),
            'payment_date' => $this->payment_date?->toDateString(),
            'amount' => (int) $this->amount,
            'method' => $this->method,
            'bank_ref' => $this->bank_ref,
            // Kisi aik bill se juda paisa bhi yahan se theek hota hai, bill ka
            // apna hisaab sath hi wapas jata hai.
            'can_rollback' => $blocked === null,
            // Jahan na ho sake wahan wajah bhi sath jati hai, taake bande ko
            // khali ghayab button na dikhe.
            'rollback_block' => $blocked,
            'notes' => $this->notes,
            'created_at' => $this->created_at,
        ];
    }
}
