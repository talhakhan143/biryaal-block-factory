<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasTableQuery;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use OwenIt\Auditing\Models\Audit;

class AuditController extends Controller
{
    use HasTableQuery;

    public function index(Request $request)
    {
        $query = Audit::query()
            ->with('user')
            ->when($request->event, fn ($q, $e) => $q->where('event', $e));

        $this->applyTableQuery($query, $request, ['created_at', 'event', 'auditable_type'], ['event', 'auditable_type'], 'created_at', ['user' => ['name']]);

        $audits = $query->paginate($request->integer('per_page', 30));

        $audits->getCollection()->transform(fn (Audit $a) => [
            'id' => $a->id,
            'event' => $a->event,
            'model' => class_basename($a->auditable_type),
            'user' => $a->user?->name ?? 'System',
            'old_values' => $a->old_values,
            'new_values' => $a->new_values,
            'created_at' => $a->created_at,
        ]);

        return response()->json([
            'data' => $audits->getCollection(),
            'meta' => [
                'current_page' => $audits->currentPage(),
                'last_page' => $audits->lastPage(),
                'total' => $audits->total(),
            ],
        ]);
    }
}
