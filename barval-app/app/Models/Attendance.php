<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Attendance extends Model
{
    use HasUuids;

    protected $fillable = [
        'labourer_id', 'work_date', 'status', 'wage', 'note', 'created_by',
    ];

    protected $casts = [
        'work_date' => 'date',
        'wage' => 'integer',
    ];

    public function labourer(): BelongsTo
    {
        return $this->belongsTo(Labourer::class);
    }
}
