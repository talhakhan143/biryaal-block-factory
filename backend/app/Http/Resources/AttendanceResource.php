<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AttendanceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'labourer_id' => $this->labourer_id,
            'labourer_name' => $this->whenLoaded('labourer', fn () => $this->labourer->name),
            'work_date' => $this->work_date?->toDateString(),
            'status' => $this->status,
            'wage' => (int) $this->wage,
            'note' => $this->note,
        ];
    }
}
